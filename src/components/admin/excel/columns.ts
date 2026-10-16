import type { Tier } from "@/lib/contracts";

/**
 * Layout of the owner's template `public/templates/DENVA_shablon_tsin_kliniki.xlsx`
 * (sheet «Прайс клініки»): clinic card in A3:B12, table header in row 15, data from row 16.
 */

export const TEMPLATE_PATH = "/templates/DENVA_shablon_tsin_kliniki.xlsx";
export const TEMPLATE_FILE_NAME = "DENVA_shablon_tsin_kliniki.xlsx";
export const PRICE_SHEET = "Прайс клініки";

/** URL of the template for the current deployment (GitHub Pages basePath aware). */
export function templateUrl(basePath: string = process.env.NEXT_PUBLIC_BASE_PATH ?? ""): string {
  return `${basePath}${TEMPLATE_PATH}`;
}

export type CardKey =
  | "name"
  | "city"
  | "region"
  | "address"
  | "contact_person"
  | "contacts"
  | "valid_from"
  | "dental_tender"
  | "public_profile_consent"
  | "data_confirmed";

/** Clinic card: label in column A, value in column B (rows 3–12). */
export const CARD_FIELDS: ReadonlyArray<{ key: CardKey; label: string }> = [
  { key: "name", label: "Назва клініки" },
  { key: "city", label: "Місто" },
  { key: "region", label: "Область" },
  { key: "address", label: "Адреса" },
  { key: "contact_person", label: "Контактна особа" },
  { key: "contacts", label: "Телефон або email" },
  { key: "valid_from", label: "Дата чинності прайсу" },
  { key: "dental_tender", label: "Участь у Dental Tender" },
  { key: "public_profile_consent", label: "Згода на публічний профіль" },
  { key: "data_confirmed", label: "Підтверджую достовірність" },
];

export type ColumnKey =
  | "service_code"
  | "category"
  | "service_name"
  | "unit"
  | "tier"
  | "price_from"
  | "price_to"
  | "currency"
  | "midpoint"
  | "included_text"
  | "exclusions"
  | "valid_from"
  | "note";

/** Table header (row 15) → column key. Headers are matched after `norm()`. */
export const COLUMNS: ReadonlyArray<{ key: ColumnKey; header: string }> = [
  { key: "service_code", header: "service_code" },
  { key: "category", header: "Категорія" },
  { key: "service_name", header: "Послуга" },
  { key: "unit", header: "Одиниця" },
  { key: "tier", header: "Рівень" },
  { key: "price_from", header: "Ціна від" },
  { key: "price_to", header: "Ціна до" },
  { key: "currency", header: "Валюта" },
  { key: "midpoint", header: "Середина діапазону" },
  { key: "included_text", header: "Що входить" },
  { key: "exclusions", header: "Що не входить" },
  { key: "valid_from", header: "Дата чинності" },
  { key: "note", header: "Посилання/примітка" },
];

export const TIER_LABELS: Record<Tier, string> = {
  common: "Спільний",
  minimum: "Мінімальний",
  classic: "Класичний",
  premium: "Преміальний",
};

export const DEFAULT_CURRENCIES = ["UAH", "EUR", "USD"] as const;

/** Header/label normalisation: lower-case, drop "(…)" hints, collapse punctuation. */
export function norm(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
