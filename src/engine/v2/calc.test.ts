import { describe, expect, it } from "vitest";
import { ADJACENT_TABLE, calculate, calculatePresets, listAddons, presetTiers, sevenPlusSegmentScenario } from "./calc";
import { DEFAULT_PARAMS } from "./params";
import type { Params, Tiers } from "./types";
import { makeBook } from "./test-utils";

const classic = presetTiers("classic");
const params = (p: Partial<Params>): Params => ({ ...DEFAULT_PARAMS, ...p });

describe("one tooth (ТЗ §4.1)", () => {
  const book = makeBook();
  it("implant + healing + scan + superstructure + crown, levels independent", () => {
    const total = (implant: Tiers["implant"], crown: Tiers["crown"]) =>
      calculate(book, params({ scope: "individual", teeth: 1 }), { implant, crown }).main;
    expect(total("classic", "classic")).toEqual({ low: 36800, high: 36800 });
    expect(total("premium", "minimum")).toEqual({ low: 28000 + 1800 + 1500 + 5500 + 7000, high: 43800 });
    expect(total("minimum", "premium")?.low).toBe(12000 + 1800 + 1500 + 5500 + 15000);
  });

  it("implant already placed: superstructure + crown + scan", () => {
    const result = calculate(book, params({ toothState: "implant_placed" }), { implant: "premium", crown: "classic" });
    expect(result.main?.low).toBe(5500 + 10000 + 1500);
    expect(result.groups[0].lines.map((l) => l.code)).toEqual(["SUPERSTRUCTURE_SET", "CROWN_IMPLANT", "SCAN_BOTH"]);
    expect(result.implants).toBe(0);
  });

  it("reference price equals one tooth with unknown state", () => {
    const reference = calculate(book, params({ scope: "reference" }), classic);
    expect(reference.kind).toBe("reference");
    expect(reference.main?.low).toBe(36800);
  });

  it("three presets use the same level for both axes", () => {
    const presets = calculatePresets(book, params({}));
    expect(presets.minimum.main?.low).toBe(27800);
    expect(presets.classic.main?.low).toBe(36800);
    expect(presets.premium.main?.low).toBe(51800);
  });
});

describe("several teeth (ТЗ §4.2)", () => {
  const book = makeBook();
  const multi = (teeth: number, arrangement: Params["arrangement"]) =>
    calculate(book, params({ teeth, arrangement }), classic);
  const formula = (implants: number, crowns: number) =>
    implants * 18000 + implants * 1800 + 1500 + implants * 5500 + crowns * 10000;

  it("adjacent follows the table", () => {
    for (const [n, [implants, crowns]] of Object.entries(ADJACENT_TABLE)) {
      const r = multi(Number(n), "adjacent");
      expect(r.main?.low, `adjacent ${n}`).toBe(formula(implants, crowns));
      expect(r.main?.high).toBe(r.main?.low);
      expect(r.implants).toBe(implants);
    }
    expect(ADJACENT_TABLE).toEqual({ 2: [2, 2], 3: [2, 3], 4: [2, 4], 5: [3, 5], 6: [3, 6] });
  });

  it("separate: one implant and one crown per tooth, scan once", () => {
    for (let n = 2; n <= 6; n += 1) {
      const r = multi(n, "separate");
      expect(r.main?.low).toBe(formula(n, n));
      expect(r.groups[0].lines.find((l) => l.code === "SCAN_BOTH")?.qty).toBe(1);
    }
  });

  it("mixed and unknown: range from the bridge to separate implants, with an explanation", () => {
    for (const arrangement of ["mixed", "unknown"] as const) {
      const r = multi(4, arrangement);
      expect(r.main).toEqual({ low: formula(2, 4), high: formula(4, 4) });
      expect(r.groups).toHaveLength(2);
      expect(r.rangeNote).toContain("визначає лікар");
    }
  });

  it("2 teeth: both variants coincide, so the range collapses", () => {
    const r = multi(2, "unknown");
    expect(r.main?.low).toBe(r.main?.high);
  });
});

describe("full arch (ТЗ §4.3)", () => {
  const book = makeBook();
  const arch = (jaws: 1 | 2, allOn: 4 | 6 | 8, tiers: Tiers = classic) =>
    calculate(book, params({ scope: jaws === 1 ? "one_jaw" : "both_jaws", jaws, allOn }), tiers);

  it("one jaw: first stage and full treatment", () => {
    const r = arch(1, 4);
    expect(r.main?.low).toBe(4 * 18000 + 4 * 6500 + 38000 + 1500);
    expect(r.permanent?.low).toBe(130000 + 1500);
    expect(r.full?.low).toBe(r.main!.low + r.permanent!.low);
    expect(r.implants).toBe(4);
  });

  it("All-on-6 and All-on-8 scale implants and multiunits", () => {
    expect(arch(1, 6).main?.low).toBe(6 * 18000 + 6 * 6500 + 38000 + 1500);
    expect(arch(1, 8).main?.low).toBe(8 * 18000 + 8 * 6500 + 38000 + 1500);
  });

  it("two jaws double everything except the scan, which stays one per stage", () => {
    const r = arch(2, 4);
    expect(r.main?.low).toBe(8 * 18000 + 8 * 6500 + 2 * 38000 + 1500);
    expect(r.permanent?.low).toBe(2 * 130000 + 1500);
    expect(r.implants).toBe(8);
    const scans = r.groups.flatMap((g) => g.lines).filter((l) => l.code === "SCAN_BOTH");
    expect(scans.map((l) => l.qty)).toEqual([1, 1]);
  });

  it("implant level and permanent-construction level are independent", () => {
    const r = arch(1, 4, { implant: "minimum", crown: "premium" });
    expect(r.main?.low).toBe(4 * 12000 + 4 * 6500 + 38000 + 1500);
    expect(r.permanent?.low).toBe(210000 + 1500);
  });

  it("7+ teeth are All-on plus a (not yet formulated) segmental scenario", () => {
    expect(sevenPlusSegmentScenario()).toBeNull();
    const r = calculate(book, params({ teeth: 7, jaws: 2 }), classic);
    expect(r.kind).toBe("seven_plus");
    expect(r.segment).toBeNull();
    expect(r.main?.low).toBe(8 * 18000 + 8 * 6500 + 2 * 38000 + 1500);
  });
});

describe("missing prices are never invented", () => {
  it("one missing line makes that total null and is reported", () => {
    const book = makeBook({ omit: ["CROWN_IMPLANT|premium"] });
    const r = calculate(book, params({}), { implant: "classic", crown: "premium" });
    expect(r.main).toBeNull();
    expect(r.missing).toEqual(["CROWN_IMPLANT"]);
    expect(r.groups[0].lines.find((l) => l.code === "CROWN_IMPLANT")?.totalUah).toBeNull();
    // other levels still work
    expect(calculate(book, params({}), classic).main?.low).toBe(36800);
    expect(calculatePresets(book, params({})).premium.main).toBeNull();
  });

  it("range and arch totals become null as well", () => {
    const noMulti = makeBook({ omit: ["MULTIUNIT|common"] });
    const r = calculate(noMulti, params({ scope: "one_jaw" }), classic);
    expect(r.main).toBeNull();
    expect(r.full).toBeNull();
    const noSuper = makeBook({ omit: ["SUPERSTRUCTURE_SET|common"] });
    expect(calculate(noSuper, params({ teeth: 3, arrangement: "unknown" }), classic).main).toBeNull();
  });

  it("no prices at all → everything null, no source", () => {
    const book = { ...makeBook(), get: () => undefined };
    const r = calculate(book, params({}), classic);
    expect(r.main).toBeNull();
    expect(r.source).toBeNull();
    expect(r.missing.length).toBe(5);
  });
});

describe("add-ons (ТЗ §4, §6.1)", () => {
  const book = makeBook();
  it("never change any total", () => {
    const p = params({ teethPresent: true });
    const before = calculate(book, p, classic).main;
    const items = listAddons(book, p);
    expect(items.length).toBeGreaterThan(0);
    expect(calculate(book, p, classic).main).toEqual(before);
    expect(before?.low).toBe(36800);
  });

  it("highlights extraction first when the teeth are still present", () => {
    const items = listAddons(book, params({ teethPresent: true }));
    expect(items.slice(0, 2).map((i) => i.code)).toEqual(["EXTRACTION_SIMPLE", "EXTRACTION_COMPLEX"]);
    expect(items.slice(0, 2).every((i) => i.highlight)).toBe(true);
    expect(listAddons(book, params({})).some((i) => i.highlight)).toBe(false);
  });

  it("a full arch has its own temporary teeth: no TEMP_CROWN_UNIT add-on", () => {
    expect(listAddons(book, params({ scope: "one_jaw" })).some((i) => i.code === "TEMP_CROWN_UNIT")).toBe(false);
    expect(listAddons(book, params({})).some((i) => i.code === "TEMP_CROWN_UNIT")).toBe(true);
  });

  it("lists only add-ons with a published price", () => {
    const items = listAddons(makeBook({ omit: ["SINUS|common"] }), params({}));
    expect(items.some((i) => i.code === "SINUS")).toBe(false);
  });
});

describe("price source of a result (ТЗ §6.1)", () => {
  it("all aggregate → clinic count (the smallest), city and oldest date", () => {
    const book = makeBook({
      source: "aggregate",
      patch: { "IMPLANT_INSTALL|classic": { clinic_count: 3, calculated_at: "2026-09-30T00:00:00Z" } },
    });
    const { source } = calculate(book, params({}), classic);
    expect(source).toMatchObject({
      kind: "aggregate",
      label: "на основі прайсів 3 клінік",
      clinicCount: 3,
      dateIso: "2026-09-30",
      city: "Львів",
      mixed: false,
      demo: true,
    });
  });

  it("any manual line → статистичний орієнтир Denva (mixed)", () => {
    const book = makeBook({
      source: "aggregate",
      patch: { "IMPLANT_INSTALL|classic": { source_type: "manual_override", clinic_count: null, calculated_at: null } },
    });
    const { source } = calculate(book, params({}), classic);
    expect(source).toMatchObject({ kind: "manual", label: "статистичний орієнтир Denva", mixed: true });
  });

  it("regional fallback is the strongest caveat", () => {
    const book = makeBook({ patch: { "CROWN_IMPLANT|classic": { source_type: "regional_fallback" } } });
    expect(calculate(book, params({}), classic).source).toMatchObject({
      kind: "regional",
      label: "середня ціна регіону",
      mixed: true,
    });
    expect(calculate(makeBook({ source: "regional_fallback" }), params({}), classic).source?.mixed).toBe(false);
  });

  it("only the prices a result uses count", () => {
    // The minimum crown is regional, but a classic result never reads it.
    const book = makeBook({ patch: { "CROWN_IMPLANT|minimum": { source_type: "regional_fallback" } } });
    expect(calculate(book, params({}), classic).source?.kind).toBe("manual");
    expect(calculate(book, params({}), presetTiers("minimum")).source?.kind).toBe("regional");
  });

  it("date is the oldest of calculated_at / published_at; demo flag follows the data", () => {
    const book = makeBook({
      demo: false,
      publishedAt: "2026-10-09T08:00:00Z",
      patch: { "SCAN_BOTH|common": { published_at: "2026-08-01T00:00:00Z" } },
    });
    const { source } = calculate(book, params({}), classic);
    expect(source?.dateIso).toBe("2026-08-01");
    expect(source?.demo).toBe(false);
  });
});
