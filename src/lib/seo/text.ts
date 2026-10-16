import type { PublicLocation } from "@/lib/contracts";

/** Non-breaking space: keeps "30 800 ₴" and "12 жовтня" on one line. */
const NBSP = " ";

/** Rounded (display-only, ТЗ §8.1) UAH amount: "30 800 ₴". */
export function formatUah(value: number): string {
  const digits = String(Math.round(value));
  return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}₴`;
}

const MONTHS_GENITIVE = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

/** "2026-10-09T08:00:00Z" | "2026-10-09" → "9 жовтня 2026" (ICU-independent, UTC date part). */
export function formatDateUk(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const month = MONTHS_GENITIVE[Number(match[2]) - 1];
  if (!month) return null;
  return `${Number(match[3])}${NBSP}${month}${NBSP}${match[1]}`;
}

/**
 * Locative forms of well-known city names ("у Києві"). The database does not
 * store declensions, so a city that is neither here nor given an explicit
 * `content.name_locative` is written as "у місті {назва}" — always grammatical.
 */
const LOCATIVE: Record<string, string> = {
  "Київ": "Києві",
  "Львів": "Львові",
  "Одеса": "Одесі",
  "Дніпро": "Дніпрі",
  "Харків": "Харкові",
  "Івано-Франківськ": "Івано-Франківську",
  "Чернівці": "Чернівцях",
  "Вінниця": "Вінниці",
  "Запоріжжя": "Запоріжжі",
  "Полтава": "Полтаві",
  "Черкаси": "Черкасах",
  "Житомир": "Житомирі",
  "Чернігів": "Чернігові",
  "Суми": "Сумах",
  "Миколаїв": "Миколаєві",
  "Херсон": "Херсоні",
  "Рівне": "Рівному",
  "Луцьк": "Луцьку",
  "Тернопіль": "Тернополі",
  "Хмельницький": "Хмельницькому",
  "Ужгород": "Ужгороді",
  "Кропивницький": "Кропивницькому",
  "Кривий Ріг": "Кривому Розі",
  "Кам’янське": "Кам’янському",
  "Біла Церква": "Білій Церкві",
  "Бровари": "Броварах",
  "Ірпінь": "Ірпені",
  "Кременчук": "Кременчуці",
  "Мукачево": "Мукачеві",
  "Кам’янець-Подільський": "Кам’янці-Подільському",
  "Дрогобич": "Дрогобичі",
  "Умань": "Умані",
  "Краматорськ": "Краматорську",
};

const VOWELS = "аеєиіїоуюяАЕЄИІЇОУЮЯ";

/**
 * "у Києві" / "в Одесі" / "у місті Чернівці" for use inside a sentence, title or H1.
 * Euphony: "в" before a vowel ("імплантації в Одесі", "в Умані"), otherwise "у".
 */
export function inCity(location: Pick<PublicLocation, "name">, explicitLocative?: string | null): string {
  const locative = explicitLocative?.trim() || LOCATIVE[location.name];
  if (!locative) return `у місті ${location.name}`;
  return `${VOWELS.includes(locative[0]) ? "в" : "у"} ${locative}`;
}
