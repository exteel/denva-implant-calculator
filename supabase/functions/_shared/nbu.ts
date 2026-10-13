/** Розбір відповіді API НБУ: /NBUStatService/v1/statdirectory/exchange?valcode=EUR&json */

export interface NbuRate {
  currency: "EUR" | "USD";
  rate_to_uah: number;
  rate_date: string; // YYYY-MM-DD
}

export const NBU_URL = (code: "EUR" | "USD") =>
  `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${code}&json`;

/** «09.10.2026» → «2026-10-09». */
export function parseNbuDate(value: unknown): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value ?? ""));
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${yyyy}-${mm}-${dd}`) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export function parseNbuRate(json: unknown, code: "EUR" | "USD"): NbuRate | null {
  if (!Array.isArray(json)) return null;
  const item = json.find((x) => x && typeof x === "object" && (x as { cc?: unknown }).cc === code) as
    | { rate?: unknown; exchangedate?: unknown }
    | undefined;
  if (!item) return null;
  const rate = typeof item.rate === "number" ? item.rate : Number(item.rate);
  const date = parseNbuDate(item.exchangedate);
  if (!Number.isFinite(rate) || rate <= 0 || !date) return null;
  return { currency: code, rate_to_uah: rate, rate_date: date };
}
