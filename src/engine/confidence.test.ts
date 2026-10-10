import { describe, it, expect } from "vitest";
import {
  CLINICAL_CONFIDENCE_LABEL,
  MARKET_CONFIDENCE_EXPLANATION,
  MARKET_CONFIDENCE_LABEL,
  MIN_LOCAL_OBSERVATIONS,
  assessMarketRecord,
  isCompleteRecord,
  isSufficientRecord,
  marketConfidence,
  minMarketConfidence,
} from "./confidence";
import type { MarketPriceRecord } from "./types";

const NOW = new Date("2026-10-09T12:00:00Z");
const FRESH = "2026-09-01";

describe("marketConfidence", () => {
  it("thresholds: HIGH ≥30, MEDIUM 10–29, LOW <10", () => {
    expect(marketConfidence(120, FRESH, NOW)).toBe("HIGH");
    expect(marketConfidence(30, FRESH, NOW)).toBe("HIGH");
    expect(marketConfidence(29, FRESH, NOW)).toBe("MEDIUM");
    expect(marketConfidence(10, FRESH, NOW)).toBe("MEDIUM");
    expect(marketConfidence(9, FRESH, NOW)).toBe("LOW");
    expect(marketConfidence(0, FRESH, NOW)).toBe("LOW");
    expect(MIN_LOCAL_OBSERVATIONS).toBe(10);
  });

  it("downgrades one level when older than 12 months", () => {
    expect(marketConfidence(50, "2025-06-15", NOW)).toBe("MEDIUM");
    expect(marketConfidence(11, "2025-06-15", NOW)).toBe("LOW");
    expect(marketConfidence(3, "2025-06-15", NOW)).toBe("LOW");
  });

  it("does not downgrade at exactly 12 months or younger", () => {
    expect(marketConfidence(50, "2025-10-09", NOW)).toBe("HIGH");
    expect(marketConfidence(50, "2025-10-10", NOW)).toBe("HIGH");
    expect(marketConfidence(50, "2025-10-08", NOW)).toBe("MEDIUM");
  });
});

describe("minMarketConfidence", () => {
  it("returns the lowest level", () => {
    expect(minMarketConfidence(["HIGH", "MEDIUM", "HIGH"])).toBe("MEDIUM");
    expect(minMarketConfidence(["HIGH", "HIGH"])).toBe("HIGH");
    expect(minMarketConfidence(["MEDIUM", "LOW", "HIGH"])).toBe("LOW");
  });
});

describe("labels", () => {
  it("are Ukrainian and complete", () => {
    expect(MARKET_CONFIDENCE_LABEL).toEqual({
      HIGH: "Висока",
      MEDIUM: "Середня",
      LOW: "Низька",
    });
    expect(CLINICAL_CONFIDENCE_LABEL.MEDIUM_HIGH).toBe("Середня–висока");
    expect(CLINICAL_CONFIDENCE_LABEL.LOW_MEDIUM).toBe("Низька–середня");
    for (const k of ["HIGH", "MEDIUM", "LOW"] as const) {
      expect(MARKET_CONFIDENCE_EXPLANATION[k].length).toBeGreaterThan(10);
    }
  });
});

describe("assessMarketRecord — ТЗ §16.2 (n, completeness, recency, source diversity)", () => {
  const NOW_ = new Date("2026-10-01T00:00:00Z");
  const base: MarketPriceRecord = {
    service_or_basket: "IMPLANT_SURGICAL",
    geo_scope: { level: "city", id: "kyiv" },
    segment: "OPTIMAL",
    p25: 17000,
    median: 20000,
    p75: 23500,
    n: 40,
    source_mix: { clinics: 14, sources: ["clinic_sites", "price_lists"] },
    updated_at: "2026-09-01",
    original_currency: "UAH",
    is_demo: true,
  };
  const rec = (over: Partial<MarketPriceRecord>): MarketPriceRecord => ({ ...base, ...over });

  it("n ≥ 30, ≥ 10 clinics, ≥ 2 source types, fresh → HIGH with no reasons", () => {
    expect(assessMarketRecord(base, NOW_)).toEqual({ level: "HIGH", reasons: [] });
  });

  it("n thresholds: 10–29 → MEDIUM, < 10 → LOW", () => {
    expect(assessMarketRecord(rec({ n: 20 }), NOW_).level).toBe("MEDIUM");
    expect(assessMarketRecord(rec({ n: 9 }), NOW_).level).toBe("LOW");
    expect(assessMarketRecord(rec({ n: 20 }), NOW_).reasons).toContain("few_observations");
  });

  it("a single source type lowers one level", () => {
    const r = assessMarketRecord(rec({ source_mix: { clinics: 14, sources: ["clinic_sites"] } }), NOW_);
    expect(r.level).toBe("MEDIUM");
    expect(r.reasons).toContain("single_source_type");
  });

  it("HIGH needs ≥ 10 clinics; fewer than 3 clinics is weak quality → LOW", () => {
    expect(assessMarketRecord(rec({ source_mix: { clinics: 6, sources: ["a", "b"] } }), NOW_).level).toBe("MEDIUM");
    const weak = assessMarketRecord(rec({ source_mix: { clinics: 2, sources: ["a", "b"] } }), NOW_);
    expect(weak.level).toBe("LOW");
    expect(weak.reasons).toContain("few_clinics");
  });

  it("data older than 12 months lowers one level", () => {
    const r = assessMarketRecord(rec({ updated_at: "2025-06-01" }), NOW_);
    expect(r.level).toBe("MEDIUM");
    expect(r.reasons).toContain("stale");
  });

  it("an incomplete record is LOW", () => {
    expect(assessMarketRecord(rec({ p75: 0 }), NOW_)).toEqual({ level: "LOW", reasons: ["incomplete"] });
    expect(assessMarketRecord(rec({ p25: 30000 }), NOW_).level).toBe("LOW");
    expect(isCompleteRecord(base)).toBe(true);
  });

  it("weak-quality records are not sufficient for local pricing (fallback goes broader)", () => {
    expect(isSufficientRecord(base)).toBe(true);
    expect(isSufficientRecord(rec({ n: 9 }))).toBe(false);
    expect(isSufficientRecord(rec({ source_mix: { clinics: 2, sources: ["a", "b"] } }))).toBe(false);
  });
});
