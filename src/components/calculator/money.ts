import { formatEurRange, formatUahRange, type Range } from "@/engine/v2";

export const NO_DATA = "Даних поки недостатньо";

export function uahText(range: Range | null): string {
  return range ? formatUahRange(range) : NO_DATA;
}

/** "≈ 1 220 €" or null when there is no amount / no rate. */
export function eurText(range: Range | null, rate: { rate: number } | null): string | null {
  return range && rate ? formatEurRange(range, rate.rate) : null;
}
