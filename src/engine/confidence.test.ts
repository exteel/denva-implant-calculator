import { describe, it, expect } from "vitest";
import {
  CLINICAL_CONFIDENCE_LABEL,
  MARKET_CONFIDENCE_EXPLANATION,
  MARKET_CONFIDENCE_LABEL,
  MIN_LOCAL_OBSERVATIONS,
  marketConfidence,
  minMarketConfidence,
} from "./confidence";

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
