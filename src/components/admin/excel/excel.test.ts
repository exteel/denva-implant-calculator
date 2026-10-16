// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CARD_FIELDS, COLUMNS, templateUrl } from "./columns";
import {
  clientRejected,
  matchCities,
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

const TEMPLATE = path.resolve(__dirname, "../../../../public/templates/DENVA_shablon_tsin_kliniki.xlsx");
const SERVICES = [
  { service_code: "IMPLANT_INSTALL", tiered: true },
  { service_code: "HEALING_ABUTMENT", tiered: true },
  { service_code: "SCAN_JAW_STAGE", tiered: false },
];

function templateBuffer(): ArrayBuffer {
  const buf = readFileSync(TEMPLATE);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** The real template's «Прайс клініки» sheet as a 2D array (mutable copy). */
async function templateSheet(): Promise<RawSheet> {
  const { default: readExcelFile } = await import("read-excel-file/universal");
  const sheets = await readExcelFile(templateBuffer());
  const sheet = sheets.find((s) => s.sheet === "Прайс клініки")!;
  return sheet.data.map((r) => [...r]) as RawSheet;
}

const colOf = (header: string) => COLUMNS.findIndex((c) => c.header === header);
function setCell(sheet: RawSheet, rowNumber: number, col: number, value: string | number) {
  sheet[rowNumber - 1][col] = value;
}
function setCard(sheet: RawSheet, label: string, value: string) {
  const row = sheet.find((r) => r[0] === label)!;
  row[1] = value;
}

describe("cell helpers", () => {
  it("parses numbers in Ukrainian formats", () => {
    expect(parseNumber(1200)).toEqual({ value: 1200, invalid: false });
    expect(parseNumber("1 200,50")).toEqual({ value: 1200.5, invalid: false });
    expect(parseNumber(null)).toEqual({ value: null, invalid: false });
    expect(parseNumber("від 100")).toEqual({ value: null, invalid: true });
  });

  it("parses booleans, tiers, currencies and dates", () => {
    expect(parseBool("Так")).toBe(true);
    expect(parseBool("Ні")).toBe(false);
    expect(parseBool("можливо")).toBeNull();
    expect(parseTier("premium")).toBe("premium");
    expect(parseTier(" Спільний ")).toBe("common");
    expect(parseTier("")).toBeNull();
    expect(parseTier("gold")).toBeUndefined();
    expect(normalizeCurrency("грн")).toBe("UAH");
    expect(parseDate("05.10.2026")).toBe("2026-10-05");
    expect(parseDate(new Date(Date.UTC(2026, 9, 5)))).toBe("2026-10-05");
    expect(parseDate("31.02.2026")).toBe("invalid");
  });

  it("builds the template URL under the base path", () => {
    expect(templateUrl("")).toBe("/templates/DENVA_shablon_tsin_kliniki.xlsx");
    expect(templateUrl("/denva")).toBe("/denva/templates/DENVA_shablon_tsin_kliniki.xlsx");
  });
});

describe("matchCities", () => {
  const cities = [
    { id: "lviv", name: "Львів", aliases: ["Lviv"], region_id: "lvivska" },
    { id: "kyiv", name: "Київ", aliases: null, region_id: "kyiv" },
    { id: "novyi-1", name: "Новий", aliases: [], region_id: "r1" },
    { id: "novyi-2", name: "Новий", aliases: [], region_id: "r2" },
  ];
  const regions = [{ id: "r1", name: "Перша область" }, { id: "r2", name: "Друга область" }];
  it("matches by name and alias", () => {
    expect(matchCities(" львів ", cities).map((c) => c.id)).toEqual(["lviv"]);
    expect(matchCities("LVIV", cities).map((c) => c.id)).toEqual(["lviv"]);
    expect(matchCities("Одеса", cities)).toEqual([]);
  });
  it("returns homonyms, narrowed by the card region", () => {
    expect(matchCities("Новий", cities)).toHaveLength(2);
    expect(matchCities("Новий", cities, { name: "Друга область", regions }).map((c) => c.id)).toEqual(["novyi-2"]);
  });
});

describe("the owner's template (public/templates)", () => {
  it("matches the layout the parser expects", async () => {
    const sheet = await templateSheet();
    expect(sheet[14].slice(0, 13)).toEqual(COLUMNS.map((c) => c.header));
    CARD_FIELDS.forEach((f, i) => expect(sheet[2 + i][0]).toBe(f.label));
    expect(sheet.length).toBe(58);
  });

  it("empty template: every priced-less row is skipped_empty, card is incomplete", async () => {
    const parsed = await parseTemplateFile(templateBuffer(), { services: SERVICES });
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.skippedEmpty).toHaveLength(43);
    expect(parsed.skippedEmpty[0]).toBe(16);
    expect(parsed.skippedEmpty[42]).toBe(58);
    expect(parsed.cardErrors.join(" ")).toMatch(/назву клініки/);
    expect(parsed.cardErrors.join(" ")).toMatch(/місто/);
    expect(parsed.card).toMatchObject({ dental_tender: false, public_profile_consent: false, data_confirmed: false });
    expect(parsed.fileErrors[0]).toMatch(/жодного рядка з ціною/);
  });

  it("round trip: fill cells, write .xlsx, read back, map to ImportPayload", async () => {
    const { default: writeExcelFile } = await import("write-excel-file/universal");
    const sheet = await templateSheet();
    setCard(sheet, "Назва клініки", "Dent Plus");
    setCard(sheet, "Місто", "Львів");
    setCard(sheet, "Область", "Львівська");
    setCard(sheet, "Адреса", "вул. Зелена, 1");
    setCard(sheet, "Контактна особа", "Марія");
    setCard(sheet, "Телефон або email", "+380671234567");
    setCard(sheet, "Дата чинності прайсу", "01.10.2026");
    setCard(sheet, "Участь у Dental Tender", "Так");
    setCard(sheet, "Згода на публічний профіль", "Ні");
    setCard(sheet, "Підтверджую достовірність", "Так");
    // row 17 = IMPLANT_INSTALL / classic (range); row 16 minimum (fixed); row 22 = SCAN_JAW_STAGE common; row 19 bad
    setCell(sheet, 16, colOf("Ціна від"), 12000);
    setCell(sheet, 16, colOf("Що входить"), "імплант + встановлення");
    setCell(sheet, 17, colOf("Ціна від"), 17000);
    setCell(sheet, 17, colOf("Ціна до"), 19000);
    setCell(sheet, 17, colOf("Що входить"), "імплант + встановлення");
    setCell(sheet, 17, colOf("Посилання/примітка"), "https://clinic.example/price");
    setCell(sheet, 17, colOf("Середина діапазону"), 99999); // ignored: DB computes it
    setCell(sheet, 22, colOf("Ціна від"), "1 200,50");
    setCell(sheet, 19, colOf("Ціна від"), 0); // invalid
    const blob = await writeExcelFile([{ sheet: "Прайс клініки", data: sheet }]).toBlob();

    const parsed = await parseTemplateFile(blob, { services: SERVICES });
    expect(parsed.fileErrors).toEqual([]);
    expect(parsed.cardErrors).toEqual([]);
    expect(parsed.card).toEqual({
      name: "Dent Plus",
      city_name: "Львів",
      region: "Львівська",
      address: "вул. Зелена, 1",
      contact_person: "Марія",
      contacts: "+380671234567",
      valid_from: "2026-10-01",
      dental_tender: true,
      public_profile_consent: false,
      data_confirmed: true,
    });
    expect(parsed.rows.map((r) => r.row.row_number)).toEqual([16, 17, 19, 22]);
    expect(parsed.skippedEmpty).toHaveLength(43 - 4);
    const [min, classic, bad, scan] = parsed.rows;
    expect(min.row).toMatchObject({
      service_code: "IMPLANT_INSTALL",
      category: "Імплантація",
      service_name: "Встановлення імпланта",
      unit: "за імплант",
      tier: "minimum",
      price_from: 12000,
      price_to: null,
      currency: "UAH",
      valid_from: "2026-10-01",
    });
    expect(classic.row).toMatchObject({ tier: "classic", price_from: 17000, price_to: 19000, note: "https://clinic.example/price" });
    expect(scan.row).toMatchObject({ service_code: "SCAN_JAW_STAGE", tier: "common", price_from: 1200.5 });
    expect(bad.errors[0]).toMatch(/більшою за нуль/);
    expect(scan.warnings.join(" ")).toMatch(/склад/);
    expect(clientRejected(parsed)).toEqual([{ row_number: 19, message: expect.stringMatching(/більшою за нуль/) }]);

    const payload = toImportPayload(parsed, { fileName: "dent.xlsx", cityId: "lviv", clinicId: null });
    expect(payload.clinic).toEqual({
      clinic_id: null,
      name: "Dent Plus",
      city_id: "lviv",
      region: "Львівська",
      address: "вул. Зелена, 1",
      contact_person: "Марія",
      contacts: "+380671234567",
      valid_from: "2026-10-01",
      dental_tender: true,
      public_profile_consent: false,
      data_confirmed: true,
    });
    expect(payload.rows.filter((r) => r.price_from !== null).map((r) => r.row_number)).toEqual([16, 17, 22]);
    // the other template rows travel as blanks so the backend can report them as skipped_empty
    expect(payload.rows.filter((r) => r.price_from === null).map((r) => r.row_number)).toEqual(parsed.skippedEmpty);
    expect(payload.rows).toHaveLength(3 + 39);
    expect(JSON.stringify(payload)).not.toMatch(/99999/);
  });
});

describe("parseTemplateSheet edge cases", () => {
  it("reports a missing header row", () => {
    expect(parseTemplateSheet([["щось інше"]]).fileErrors[0]).toMatch(/заголовків/);
  });

  it("flags currency, tier, code and range problems; warns on duplicates and unknown codes", async () => {
    const sheet = await templateSheet();
    setCard(sheet, "Назва клініки", "X");
    setCard(sheet, "Місто", "Y");
    setCell(sheet, 16, colOf("Ціна від"), 500);
    setCell(sheet, 16, colOf("Ціна до"), 100); // to < from
    setCell(sheet, 17, colOf("Ціна від"), 5);
    setCell(sheet, 17, colOf("Валюта"), "RUB");
    setCell(sheet, 18, colOf("Ціна від"), 5);
    setCell(sheet, 18, colOf("Рівень"), "gold");
    setCell(sheet, 19, colOf("Ціна від"), 5); // HEALING / minimum
    setCell(sheet, 19, colOf("Що входить"), "x");
    setCell(sheet, 20, colOf("Ціна від"), 5);
    setCell(sheet, 20, colOf("service_code"), "NOPE_CODE");
    setCell(sheet, 20, colOf("Що входить"), "x");
    setCell(sheet, 21, colOf("Ціна від"), "abc");
    const parsed = parseTemplateSheet(sheet, { services: SERVICES });
    const byRow = new Map(parsed.rows.map((r) => [r.row.row_number, r]));
    expect(byRow.get(16)!.errors[0]).toMatch(/не може бути меншою/);
    expect(byRow.get(17)!.errors[0]).toMatch(/RUB/);
    expect(byRow.get(18)!.errors[0]).toMatch(/gold/);
    expect(byRow.get(19)!.errors).toEqual([]);
    expect(byRow.get(20)!.warnings.join(" ")).toMatch(/Невідомий service_code/);
    expect(byRow.get(21)!.errors[0]).toMatch(/числом/);
  });

  it("keeps «Ціна до» without «Ціна від» as an error, not a silent skip", async () => {
    const sheet = await templateSheet();
    setCell(sheet, 16, colOf("Ціна до"), 100);
    const parsed = parseTemplateSheet(sheet);
    expect(parsed.rows[0].errors[0]).toMatch(/не вказано «Ціна від»/);
  });
});
