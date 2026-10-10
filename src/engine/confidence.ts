/** Впевненість у ринкових даних (ТЗ §16.2). */
import type {
  ClinicalConfidence,
  MarketConfidence,
  MarketConfidenceReason,
  MarketPriceRecord,
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

/**
 * ТЗ §16.2 quality thresholds. Preliminary — the spec says they must be
 * re-checked on real data, so they live here as named constants.
 */
export const MARKET_QUALITY = {
  /** HIGH needs at least this many independent clinics behind the n. */
  minClinicsForHigh: 10,
  /** Fewer clinics than this = observations aren't independent → LOW. */
  minClinics: 3,
  /** HIGH needs at least this many distinct source types (sites, price lists, quotes…). */
  minSourceTypesForHigh: 2,
} as const;

/** Record has every field ТЗ §17 requires, with sane values. */
export function isCompleteRecord(r: MarketPriceRecord): boolean {
  const nums = [r.p25, r.median, r.p75, r.n];
  return (
    nums.every((v) => typeof v === "number" && Number.isFinite(v) && v > 0) &&
    r.p25 <= r.median &&
    r.median <= r.p75 &&
    !Number.isNaN(new Date(r.updated_at).getTime()) &&
    Array.isArray(r.source_mix?.sources) &&
    typeof r.source_mix?.clinics === "number"
  );
}

export interface MarketAssessment {
  level: MarketConfidence;
  reasons: MarketConfidenceReason[];
}

/**
 * ТЗ §16.2: confidence from the number of independent observations,
 * completeness, recency and diversity of sources.
 * - n: HIGH ≥ 30, MEDIUM 10–29, LOW < 10
 * - incomplete record or < 3 clinics ("слабка якість даних") → LOW
 * - one source type only → one level down
 * - HIGH also needs ≥ 10 clinics (otherwise capped at MEDIUM)
 * - older than 12 months → one level down
 */
export function assessMarketRecord(
  record: MarketPriceRecord,
  now: Date = new Date(),
): MarketAssessment {
  const reasons: MarketConfidenceReason[] = [];
  if (!isCompleteRecord(record)) return { level: "LOW", reasons: ["incomplete"] };

  let level: MarketConfidence =
    record.n >= 30 ? "HIGH" : record.n >= MIN_LOCAL_OBSERVATIONS ? "MEDIUM" : "LOW";
  if (level !== "HIGH") reasons.push("few_observations");

  const clinics = record.source_mix.clinics;
  const sourceTypes = new Set(record.source_mix.sources).size;
  if (clinics < MARKET_QUALITY.minClinics) {
    level = "LOW";
    reasons.push("few_clinics");
  } else if (level === "HIGH" && clinics < MARKET_QUALITY.minClinicsForHigh) {
    level = "MEDIUM";
    reasons.push("few_clinics");
  }
  if (sourceTypes < MARKET_QUALITY.minSourceTypesForHigh) {
    level = downgrade(level);
    reasons.push("single_source_type");
  }
  if (isStale(record.updated_at, now)) {
    level = downgrade(level);
    reasons.push("stale");
  }
  return { level, reasons };
}

/**
 * Whether a geo scope's record is good enough to price locally instead of
 * falling back to a broader scope (ТЗ §3 fallback).
 */
export function isSufficientRecord(record: MarketPriceRecord): boolean {
  return (
    record.n >= MIN_LOCAL_OBSERVATIONS &&
    isCompleteRecord(record) &&
    record.source_mix.clinics >= MARKET_QUALITY.minClinics
  );
}

export const MARKET_CONFIDENCE_REASON_TEXT: Record<MarketConfidenceReason, string> = {
  few_observations: "незалежних цін поки небагато",
  stale: "частина даних старша за 12 місяців",
  single_source_type: "ціни лише з одного типу джерел",
  few_clinics: "ціни зібрано в невеликої кількості клінік",
  incomplete: "частина записів неповна",
};

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
  LOW: "Даних для цього регіону мало, вони не нові або з обмеженої кількості джерел, тому орієнтир приблизний.",
};
