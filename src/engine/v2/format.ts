/** Number, money and date formatting for the patient (Ukrainian typography). */
import type { Range } from "./types";

const NBSP = " ";
const MINUS = "−";

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 52000 → "52 000" (NBSP as thousands separator); decimals use a comma. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  const negative = n < 0;
  const [int, frac] = Math.abs(n).toString().split(".");
  const body = group(int) + (frac ? `,${frac}` : "");
  return negative ? `${MINUS}${body}` : body;
}

/** 52000 → "52 000 грн". */
export function formatUah(n: number): string {
  return `${formatNumber(Math.round(n))}${NBSP}грн`;
}

/** { 46000, 59000 } → "46 000–59 000 грн"; a degenerate range → one amount. */
export function formatUahRange(r: Range): string {
  if (Math.round(r.low) === Math.round(r.high)) return formatUah(r.low);
  return `${formatNumber(Math.round(r.low))}–${formatUah(r.high)}`;
}

/**
 * UAH → EUR for the second-currency line (ТЗ §4.4). Rounded "sensibly":
 * to 10 € from 500 €, to whole euros below — an exact-looking figure would
 * promise more precision than a rate-converted estimate has.
 */
export function eurFromUah(uah: number, rate: number): number {
  const eur = uah / rate;
  return eur >= 500 ? Math.round(eur / 10) * 10 : Math.round(eur);
}

export function formatEur(eur: number): string {
  return `${formatNumber(eur)}${NBSP}€`;
}

/** "≈ 1 220 €" or "≈ 1 100–1 400 €". */
export function formatEurRange(r: Range, rate: number): string {
  const low = eurFromUah(r.low, rate);
  const high = eurFromUah(r.high, rate);
  if (low === high) return `≈${NBSP}${formatEur(low)}`;
  return `≈${NBSP}${formatNumber(low)}–${formatEur(high)}`;
}

/** 50.1385 → "50,14". */
export function formatRate(rate: number): string {
  return (Math.round(rate * 100) / 100).toFixed(2).replace(".", ",");
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

/** "2026-10-09" or "2026-10-09T08:00:00Z" → "9 жовтня 2026". */
export function formatDateUk(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTHS_GENITIVE[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/** Ukrainian plural: pluralUk(1,"зуб","зуби","зубів") → "зуб". */
export function pluralUk(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * "прайсів N клінік": the noun after the number inside the genitive phrase
 * "на основі прайсів 3 клінік" — "21 клініки", but "3 клінік", "5 клінік".
 */
export function clinicsGenitive(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  return abs % 10 === 1 && abs % 100 !== 11 ? "клініки" : "клінік";
}
