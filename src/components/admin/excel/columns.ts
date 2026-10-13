import type { Tier } from "@/lib/contracts";

/** ТЗ §7.4 — "DENVA шаблон цін клініки": names, blocks and column layout. */

export const TEMPLATE_TITLE = "DENVA шаблон цін клініки";
export const PRICE_SHEET = "Прайс";
export const INSTRUCTION_SHEET = "Інструкція";

export type CardKey =
  | "name"
  | "city"
  | "contacts"
  | "valid_from"
  | "currency"
  | "confirmation";

/** Блок 1 — картка клініки (заповнює клініка). */
export const CARD_FIELDS: ReadonlyArray<{ key: CardKey; label: string; hint: string }> = [
  { key: "name", label: "Назва клініки", hint: "Обов'язково" },
  { key: "city", label: "Місто", hint: "Обов'язково; як у довіднику міст DENVA" },
  { key: "contacts", label: "Контакти", hint: "Телефон, e-mail, адреса" },
  { key: "valid_from", label: "Дата чинності прайсу", hint: "Формат ДД.ММ.РРРР" },
  { key: "currency", label: "Валюта прайсу", hint: "UAH, EUR або USD" },
  {
    key: "confirmation",
    label: "Підтвердження достовірності",
    hint: "Напишіть «Так», якщо підтверджуєте, що ціни актуальні",
  },
];

export type ColumnKey =
  | "offer_name"
  | "brand_material"
  | "price_from"
  | "price_to"
  | "currency"
  | "included_text"
  | "exclusions"
  | "source"
  | "service_code"
  | "tier"
  | "status"
  | "include_in_aggregate"
  | "exclude_reason";

export type BlockKey = "offer" | "denva" | "moderation";

export interface ColumnSpec {
  key: ColumnKey;
  header: string;
  block: BlockKey;
  width: number;
}

export const BLOCK_TITLES: Record<BlockKey, string> = {
  offer: "Фактична пропозиція (заповнює клініка)",
  denva: "Стандартний код і рівень (заповнює DENVA)",
  moderation: "Модерація (заповнює DENVA)",
};

export const COLUMNS: readonly ColumnSpec[] = [
  { key: "offer_name", header: "Назва у прайсі", block: "offer", width: 34 },
  { key: "brand_material", header: "Бренд / матеріал", block: "offer", width: 22 },
  { key: "price_from", header: "Ціна від", block: "offer", width: 12 },
  { key: "price_to", header: "Ціна до", block: "offer", width: 12 },
  { key: "currency", header: "Валюта", block: "offer", width: 9 },
  { key: "included_text", header: "Що входить у ціну", block: "offer", width: 38 },
  { key: "exclusions", header: "Винятки", block: "offer", width: 28 },
  { key: "source", header: "Джерело", block: "offer", width: 24 },
  { key: "service_code", header: "Стандартний код (service_code)", block: "denva", width: 26 },
  { key: "tier", header: "Рівень", block: "denva", width: 16 },
  { key: "status", header: "Статус", block: "moderation", width: 14 },
  { key: "include_in_aggregate", header: "Допуск до агрегації", block: "moderation", width: 18 },
  { key: "exclude_reason", header: "Причина виключення", block: "moderation", width: 26 },
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
