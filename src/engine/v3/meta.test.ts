import { describe, expect, it } from "vitest";
import { calculateQuote } from "./calc";
import { clinicsGenitive, sourceSentence } from "./sentence";
import { jawInput, makeBook } from "./test-utils";

const upper = jawInput({ tooth_count: 1 });

describe("priceMeta (ТЗ §8.1)", () => {
  it("currency, EUR rate, demo flag and the oldest date", () => {
    const book = makeBook({
      published_at: "2026-10-09T08:00:00Z",
      patch: { "SCAN_JAW_STAGE|common": { published_at: "2026-08-01T00:00:00Z" } },
    });
    const { priceMeta } = calculateQuote(upper, null, book);
    expect(priceMeta.currency).toBe("UAH");
    expect(priceMeta.eur_rate).toEqual({ rate: 50.1385, date: "2026-10-09" });
    expect(priceMeta.is_demo).toBe(true);
    expect(priceMeta.calculated_at).toBe("2026-08-01T00:00:00Z");
    expect(calculateQuote(upper, null, makeBook({ demo: false })).priceMeta.is_demo).toBe(false);
  });

  it("prefers calculated_at over published_at per price", () => {
    const book = makeBook({ calculated_at: "2026-09-30T00:00:00Z" });
    expect(calculateQuote(upper, null, book).priceMeta.calculated_at).toBe("2026-09-30T00:00:00Z");
  });

  it("source_scope is the weakest scope of the used prices", () => {
    const book = makeBook({ patch: { "CROWN_IMPLANT|classic": { source_scope: "region", baseline_scope: "region", source_type: "regional_fallback" } } });
    const meta = calculateQuote(upper, null, book).priceMeta;
    expect(meta.source_scope).toBe("region");
    expect(meta.baseline_scope).toBe("region");
    const country = makeBook({ patch: { "SCAN_JAW_STAGE|common": { source_scope: "country", baseline_scope: "country" } } });
    expect(calculateQuote(upper, null, country).priceMeta.source_scope).toBe("country");
  });

  it("only the prices a quote uses count (other tiers are ignored)", () => {
    const book = makeBook({ patch: { "CROWN_IMPLANT|minimum": { source_scope: "country" } } });
    expect(calculateQuote(upper, null, book).priceMeta.source_scope).toBe("city");
    expect(calculateQuote(jawInput({ crown_or_arch_tier: "minimum" }), null, book).priceMeta.source_scope).toBe("country");
  });

  it("local_clinic_count comes from the implant line; blend weights with it", () => {
    const weights = { local: 2 / 3, baseline: 1 / 3 };
    const book = makeBook({
      patch: {
        "IMPLANT_INSTALL|classic": { local_clinic_count: 2, source_type: "hybrid", blend_weights: weights },
        "CROWN_IMPLANT|classic": { local_clinic_count: 5 },
      },
    });
    const meta = calculateQuote(upper, null, book).priceMeta;
    expect(meta.local_clinic_count).toBe(2);
    expect(meta.blend_weights).toEqual(weights);
  });

  it("without an implant line (installed implants) the construction line decides", () => {
    const book = makeBook({
      patch: { "IMPLANT_INSTALL|classic": { local_clinic_count: 7 }, "CROWN_IMPLANT|classic": { local_clinic_count: 1 } },
    });
    const installed = jawInput({ tooth_count: 2, status: "implants_installed", installed_implant_count: 1 });
    expect(calculateQuote(installed, null, book).priceMeta.local_clinic_count).toBe(1);
  });

  it("two jaws take the minimum", () => {
    const book = makeBook({ patch: { "IMPLANT_INSTALL|premium": { local_clinic_count: 1 }, "IMPLANT_INSTALL|classic": { local_clinic_count: 4 } } });
    const meta = calculateQuote(upper, jawInput({ jaw: "lower", implant_tier: "premium" }), book).priceMeta;
    expect(meta.local_clinic_count).toBe(1);
  });

  it("falls back to a conservative default when nothing was priced", () => {
    const meta = calculateQuote(null, null, makeBook()).priceMeta;
    expect(meta).toMatchObject({ source_scope: "country", baseline_scope: null, local_clinic_count: 0, blend_weights: null, calculated_at: null, is_demo: false });
    const sparse = makeBook({ omit: ["IMPLANT_INSTALL|classic"] });
    expect(calculateQuote(upper, null, sparse).priceMeta.source_scope).toBe("city");
  });
});

describe("source sentence (ТЗ §6.1)", () => {
  const s = (n: number, source_scope: "city" | "region" | "country", baseline_scope: "city" | "region" | "country" | null = null) =>
    sourceSentence({ local_clinic_count: n, source_scope, baseline_scope });

  it("0 clinics: the market benchmark of the city / region / Ukraine", () => {
    expect(s(0, "city")).toBe("Використано середній ринковий орієнтир міста");
    expect(s(0, "region")).toBe("Використано середній ринковий орієнтир області");
    expect(s(0, "country")).toBe("Використано середній ринковий орієнтир України");
  });

  it("1–2 clinics: verified prices plus the market data of the baseline scope", () => {
    expect(s(1, "city", "city")).toBe("Враховано перевірені прайси 1 клініки міста та середні ринкові дані міста");
    expect(s(2, "city", "region")).toBe("Враховано перевірені прайси 2 клінік міста та середні ринкові дані області");
    expect(s(2, "city", "country")).toBe("Враховано перевірені прайси 2 клінік міста та середні ринкові дані України");
    // no baseline scope reported → the source scope
    expect(s(1, "region")).toBe("Враховано перевірені прайси 1 клініки міста та середні ринкові дані області");
  });

  it("3+ clinics: computed from the verified prices of the city", () => {
    expect(s(3, "city")).toBe("Розраховано на основі перевірених прайсів 3 клінік міста");
    expect(s(5, "city", "country")).toBe("Розраховано на основі перевірених прайсів 5 клінік міста");
    expect(s(21, "city")).toBe("Розраховано на основі перевірених прайсів 21 клініки міста");
  });

  it("negative or fractional counts do not break it", () => {
    expect(s(-1, "city")).toBe("Використано середній ринковий орієнтир міста");
    expect(s(2.9, "city", "city")).toContain("2 клінік");
  });

  it("genitive plural after the number", () => {
    expect([1, 2, 3, 4, 5, 11, 12, 21, 22, 25, 101].map(clinicsGenitive)).toEqual([
      "клініки", "клінік", "клінік", "клінік", "клінік", "клінік", "клінік", "клініки", "клінік", "клінік", "клініки",
    ]);
  });
});
