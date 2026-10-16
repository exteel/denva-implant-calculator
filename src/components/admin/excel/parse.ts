import type { ImportPayload, ImportPriceRow, Tier } from "@/lib/contracts";
import { CARD_FIELDS, COLUMNS, DEFAULT_CURRENCIES, PRICE_SHEET, TIER_LABELS, norm, type CardKey, type ColumnKey } from "./columns";

/** Raw spreadsheet cell as returned by read-excel-file. */
export type RawCell = string | number | boolean | Date | null | undefined;
export type RawSheet = RawCell[][];

export interface ServiceRef {
  service_code: string;
  tiered: boolean;
}

export interface ParseOptions {
  /** Allowed currencies (defaults to UAH/EUR/USD). */
  currencies?: readonly string[];
  /** Known service catalogue — enables service_code / tier cross-checks. */
  services?: readonly ServiceRef[];
}

export interface ParsedCard {
  name: string;
  city_name: string;
  region: string | null;
  address: string | null;
  contact_person: string | null;
  contacts: string | null;
  /** ISO date YYYY-MM-DD. */
  valid_from: string | null;
  dental_tender: boolean;
  public_profile_consent: boolean;
  data_confirmed: boolean;
}

export interface ParsedRow {
  row: ImportPriceRow;
  errors: string[];
  warnings: string[];
}

export interface ParsedTemplate {
  card: ParsedCard;
  cardErrors: string[];
  cardWarnings: string[];
  /** Rows with a price — the ones that go to the import. */
  rows: ParsedRow[];
  /** Spreadsheet row numbers that have a service_code but no «Ціна від» (allowed, skipped). */
  skippedEmpty: number[];
  /** Structural problems (no header row, no priced rows, ...). Non-empty → nothing can be imported. */
  fileErrors: string[];
}

// ───────────── cell helpers ─────────────

function text(cell: RawCell): string | null {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  const s = String(cell).trim();
  return s === "" ? null : s;
}

/** `{ invalid: true }` for unparsable non-empty content. */
export function parseNumber(cell: RawCell): { value: number | null; invalid: boolean } {
  if (cell === null || cell === undefined) return { value: null, invalid: false };
  if (typeof cell === "number") return Number.isFinite(cell) ? { value: cell, invalid: false } : { value: null, invalid: true };
  if (typeof cell !== "string") return { value: null, invalid: true };
  const cleaned = cell.replace(/[\s  ]/g, "").replace(/,/g, ".");
  if (cleaned === "") return { value: null, invalid: false };
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { value: null, invalid: true };
  return { value: Number(cleaned), invalid: false };
}

/** Так/Ні cells. `null` = empty or unrecognised. */
export function parseBool(cell: RawCell): boolean | null {
  if (typeof cell === "boolean") return cell;
  if (typeof cell === "number") return cell === 1 ? true : cell === 0 ? false : null;
  const s = text(cell)?.toLowerCase();
  if (!s) return null;
  if (["так", "yes", "y", "true", "1", "+", "да"].includes(s)) return true;
  if (["ні", "нет", "no", "n", "false", "0", "-"].includes(s)) return false;
  return null;
}

/** Excel date | "ДД.ММ.РРРР" | "РРРР-ММ-ДД" → "YYYY-MM-DD" (null when empty, "invalid" when garbage). */
export function parseDate(cell: RawCell): string | null | "invalid" {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? "invalid" : cell.toISOString().slice(0, 10);
  }
  const s = text(cell);
  if (!s) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (match) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return "invalid";
  }
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return "invalid";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const CURRENCY_ALIASES: Record<string, string> = {
  грн: "UAH",
  "грн.": "UAH",
  гривня: "UAH",
  "₴": "UAH",
  uah: "UAH",
  eur: "EUR",
  "€": "EUR",
  євро: "EUR",
  usd: "USD",
  $: "USD",
  долар: "USD",
};

export function normalizeCurrency(raw: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return CURRENCY_ALIASES[key] ?? raw.trim().toUpperCase();
}

const TIER_LOOKUP: Record<string, Tier> = (() => {
  const map: Record<string, Tier> = {};
  for (const [tier, label] of Object.entries(TIER_LABELS) as [Tier, string][]) {
    map[tier] = tier;
    map[label.toLowerCase()] = tier;
  }
  map["спільна"] = "common";
  map["мінімальна"] = "minimum";
  map["класична"] = "classic";
  map["преміальна"] = "premium";
  map["преміум"] = "premium";
  return map;
})();

/** Tier code or Ukrainian label → Tier. `undefined` = unrecognised, `null` = empty. */
export function parseTier(cell: RawCell): Tier | null | undefined {
  const s = text(cell)?.toLowerCase();
  if (!s) return null;
  return TIER_LOOKUP[s];
}

// ───────────── sheet parsing ─────────────

const CARD_LOOKUP = new Map<string, CardKey>(CARD_FIELDS.map((f) => [norm(f.label), f.key]));
CARD_LOOKUP.set("дата чинності", "valid_from");
CARD_LOOKUP.set("телефон", "contacts");
CARD_LOOKUP.set("email", "contacts");

const COLUMN_LOOKUP: Record<string, ColumnKey> = (() => {
  const map: Record<string, ColumnKey> = {};
  for (const c of COLUMNS) map[norm(c.header)] = c.key;
  map["service code"] = "service_code";
  map["код"] = "service_code";
  map["склад"] = "included_text";
  return map;
})();

function emptyCard(): ParsedCard {
  return {
    name: "",
    city_name: "",
    region: null,
    address: null,
    contact_person: null,
    contacts: null,
    valid_from: null,
    dental_tender: false,
    public_profile_consent: false,
    data_confirmed: false,
  };
}

export function parseTemplateSheet(sheet: RawSheet, options: ParseOptions = {}): ParsedTemplate {
  const currencies = (options.currencies ?? DEFAULT_CURRENCIES).map((c) => c.toUpperCase());
  const serviceByCode = new Map((options.services ?? []).map((s) => [s.service_code.toUpperCase(), s]));
  const result: ParsedTemplate = { card: emptyCard(), cardErrors: [], cardWarnings: [], rows: [], skippedEmpty: [], fileErrors: [] };

  // 1. header row (service_code … Ціна від …)
  let headerIdx = -1;
  const colIndex = new Map<ColumnKey, number>();
  for (let r = 0; r < sheet.length; r += 1) {
    const found = new Map<ColumnKey, number>();
    (sheet[r] ?? []).forEach((cell, c) => {
      const key = COLUMN_LOOKUP[norm(cell)];
      if (key && !found.has(key)) found.set(key, c);
    });
    if (found.has("service_code") && found.has("price_from")) {
      headerIdx = r;
      found.forEach((v, k) => colIndex.set(k, v));
      break;
    }
  }
  if (headerIdx < 0) {
    result.fileErrors.push(
      "Не знайдено рядок заголовків («service_code», «Ціна від»). Використовуйте шаблон DENVA_shablon_tsin_kliniki.xlsx без зміни структури.",
    );
  }

  // 2. clinic card — label in A, value in B, above the table
  const cardEnd = headerIdx < 0 ? Math.min(sheet.length, 14) : headerIdx;
  const rawCard: Partial<Record<CardKey, RawCell>> = {};
  for (let r = 0; r < cardEnd; r += 1) {
    const row = sheet[r] ?? [];
    const key = CARD_LOOKUP.get(norm(row[0]));
    if (key && !(key in rawCard)) rawCard[key] = row[1];
  }
  const card = result.card;
  card.name = text(rawCard.name) ?? "";
  card.city_name = text(rawCard.city) ?? "";
  card.region = text(rawCard.region);
  card.address = text(rawCard.address);
  card.contact_person = text(rawCard.contact_person);
  card.contacts = text(rawCard.contacts);
  if (!card.name) result.cardErrors.push("Не вказано назву клініки.");
  if (!card.city_name) result.cardErrors.push("Не вказано місто.");
  const validFrom = parseDate(rawCard.valid_from);
  if (validFrom === "invalid") result.cardErrors.push("Дата чинності прайсу має формат ДД.ММ.РРРР.");
  else card.valid_from = validFrom;
  if (validFrom === null) result.cardWarnings.push("Не вказано дату чинності прайсу — буде використано дату імпорту.");
  if (!card.contacts) result.cardWarnings.push("Не вказано телефон або email клініки.");
  card.dental_tender = parseBool(rawCard.dental_tender) === true;
  card.public_profile_consent = parseBool(rawCard.public_profile_consent) === true;
  card.data_confirmed = parseBool(rawCard.data_confirmed) === true;
  if (!card.data_confirmed) result.cardWarnings.push("Клініка не підтвердила достовірність цін («Підтверджую достовірність» ≠ Так).");

  if (headerIdx < 0) return result;

  // 3. rows (spreadsheet row = index + 1, which is what the backend reports back)
  const seen = new Map<string, number>();
  const cellAt = (row: RawCell[], key: ColumnKey): RawCell => {
    const idx = colIndex.get(key);
    return idx === undefined ? null : row[idx];
  };
  // "Середина діапазону" is computed by the DB — never read.
  const dataKeys = [...colIndex.keys()].filter((k) => k !== "midpoint");
  for (let r = headerIdx + 1; r < sheet.length; r += 1) {
    const raw = sheet[r] ?? [];
    const rowNumber = r + 1;
    const code = text(cellAt(raw, "service_code"))?.toUpperCase() ?? null;
    const from = parseNumber(cellAt(raw, "price_from"));
    const to = parseNumber(cellAt(raw, "price_to"));

    // template rows come pre-filled with code / category / unit / tier: no price → allowed, skipped
    if (from.value === null && !from.invalid && to.value === null && !to.invalid) {
      if (dataKeys.some((k) => text(cellAt(raw, k)) !== null)) result.skippedEmpty.push(rowNumber);
      continue;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (from.invalid) errors.push("«Ціна від» має бути числом.");
    else if (from.value === null) errors.push("Вказано «Ціна до», але не вказано «Ціна від».");
    else if (from.value <= 0) errors.push("«Ціна від» має бути більшою за нуль.");
    if (to.invalid) errors.push("«Ціна до» має бути числом.");
    else if (to.value !== null && to.value <= 0) errors.push("«Ціна до» має бути більшою за нуль.");
    else if (to.value !== null && from.value !== null && to.value < from.value) {
      errors.push("«Ціна до» не може бути меншою за «Ціна від».");
    }

    const rowCurrency = normalizeCurrency(text(cellAt(raw, "currency"))) ?? "UAH";
    if (!currencies.includes(rowCurrency)) {
      errors.push(`Валюта «${rowCurrency}» не підтримується (${currencies.join(", ")}).`);
    }

    const tierRaw = parseTier(cellAt(raw, "tier"));
    if (tierRaw === undefined) {
      errors.push(`Невідомий рівень «${text(cellAt(raw, "tier"))}». Допустимі: common, minimum, classic, premium.`);
    }
    let tier: Tier | null = tierRaw ?? null;

    if (!code) {
      warnings.push("Не вказано service_code — рядок потребує зіставлення модератором.");
    } else if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
      errors.push(`service_code «${code}» має містити лише латинські літери, цифри та «_».`);
    } else if (options.services) {
      const svc = serviceByCode.get(code);
      if (!svc) warnings.push(`Невідомий service_code «${code}» — рядок не буде імпортовано і потрапить у протокол як невідомий код.`);
      else if (!svc.tiered && tier === null) tier = "common";
      else if (!svc.tiered && tier !== "common") warnings.push("Для цієї послуги рівень має бути common.");
      else if (svc.tiered && (tier === null || tier === "common")) {
        warnings.push("Для цієї послуги потрібен рівень: minimum, classic або premium.");
      }
    }

    const included = text(cellAt(raw, "included_text"));
    if (!included) warnings.push("Не вказано склад («Що входить»): ціна без складу не допускається до статистики.");

    if (code && tier) {
      const key = `${code}|${tier}`;
      const prev = seen.get(key);
      if (prev !== undefined) warnings.push(`Дубль рядка ${prev} (той самий код і рівень) — одна клініка має один голос.`);
      else seen.set(key, rowNumber);
    }

    const rowDate = parseDate(cellAt(raw, "valid_from"));
    if (rowDate === "invalid") errors.push("«Дата чинності» має формат ДД.ММ.РРРР.");

    result.rows.push({
      row: {
        row_number: rowNumber,
        service_code: code,
        category: text(cellAt(raw, "category")),
        service_name: text(cellAt(raw, "service_name")),
        unit: text(cellAt(raw, "unit")),
        tier,
        price_from: from.value,
        price_to: to.value,
        currency: rowCurrency,
        included_text: included,
        exclusions: text(cellAt(raw, "exclusions")),
        valid_from: rowDate === "invalid" ? null : (rowDate ?? card.valid_from),
        note: text(cellAt(raw, "note")),
      },
      errors,
      warnings,
    });
  }
  if (result.rows.length === 0) {
    result.fileErrors.push("У файлі немає жодного рядка з ціною («Ціна від»). Порожні рядки дозволені, але імпортувати нічого.");
  }
  return result;
}

function blankRow(rowNumber: number): ImportPriceRow {
  return {
    row_number: rowNumber,
    service_code: null,
    category: null,
    service_name: null,
    unit: null,
    tier: null,
    price_from: null,
    price_to: null,
    currency: "UAH",
    included_text: null,
    exclusions: null,
    valid_from: null,
    note: null,
  };
}

/** City candidates by name or alias; the region from the card narrows homonyms. */
export function matchCities<T extends { id: string; name: string; aliases?: string[] | null; region_id?: string | null }>(
  name: string,
  cities: readonly T[],
  region?: { name: string | null; regions: ReadonlyArray<{ id: string; name: string }> },
): T[] {
  const key = norm(name);
  if (!key) return [];
  const byName = cities.filter((c) => norm(c.name) === key);
  const candidates = byName.length ? byName : cities.filter((c) => (c.aliases ?? []).some((a) => norm(a) === key));
  if (candidates.length > 1 && region?.name) {
    const wanted = region.regions.filter((r) => norm(r.name) === norm(region.name) || norm(r.name).includes(norm(region.name)));
    const narrowed = candidates.filter((c) => wanted.some((r) => r.id === c.region_id));
    if (narrowed.length) return narrowed;
  }
  return candidates;
}

export interface PayloadInput {
  fileName: string;
  cityId: string;
  /** Existing clinic or null → backend reuses by city + name or creates a draft. */
  clinicId: string | null;
  /** Rows to send; defaults to all rows without errors. */
  rows?: readonly ParsedRow[];
}

/** Builds the RPC payload; rows with client-side errors are never sent. */
export function toImportPayload(parsed: ParsedTemplate, input: PayloadInput): ImportPayload {
  const rows = (input.rows ?? parsed.rows).filter((r) => r.errors.length === 0).map((r) => r.row);
  // price-less template rows go along as blanks: the backend reports them in `skipped_empty`
  const blanks = parsed.skippedEmpty.map(blankRow);
  const c = parsed.card;
  return {
    file_name: input.fileName,
    clinic: {
      clinic_id: input.clinicId,
      name: c.name,
      city_id: input.cityId,
      region: c.region,
      address: c.address,
      contact_person: c.contact_person,
      contacts: c.contacts,
      valid_from: c.valid_from,
      dental_tender: c.dental_tender,
      public_profile_consent: c.public_profile_consent,
      data_confirmed: c.data_confirmed,
    },
    rows: [...rows, ...blanks].sort((a, b) => a.row_number - b.row_number),
  };
}

/** Rows the client refused to send, as protocol-style errors. */
export function clientRejected(parsed: ParsedTemplate): Array<{ row_number: number; message: string }> {
  return parsed.rows
    .filter((r) => r.errors.length > 0)
    .map((r) => ({ row_number: r.row.row_number, message: r.errors.join(" ") }));
}

/** Reads an .xlsx File/Blob/ArrayBuffer and parses the «Прайс клініки» sheet. */
export async function parseTemplateFile(file: Blob | ArrayBuffer, options: ParseOptions = {}): Promise<ParsedTemplate> {
  const { default: readExcelFile } = await import("read-excel-file/universal");
  const sheets = await readExcelFile(file);
  const priceSheet = sheets.find((s) => norm(s.sheet) === norm(PRICE_SHEET)) ?? sheets.find((s) => norm(s.sheet).startsWith("прайс"));
  if (!priceSheet) {
    return {
      card: emptyCard(),
      cardErrors: [],
      cardWarnings: [],
      rows: [],
      skippedEmpty: [],
      fileErrors: [`У файлі немає аркуша «${PRICE_SHEET}». Завантажте файл за шаблоном DENVA.`],
    };
  }
  return parseTemplateSheet(priceSheet.data as RawSheet, options);
}
