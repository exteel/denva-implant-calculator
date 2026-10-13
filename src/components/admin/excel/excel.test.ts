// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CARD_FIELDS, COLUMNS, TIER_LABELS } from "./columns";
import {
  clientRejected,
  matchCity,
  normalizeCurrency,
  parseBool,
  parseDate,
  parseNumber,
  parseTemplateFile,
  parseTemplateSheet,
  parseTier,
  toImportPayload,
  type RawSheet,
} from "./parse";
import { buildPriceSheet, generateTemplateBlob } from "./template";

const SERVICES = [
  { service_code: "IMPLANT_INSTALL", tiered: true },
  { service_code: "SCAN_BOTH", tiered: false },
];

/** Builds a filled-in sheet in the template layout (card + header + rows). */
function sheetWith(rows: Array<Record<string, unknown>>, card: Record<string, unknown> = {}): RawSheet {
  const cardValues: Record<string, unknown> = {
    "Назва клініки": "Dent Plus",
    Місто: "Львів",
    Контакти: "+380 32 000 00 00",
    "Дата чинності прайсу": "01.10.2026",
    "Валюта прайсу": "UAH",
    "Підтвердження достовірності": "Так",
    ...card,
  };
  const sheet: RawSheet = [["DENVA шаблон цін клініки"], []];
  for (const [k, v] of Object.entries(cardValues)) sheet.push([k, v as never]);
  sheet.push([]);
  sheet.push(COLUMNS.map((c) => c.header));
  for (const r of rows) sheet.push(COLUMNS.map((c) => (r[c.header] ?? null) as never));
  return sheet;
}

describe("cell helpers", () => {
  it("parses numbers in Ukrainian formats", () => {
    expect(parseNumber(1200)).toEqual({ value: 1200, invalid: false });
    expect(parseNumber("1 200,50")).toEqual({ value: 1200.5, invalid: false });
    expect(parseNumber(" 12 000")).toEqual({ value: 12000, invalid: false });
    expect(parseNumber(null)).toEqual({ value: null, invalid: false });
    expect(parseNumber("від 100")).toEqual({ value: null, invalid: true });
  });

  it("parses booleans, tiers, currencies and dates", () => {
    expect(parseBool("Так")).toBe(true);
    expect(parseBool("ні")).toBe(false);
    expect(parseBool("можливо")).toBeNull();
    expect(parseTier("Преміальний")).toBe("premium");
    expect(parseTier(" спільний ")).toBe("common");
    expect(parseTier("classic")).toBe("classic");
    expect(parseTier("")).toBeNull();
    expect(parseTier("Золотий")).toBeUndefined();
    expect(normalizeCurrency("грн")).toBe("UAH");
    expect(normalizeCurrency("€")).toBe("EUR");
    expect(parseDate("05.10.2026")).toBe("2026-10-05");
    expect(parseDate(new Date(Date.UTC(2026, 9, 5)))).toBe("2026-10-05");
    expect(parseDate("31.02.2026")).toBe("invalid");
    expect(parseDate(null)).toBeNull();
  });

  it("matches a city by name or alias", () => {
    const cities = [
      { id: "1", name: "Львів", aliases: ["Lviv"] },
      { id: "2", name: "Київ", aliases: null },
    ];
    expect(matchCity(" львів ", cities)?.id).toBe("1");
    expect(matchCity("LVIV", cities)?.id).toBe("1");
    expect(matchCity("Одеса", cities)).toBeNull();
  });
});

describe("parseTemplateSheet", () => {
  it("maps rows, fixed price and range, Ukrainian tiers", () => {
    const parsed = parseTemplateSheet(
      sheetWith([
        {
          "Назва у прайсі": "Імплант Osstem",
          "Бренд / матеріал": "Osstem",
          "Ціна від": 14000,
          "Що входить у ціну": "імплант + встановлення",
          "Стандартний код (service_code)": "implant_install",
          Рівень: "Класичний",
        },
        {
          "Назва у прайсі": "Коронка",
          "Ціна від": "9 000",
          "Ціна до": 11000,
          Валюта: "грн",
          "Що входить у ціну": "цирконій",
        },
      ]),
      { services: SERVICES },
    );
    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.cardErrors).toEqual([]);
    expect(parsed.card).toMatchObject({
      name: "Dent Plus",
      city_name: "Львів",
      valid_from: "2026-10-01",
      currency: "UAH",
      confirmed: true,
    });
    expect(parsed.rows).toHaveLength(2);
    const [a, b] = parsed.rows;
    expect(a.row).toMatchObject({
      row_number: 11,
      offer_name: "Імплант Osstem",
      price_from: 14000,
      price_to: null, // empty "Ціна до" = fixed price
      service_code: "IMPLANT_INSTALL",
      tier: "classic",
      currency: "UAH",
    });
    expect(a.errors).toEqual([]);
    expect(b.row).toMatchObject({ price_from: 9000, price_to: 11000, service_code: null, tier: null });
    expect(b.errors).toEqual([]);
  });

  it("flags row errors and still skips empty rows", () => {
    const parsed = parseTemplateSheet(
      sheetWith([
        { "Назва у прайсі": "Без ціни", "Що входить у ціну": "x" },
        { "Назва у прайсі": "Нуль", "Ціна від": 0 },
        { "Назва у прайсі": "Навпаки", "Ціна від": 500, "Ціна до": 100 },
        { "Назва у прайсі": "Валюта", "Ціна від": 5, Валюта: "RUB" },
        { "Назва у прайсі": "Рівень", "Ціна від": 5, Рівень: "Золотий" },
        { "Ціна від": 5 },
        {},
      ]),
    );
    expect(parsed.rows).toHaveLength(6);
    expect(parsed.rows[0].errors[0]).toMatch(/Ціна від/);
    expect(parsed.rows[1].errors[0]).toMatch(/більшою за нуль/);
    expect(parsed.rows[2].errors[0]).toMatch(/не може бути меншою/);
    expect(parsed.rows[3].errors[0]).toMatch(/RUB/);
    expect(parsed.rows[4].errors[0]).toMatch(/Золотий/);
    expect(parsed.rows[5].errors[0]).toMatch(/назву у прайсі/);
    expect(clientRejected(parsed)).toHaveLength(6);
  });

  it("cross-checks service catalogue, warns on duplicates and missing composition", () => {
    const parsed = parseTemplateSheet(
      sheetWith([
        { "Назва у прайсі": "A", "Ціна від": 1, "Стандартний код (service_code)": "SCAN_BOTH" },
        { "Назва у прайсі": "B", "Ціна від": 1, "Що входить у ціну": "x", "Стандартний код (service_code)": "NOPE" },
        { "Назва у прайсі": "C", "Ціна від": 1, "Що входить у ціну": "x", "Стандартний код (service_code)": "IMPLANT_INSTALL", Рівень: "Мінімальний" },
        { "Назва у прайсі": "D", "Ціна від": 1, "Що входить у ціну": "x", "Стандартний код (service_code)": "IMPLANT_INSTALL", Рівень: "Мінімальний" },
        { "Назва у прайсі": "E", "Ціна від": 1, "Що входить у ціну": "x", "Стандартний код (service_code)": "IMPLANT_INSTALL" },
      ]),
      { services: SERVICES },
    );
    expect(parsed.rows[0].row.tier).toBe("common"); // untiered service defaults to common
    expect(parsed.rows[0].warnings.join(" ")).toMatch(/склад/);
    expect(parsed.rows[1].warnings.join(" ")).toMatch(/Невідомий service_code/);
    expect(parsed.rows[3].warnings.join(" ")).toMatch(/Дубль/);
    expect(parsed.rows[4].warnings.join(" ")).toMatch(/потрібен рівень/);
    expect(parsed.rows.every((r) => r.errors.length === 0)).toBe(true);
  });

  it("validates the clinic card", () => {
    const parsed = parseTemplateSheet(
      sheetWith([{ "Назва у прайсі": "A", "Ціна від": 1 }], {
        "Назва клініки": "",
        Місто: "",
        "Дата чинності прайсу": "вчора",
        "Валюта прайсу": "PLN",
        "Підтвердження достовірності": "",
      }),
    );
    expect(parsed.cardErrors.join(" ")).toMatch(/назву клініки/);
    expect(parsed.cardErrors.join(" ")).toMatch(/місто/);
    expect(parsed.cardErrors.join(" ")).toMatch(/ДД.ММ.РРРР/);
    expect(parsed.cardErrors.join(" ")).toMatch(/PLN/);
    expect(parsed.cardWarnings.join(" ")).toMatch(/не підтвердила/);
  });

  it("reports a missing header row and an empty table", () => {
    expect(parseTemplateSheet([["щось інше"]]).fileErrors[0]).toMatch(/заголовків/);
    expect(parseTemplateSheet(sheetWith([])).fileErrors[0]).toMatch(/жодного рядка/);
  });

  it("builds an ImportPayload without client-rejected rows", () => {
    const parsed = parseTemplateSheet(
      sheetWith([
        { "Назва у прайсі": "OK", "Ціна від": 100, "Що входить у ціну": "x" },
        { "Назва у прайсі": "Bad", "Ціна від": -1 },
      ]),
    );
    const payload = toImportPayload(parsed, { fileName: "a.xlsx", cityId: "city-1", clinicId: null });
    expect(payload.file_name).toBe("a.xlsx");
    expect(payload.clinic).toEqual({
      clinic_id: null,
      name: "Dent Plus",
      city_id: "city-1",
      contacts: "+380 32 000 00 00",
      valid_from: "2026-10-01",
      currency: "UAH",
    });
    expect(payload.rows.map((r) => r.offer_name)).toEqual(["OK"]);
  });

  it("reads moderation columns", () => {
    const parsed = parseTemplateSheet(
      sheetWith([
        { "Назва у прайсі": "A", "Ціна від": 1, Статус: "На перевірці", "Допуск до агрегації": "Ні", "Причина виключення": "акція" },
      ]),
    );
    expect(parsed.rows[0].moderation).toEqual({ status: "На перевірці", include_in_aggregate: false, exclude_reason: "акція" });
  });
});

describe("template generation", () => {
  it("lays out card, blocks and header", () => {
    const sheet = buildPriceSheet();
    const flat = sheet.flat().map((c) => (c && typeof c === "object" && "value" in c ? c.value : c));
    for (const f of CARD_FIELDS) expect(flat).toContain(f.label);
    for (const c of COLUMNS) expect(flat).toContain(c.header);
    expect(flat).toContain("Фактична пропозиція (заповнює клініка)");
    expect(flat).toContain("Модерація (заповнює DENVA)");
  });

  it("round-trips: generated xlsx → parsed template with the card and no rows", async () => {
    const blob = await generateTemplateBlob({
      card: { name: "Round Trip", city: "Київ", currency: "EUR", confirmation: "Так", valid_from: new Date(Date.UTC(2026, 9, 13)) },
      services: [{ service_code: "SCAN_BOTH", name: "Скан", tiered: false }],
    });
    expect(blob.size).toBeGreaterThan(1000);
    const parsed = await parseTemplateFile(blob);
    // blank template: header found, card read back, but no offer rows yet
    expect(parsed.fileErrors).toEqual(["У файлі немає жодного рядка з пропозицією."]);
    expect(parsed.card).toMatchObject({ name: "Round Trip", city_name: "Київ", currency: "EUR", valid_from: "2026-10-13", confirmed: true });
    expect(parsed.rows).toHaveLength(0);
  });

  it("reads back rows typed into a generated file", async () => {
    const { default: writeExcelFile } = await import("write-excel-file/universal");
    const sheet = buildPriceSheet({ card: { name: "Clinic X", city: "Львів" } });
    // locate the first blank entry row (the one after the header) and fill it
    const headerIdx = sheet.findIndex((row) =>
      row.some((c) => c && typeof c === "object" && "value" in c && c.value === "Назва у прайсі"),
    );
    const idx = (header: string) => COLUMNS.findIndex((c) => c.header === header);
    const fill = sheet[headerIdx + 1];
    fill[idx("Назва у прайсі")] = "Імплант";
    fill[idx("Ціна від")] = 12000;
    fill[idx("Ціна до")] = 14000;
    fill[idx("Що входить у ціну")] = "імплант і встановлення";
    fill[idx("Стандартний код (service_code)")] = "IMPLANT_INSTALL";
    fill[idx("Рівень")] = TIER_LABELS.classic;
    const blob = await writeExcelFile([{ sheet: "Прайс", data: sheet }]).toBlob();
    const parsed = await parseTemplateFile(blob, { services: SERVICES });
    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].row).toMatchObject({
      offer_name: "Імплант",
      price_from: 12000,
      price_to: 14000,
      service_code: "IMPLANT_INSTALL",
      tier: "classic",
    });
    expect(parsed.rows[0].errors).toEqual([]);
  });
});
