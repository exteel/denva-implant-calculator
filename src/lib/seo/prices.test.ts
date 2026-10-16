import { describe, expect, it } from "vitest";
import { SERVICE_CODES as C } from "@/lib/contracts";
import { additionalCostGroups, summarizeCityPrices } from "./prices";
import { EXPECTED, makeCityPage, makePrices } from "./test-utils";

function row(summary: ReturnType<typeof summarizeCityPrices>, id: string) {
  const found = summary.rows.find((r) => r.id === id);
  if (!found) throw new Error(`no row ${id}`);
  return found;
}

describe("summarizeCityPrices", () => {
  it("computes one tooth and All-on-4/6 per tier with the shared engine", () => {
    const summary = summarizeCityPrices(makeCityPage());
    expect(row(summary, "one-tooth").values).toEqual(EXPECTED.oneTooth);
    expect(row(summary, "aox4-first").values.classic).toBe(EXPECTED.aox4First.classic);
    expect(row(summary, "aox4-full").values.classic).toBe(EXPECTED.aox4Full.classic);
    expect(row(summary, "aox6-first").values.classic).toBe(EXPECTED.aox6First.classic);
    expect(row(summary, "aox6-full").values.classic).toBe(EXPECTED.aox6Full.classic);
    expect(summary.complete).toBe(true);
  });

  it("describes the source per ТЗ §6.1 and the data date", () => {
    const { meta } = summarizeCityPrices(makeCityPage());
    expect(meta?.localClinicCount).toBe(3);
    expect(meta?.sourceText).toBe("Розраховано на основі перевірених прайсів 3 клінік міста");
    expect(meta?.dataDate).toBe("2026-10-08T03:00:00Z");
    expect(meta?.isDemo).toBe(false);
  });

  it("uses the baseline wording when there are no local clinics", () => {
    const prices = makePrices({ source_type: "regional_fallback", source_scope: "region", local_clinic_count: 0, baseline_scope: "region" });
    const { meta } = summarizeCityPrices(makeCityPage("published", { prices }));
    expect(meta?.sourceText).toBe("Використано середній ринковий орієнтир області");
  });

  it("never invents a number for a missing price", () => {
    const prices = makePrices().filter((p) => p.service_code !== C.MULTIUNIT);
    const summary = summarizeCityPrices(makeCityPage("published", { prices }));
    expect(row(summary, "one-tooth").values.classic).toBe(EXPECTED.oneTooth.classic);
    expect(row(summary, "aox4-first").values.classic).toBeNull();
    expect(row(summary, "aox4-full").values.classic).toBeNull();
    expect(summary.complete).toBe(false);
  });

  it("returns no meta when the city has no prices", () => {
    const summary = summarizeCityPrices(makeCityPage("review", { prices: [] }));
    expect(summary.meta).toBeNull();
    expect(summary.rows.every((r) => Object.values(r.values).every((v) => v === null))).toBe(true);
  });
});

describe("additionalCostGroups", () => {
  it("lists only additional services that have a city price", () => {
    const page = makeCityPage();
    const groups = additionalCostGroups(page);
    expect(groups.map((g) => g.category)).toEqual(["Діагностика", "Додаткові втручання"]);
    expect(groups.flatMap((g) => g.items.map((i) => i.code))).toEqual([C.CT_ONE_JAW, C.SINUS_LIFT]);
    const without = additionalCostGroups({ ...page, prices: page.prices.filter((p) => p.service_code !== C.SINUS_LIFT) });
    expect(without.flatMap((g) => g.items.map((i) => i.code))).toEqual([C.CT_ONE_JAW]);
  });
});
