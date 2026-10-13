import type { ImportPayload, ImportPriceRow, Tier } from "@/lib/contracts";
import { CARD_FIELDS, COLUMNS, DEFAULT_CURRENCIES, TIER_LABELS, norm, type CardKey, type ColumnKey } from "./columns";

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
  contacts: string | null;
  /** ISO date YYYY-MM-DD. */
  valid_from: string | null;
  currency: string;
  /** True when the clinic wrote "Так"/"Yes"/... in the confirmation cell. */
  confirmed: boolean;
}

export interface ModerationCells {
  status: string | null;
  include_in_aggregate: boolean | null;
  exclude_reason: string | null;
}

export interface ParsedRow {
  row: ImportPriceRow;
  moderation: ModerationCells;
  errors: string[];
  warnings: string[];
}

export interface ParsedTemplate {
  card: ParsedCard;
  cardErrors: string[];
  cardWarnings: string[];
  rows: ParsedRow[];
  /** Structural problems (no header row, no rows, ...). Non-empty → nothing can be imported. */
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

/** Ukrainian tier label (or code) → Tier. `undefined` = unrecognised, `null` = empty. */
export function parseTier(cell: RawCell): Tier | null | undefined {
  const s = text(cell)?.toLowerCase();
  if (!s) return null;
  return TIER_LOOKUP[s];
}

// ───────────── sheet parsing ─────────────

const CARD_LOOKUP = new Map<string, CardKey>(CARD_FIELDS.map((f) => [norm(f.label), f.key]));
CARD_LOOKUP.set("дата чинності", "valid_from");
CARD_LOOKUP.set("валюта", "currency");

const COLUMN_ALIASES: Record<string, ColumnKey> = (() => {
  const map: Record<string, ColumnKey> = {};
  for (const c of COLUMNS) map[norm(c.header)] = c.key;
  map["service code"] = "service_code";
  map["service_code"] = "service_code";
  map["код"] = "service_code";
  map["що входить"] = "included_text";
  map["склад"] = "included_text";
  map["бренд матеріал"] = "brand_material";
  return map;
})();

function emptyCard(): ParsedCard {
  return { name: "", city_name: "", contacts: null, valid_from: null, currency: "UAH", confirmed: false };
}

export function parseTemplateSheet(sheet: RawSheet, options: ParseOptions = {}): ParsedTemplate {
  const currencies = (options.currencies ?? DEFAULT_CURRENCIES).map((c) => c.toUpperCase());
  const serviceByCode = new Map((options.services ?? []).map((s) => [s.service_code.toUpperCase(), s]));
  const result: ParsedTemplate = { card: emptyCard(), cardErrors: [], cardWarnings: [], rows: [], fileErrors: [] };

  // 1. header row
  let headerIdx = -1;
  const colIndex = new Map<ColumnKey, number>();
  for (let r = 0; r < sheet.length; r += 1) {
    const found = new Map<ColumnKey, number>();
    (sheet[r] ?? []).forEach((cell, c) => {
      const key = COLUMN_ALIASES[norm(cell)];
      if (key && !found.has(key)) found.set(key, c);
    });
    if (found.has("offer_name") && found.has("price_from")) {
      headerIdx = r;
      found.forEach((v, k) => colIndex.set(k, v));
      break;
    }
  }
  if (headerIdx < 0) {
    result.fileErrors.push(
      "Не знайдено рядок заголовків («Назва у прайсі», «Ціна від»). Використовуйте шаблон «DENVA шаблон цін клініки».",
    );
  }

  // 2. clinic card — label / value pairs above the table
  const cardEnd = headerIdx < 0 ? sheet.length : headerIdx;
  const rawCard: Partial<Record<CardKey, RawCell>> = {};
  for (let r = 0; r < cardEnd; r += 1) {
    const row = sheet[r] ?? [];
    const key = CARD_LOOKUP.get(norm(row[0]));
    if (key && !(key in rawCard)) rawCard[key] = row[1];
  }
  const card = result.card;
  card.name = text(rawCard.name) ?? "";
  card.city_name = text(rawCard.city) ?? "";
  card.contacts = text(rawCard.contacts);
  if (!card.name) result.cardErrors.push("Не вказано назву клініки.");
  if (!card.city_name) result.cardErrors.push("Не вказано місто.");
  const validFrom = parseDate(rawCard.valid_from);
  if (validFrom === "invalid") result.cardErrors.push("Дата чинності прайсу має формат ДД.ММ.РРРР.");
  else card.valid_from = validFrom;
  if (validFrom === null) result.cardWarnings.push("Не вказано дату чинності прайсу.");
  const cardCurrency = normalizeCurrency(text(rawCard.currency));
  if (cardCurrency && !currencies.includes(cardCurrency)) {
    result.cardErrors.push(`Валюта «${cardCurrency}» не підтримується (${currencies.join(", ")}).`);
  } else if (!cardCurrency) {
    result.cardWarnings.push("Не вказано валюту прайсу — використано UAH.");
  }
  card.currency = cardCurrency && currencies.includes(cardCurrency) ? cardCurrency : "UAH";
  card.confirmed = parseBool(rawCard.confirmation) === true;
  if (!card.confirmed) result.cardWarnings.push("Клініка не підтвердила достовірність цін.");

  if (headerIdx < 0) return result;

  // 3. rows
  const seen = new Map<string, number>();
  const cellAt = (row: RawCell[], key: ColumnKey): RawCell => {
    const idx = colIndex.get(key);
    return idx === undefined ? null : row[idx];
  };
  for (let r = headerIdx + 1; r < sheet.length; r += 1) {
    const raw = sheet[r] ?? [];
    const keys = [...colIndex.keys()];
    if (keys.every((k) => text(cellAt(raw, k)) === null)) continue;

    const errors: string[] = [];
    const warnings: string[] = [];
    const rowNumber = r + 1;

    const offerName = text(cellAt(raw, "offer_name"));
    if (!offerName) errors.push("Не вказано назву у прайсі.");

    const from = parseNumber(cellAt(raw, "price_from"));
    const to = parseNumber(cellAt(raw, "price_to"));
    if (from.invalid) errors.push("«Ціна від» має бути числом.");
    else if (from.value === null) errors.push("Не вказано «Ціна від».");
    else if (from.value <= 0) errors.push("«Ціна від» має бути більшою за нуль.");
    if (to.invalid) errors.push("«Ціна до» має бути числом.");
    else if (to.value !== null && to.value <= 0) errors.push("«Ціна до» має бути більшою за нуль.");
    else if (to.value !== null && from.value !== null && to.value < from.value) {
      errors.push("«Ціна до» не може бути меншою за «Ціна від».");
    }

    const rowCurrency = normalizeCurrency(text(cellAt(raw, "currency"))) ?? card.currency;
    if (!currencies.includes(rowCurrency)) {
      errors.push(`Валюта «${rowCurrency}» не підтримується (${currencies.join(", ")}).`);
    }

    const tierRaw = parseTier(cellAt(raw, "tier"));
    if (tierRaw === undefined) {
      errors.push(`Невідомий рівень «${text(cellAt(raw, "tier"))}». Допустимі: ${Object.values(TIER_LABELS).join(", ")}.`);
    }
    let tier: Tier | null = tierRaw ?? null;

    let serviceCode = text(cellAt(raw, "service_code"))?.toUpperCase() ?? null;
    if (serviceCode && !/^[A-Z][A-Z0-9_]*$/.test(serviceCode)) {
      errors.push(`service_code «${serviceCode}» має містити лише латинські літери, цифри та «_».`);
    } else if (serviceCode && options.services) {
      const svc = serviceByCode.get(serviceCode);
      if (!svc) warnings.push(`Невідомий service_code «${serviceCode}» — рядок не буде імпортовано і потрапить у протокол як невідомий код.`);
      else if (!svc.tiered && tier === null) tier = "common";
      else if (!svc.tiered && tier !== "common") warnings.push("Для цієї послуги рівень має бути «Спільний».");
      else if (svc.tiered && (tier === null || tier === "common")) {
        warnings.push("Для цієї послуги потрібен рівень: Мінімальний, Класичний або Преміальний.");
      }
    }
    if (!serviceCode) serviceCode = null;

    const included = text(cellAt(raw, "included_text"));
    if (!included) warnings.push("Не вказано склад: ціна без складу не допускається до агрегату.");

    if (serviceCode && tier) {
      const key = `${serviceCode}|${tier}`;
      const prev = seen.get(key);
      if (prev !== undefined) warnings.push(`Дубль рядка ${prev} (той самий код і рівень) — одна клініка має один голос.`);
      else seen.set(key, rowNumber);
    }

    const includeCell = cellAt(raw, "include_in_aggregate");
    const moderation: ModerationCells = {
      status: text(cellAt(raw, "status")),
      include_in_aggregate: parseBool(includeCell),
      exclude_reason: text(cellAt(raw, "exclude_reason")),
    };

    result.rows.push({
      row: {
        row_number: rowNumber,
        offer_name: offerName ?? "",
        brand_material: text(cellAt(raw, "brand_material")),
        price_from: from.value,
        price_to: to.value,
        currency: rowCurrency,
        included_text: included,
        exclusions: text(cellAt(raw, "exclusions")),
        source: text(cellAt(raw, "source")),
        service_code: serviceCode,
        tier,
      },
      moderation,
      errors,
      warnings,
    });
  }
  if (result.rows.length === 0) result.fileErrors.push("У файлі немає жодного рядка з пропозицією.");
  return result;
}

/** Case/diacritic-insensitive city lookup by name or alias. */
export function matchCity<T extends { id: string; name: string; aliases?: string[] | null }>(
  name: string,
  cities: readonly T[],
): T | null {
  const key = norm(name);
  if (!key) return null;
  return (
    cities.find((c) => norm(c.name) === key) ??
    cities.find((c) => (c.aliases ?? []).some((a) => norm(a) === key)) ??
    null
  );
}

export interface PayloadInput {
  fileName: string;
  cityId: string;
  /** Existing clinic or null to create a draft clinic from the card. */
  clinicId: string | null;
  /** Rows to send; defaults to all rows without errors. */
  rows?: readonly ParsedRow[];
}

/** Builds the RPC payload; rows with client-side errors are never sent. */
export function toImportPayload(parsed: ParsedTemplate, input: PayloadInput): ImportPayload {
  const rows = (input.rows ?? parsed.rows).filter((r) => r.errors.length === 0).map((r) => r.row);
  return {
    file_name: input.fileName,
    clinic: {
      clinic_id: input.clinicId,
      name: parsed.card.name,
      city_id: input.cityId,
      contacts: parsed.card.contacts,
      valid_from: parsed.card.valid_from,
      currency: parsed.card.currency,
    },
    rows,
  };
}

/** Rows the client refused to send, as protocol-style errors. */
export function clientRejected(parsed: ParsedTemplate): Array<{ row_number: number; message: string }> {
  return parsed.rows
    .filter((r) => r.errors.length > 0)
    .map((r) => ({ row_number: r.row.row_number, message: r.errors.join(" ") }));
}

/** Reads an .xlsx File/Blob/ArrayBuffer and parses the first price sheet. */
export async function parseTemplateFile(
  file: Blob | ArrayBuffer,
  options: ParseOptions = {},
): Promise<ParsedTemplate> {
  const { default: readExcelFile } = await import("read-excel-file/universal");
  const sheets = await readExcelFile(file);
  const priceSheet = sheets.find((s) => norm(s.sheet) === norm("Прайс")) ?? sheets[0];
  return parseTemplateSheet(priceSheet.data as RawSheet, options);
}
