import { describe, it, expect } from "vitest";
import { CTA_LABELS, routeCta } from "./routing";
import type { ComparisonResult, Qualification, Resolution } from "./types";

const noQual: Qualification = { hasCt: false, hasPlan: false, hasQuote: false };

function res(over: Omit<Partial<Resolution>, "flags"> & { flags?: Partial<Resolution["flags"]> } = {}): Resolution {
  const { flags, ...rest } = over;
  return {
    kind: "priced",
    scenarios: [],
    clinicalConfidence: "MEDIUM_HIGH",
    title: "t",
    assumptions: ["a"],
    relevantExtras: [],
    comparisonScope: "teeth",
    flags: { massExtraction: false, unsureSave: false, existingImplants: false, tempCrownOption: false, ...flags },
    ...rest,
  };
}

const unclear: ComparisonResult = { comparable: false, reason: "r", unclearOffer: true };
const notComparableClear: ComparisonResult = { comparable: false, reason: "r", unclearOffer: false };

describe("routeCta priority (ТЗ §15)", () => {
  it("1. mass extraction → CheckMyPlan, even with a plan, CT and an unclear offer", () => {
    const cta = routeCta({
      resolution: res({ flags: { massExtraction: true } }),
      qualification: { hasCt: true, hasPlan: true, hasQuote: true },
      comparison: unclear,
    });
    expect(cta.service).toBe("checkmyplan");
    expect(cta.label).toBe("Перевірити план перед лікуванням");
    expect(cta.event).toBe("cta_checkmyplan");
  });

  it("2. non-comparable + unclear offer → CheckMyPlan line by line (beats plan/CT)", () => {
    const cta = routeCta({
      resolution: res(),
      qualification: { hasCt: true, hasPlan: true, hasQuote: true },
      comparison: unclear,
    });
    expect(cta.service).toBe("checkmyplan");
    expect(cta.label).toBe("Розібрати мою пропозицію по пунктах");
  });

  it("2b. non-comparable but NOT unclear does not trigger rule 2", () => {
    const cta = routeCta({ resolution: res(), qualification: noQual, comparison: notComparableClear });
    expect(cta.service).toBe("tender");
  });

  it("2c. a comparable result does not trigger rule 2", () => {
    const comparison: ComparisonResult = {
      comparable: true,
      offerUah: 1,
      range: { p25: 1, median: 1, p75: 1 },
      deviationPct: 0,
      position: "within_typical",
      headline: "h",
      explanation: "e",
      basisLabel: "b",
      addedExtras: [],
    };
    expect(routeCta({ resolution: res(), qualification: noQual, comparison }).service).toBe("tender");
  });

  it("2d. a comparable offer above the market range → line-by-line review", () => {
    const comparison: ComparisonResult = {
      comparable: true,
      offerUah: 68000,
      range: { p25: 31300, median: 36800, p75: 43400 },
      deviationPct: 85,
      position: "above",
      headline: "h",
      explanation: "e",
      basisLabel: "b",
      addedExtras: [],
    };
    const cta = routeCta({ resolution: res(), qualification: noQual, comparison });
    expect(cta.service).toBe("checkmyplan");
    expect(cta.label).toBe("Розібрати мою пропозицію по пунктах");
  });

  it("3. has plan → CheckMyPlan 'Перевірити мій план' (beats CT)", () => {
    const cta = routeCta({ resolution: res(), qualification: { hasCt: true, hasPlan: true, hasQuote: false } });
    expect(cta.service).toBe("checkmyplan");
    expect(cta.label).toBe("Перевірити мій план");
    expect(cta.event).toBe("cta_checkmyplan");
  });

  it("4. has CT → CT analysis", () => {
    const cta = routeCta({
      resolution: res({ kind: "no_basket", clinicalConfidence: "LOW" }),
      qualification: { hasCt: true, hasPlan: false, hasQuote: false },
    });
    expect(cta.service).toBe("ct");
    expect(cta.label).toBe("Перевірити ситуацію за КТ");
    expect(cta.event).toBe("cta_ct");
  });

  it("5. no_basket / unsureSave / LOW / LOW_MEDIUM → consultation", () => {
    const cases: Resolution[] = [
      res({ kind: "no_basket" }),
      res({ flags: { unsureSave: true } }),
      res({ clinicalConfidence: "LOW" }),
      res({ clinicalConfidence: "LOW_MEDIUM" }),
    ];
    for (const resolution of cases) {
      const cta = routeCta({ resolution, qualification: noQual });
      expect(cta.service).toBe("consultation");
      expect(cta.label).toBe("Розібрати мою ситуацію");
      expect(cta.event).toBe("cta_consultation");
    }
  });

  it("6. clear scenario → tender", () => {
    for (const clinicalConfidence of ["MEDIUM", "MEDIUM_HIGH", "HIGH"] as const) {
      const cta = routeCta({ resolution: res({ clinicalConfidence }), qualification: noQual, comparison: null });
      expect(cta.service).toBe("tender");
      expect(cta.label).toBe("Отримати пропозиції від клінік");
      expect(cta.event).toBe("cta_tender");
    }
  });

  it("a quote alone (hasQuote) does not change the route", () => {
    const cta = routeCta({ resolution: res(), qualification: { ...noQual, hasQuote: true } });
    expect(cta.service).toBe("tender");
  });

  it("always returns a calm one-sentence reason and never 'переплачу'", () => {
    const inputs = [
      { resolution: res({ flags: { massExtraction: true } }), qualification: noQual },
      { resolution: res(), qualification: noQual, comparison: unclear },
      { resolution: res(), qualification: { ...noQual, hasPlan: true } },
      { resolution: res(), qualification: { ...noQual, hasCt: true } },
      { resolution: res({ kind: "no_basket" }), qualification: noQual },
      { resolution: res(), qualification: noQual },
    ];
    for (const input of inputs) {
      const cta = routeCta(input);
      expect(cta.reason.length).toBeGreaterThan(10);
      expect(cta.reason.endsWith(".")).toBe(true);
      expect((cta.reason.match(/\./g) ?? []).length).toBe(1);
      expect(JSON.stringify(cta).toLowerCase()).not.toContain("переплачу");
    }
  });

  it("exposes the ТЗ labels", () => {
    expect(Object.values(CTA_LABELS)).toEqual(
      expect.arrayContaining([
        "Перевірити мій план",
        "Перевірити ситуацію за КТ",
        "Розібрати мою ситуацію",
        "Отримати пропозиції від клінік",
        "Перевірити план перед лікуванням",
        "Розібрати мою пропозицію по пунктах",
      ]),
    );
  });
});
