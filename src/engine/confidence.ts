/** Впевненість у ринкових даних (ТЗ §16.2). */
import type {
  ClinicalConfidence,
  MarketConfidence,
} from "./types";

/** A geo scope counts as "sufficient" for local pricing when n ≥ this. */
export const MIN_LOCAL_OBSERVATIONS = 10;

const ORDER: MarketConfidence[] = ["LOW", "MEDIUM", "HIGH"];

function downgrade(level: MarketConfidence): MarketConfidence {
  return ORDER[Math.max(0, ORDER.indexOf(level) - 1)];
}

/** True when `updatedAt` is more than 12 months before `now`. */
export function isStale(updatedAt: string, now: Date): boolean {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return true;
  // Day granularity (UTC): a record dated exactly 12 months ago is still fresh.
  const limit = Date.UTC(
    now.getUTCFullYear() - 1,
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return updated.getTime() < limit;
}

/** HIGH n ≥ 30, MEDIUM 10–29, LOW < 10; one level down when older than 12 months. */
export function marketConfidence(
  n: number,
  updatedAt: string,
  now: Date = new Date(),
): MarketConfidence {
  let level: MarketConfidence =
    n >= 30 ? "HIGH" : n >= MIN_LOCAL_OBSERVATIONS ? "MEDIUM" : "LOW";
  if (isStale(updatedAt, now)) level = downgrade(level);
  return level;
}

/** Lowest level wins (LOW < MEDIUM < HIGH). Empty list → LOW. */
export function minMarketConfidence(
  levels: MarketConfidence[],
): MarketConfidence {
  if (levels.length === 0) return "LOW";
  return levels.reduce((min, l) =>
    ORDER.indexOf(l) < ORDER.indexOf(min) ? l : min,
  );
}

export const MARKET_CONFIDENCE_LABEL: Record<MarketConfidence, string> = {
  HIGH: "Висока",
  MEDIUM: "Середня",
  LOW: "Низька",
};

export const CLINICAL_CONFIDENCE_LABEL: Record<ClinicalConfidence, string> = {
  HIGH: "Висока",
  MEDIUM_HIGH: "Середня–висока",
  MEDIUM: "Середня",
  LOW_MEDIUM: "Низька–середня",
  LOW: "Низька",
};

export const MARKET_CONFIDENCE_EXPLANATION: Record<MarketConfidence, string> = {
  HIGH: "Достатньо незалежних цін для цього регіону.",
  MEDIUM:
    "Цін для цього регіону достатньо для орієнтиру, але вибірка помірна.",
  LOW: "Даних для цього регіону мало або вони не нові, тому орієнтир приблизний.",
};
