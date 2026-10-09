/** Форматування чисел і цін для користувача (UAH, українська типографіка). */
import type { PriceRange } from "./types";

const NBSP = " ";
const MINUS = "−";

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 52000 → "52 000" (U+00A0 as thousands separator); decimals use a comma. */
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

/** { p25: 46000, p75: 59000 } → "46 000–59 000 грн". */
export function formatRange(r: PriceRange): string {
  return `${formatNumber(Math.round(r.p25))}–${formatUah(r.p75)}`;
}

/** 31 → "+31%", -12 → "−12%" (true minus sign), 0 → "0%". */
export function formatPct(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "0%";
  return `${r > 0 ? "+" : MINUS}${Math.abs(r)}%`;
}

/** Ukrainian plural: pluralUk(1,"зуб","зуби","зубів") → "зуб". */
export function pluralUk(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
