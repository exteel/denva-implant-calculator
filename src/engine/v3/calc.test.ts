import { describe, expect, it } from "vitest";
import { ADJACENT_TABLE, calculateJaw, calculateJawFromRange, calculateQuote, installedBounds } from "./calc";
import { jawInput, makeBook } from "./test-utils";

const book = makeBook();

// classic implant set per implant: implant 18000 + healing 1800 + superstructure 5500
const SET = 18000 + 1800 + 5500;
const SCAN = 1200;
const CROWN = 10000;

const total = (c: { total: { low: number; high: number } }) => c.total;

describe("1 tooth (ТЗ §4.2)", () => {
  it("implant + healing + scan + superstructure + crown", () => {
    const r = calculateJaw(jawInput({ tooth_count: 1 }), book);
    expect(r.scenario).toBe("single");
    expect(total(r)).toEqual({ low: SET + SCAN + CROWN, high: SET + SCAN + CROWN });
    expect(r.implant_count).toEqual({ low: 1, high: 1 });
    expect(r.prosthetic_units).toBe(1);
    expect(r.first_stage).toBeNull();
    expect(r.missing_codes).toEqual([]);
    expect(r.alternatives).toEqual([]);
  });

  it("implant tier and crown tier are independent, per service via tier_source", () => {
    const r = calculateJaw(jawInput({ implant_tier: "premium", crown_or_arch_tier: "minimum" }), book);
    // premium implant/healing/superstructure + minimum crown
    expect(r.total.low).toBe(28000 + 2500 + 8000 + SCAN + 7000);
    const byCode = Object.fromEntries(r.components.map((c) => [c.service_code, c.tier]));
    expect(byCode).toMatchObject({
      IMPLANT_INSTALL: "premium",
      HEALING_ABUTMENT: "premium",
      SUPERSTRUCTURE_SET: "premium",
      CROWN_IMPLANT: "minimum",
      SCAN_JAW_STAGE: "common",
    });
  });

  it("the reference price is a single tooth with unknown location marker", () => {
    const r = calculateJaw(jawInput({ status: "unknown", location: "unknown" }), book);
    expect(r.scenario).toBe("reference_single");
    expect(r.total.low).toBe(SET + SCAN + CROWN);
  });

  it("does not round", () => {
    const odd = makeBook({ patch: { "IMPLANT_INSTALL|classic": { value: 18166.666666666668 } } });
    expect(calculateJaw(jawInput(), odd).total.low).toBe(18166.666666666668 + 1800 + 1200 + 5500 + 10000);
  });
});

describe("2–6 teeth (ТЗ §4.3)", () => {
  const formula = (implants: number, units: number) => implants * SET + SCAN + units * CROWN;

  it("adjacent follows the table", () => {
    expect(ADJACENT_TABLE).toEqual({ 2: [2, 2], 3: [2, 3], 4: [2, 4], 5: [3, 5], 6: [3, 6] });
    for (const [n, [implants, units]] of Object.entries(ADJACENT_TABLE)) {
      const r = calculateJaw(jawInput({ tooth_count: Number(n), location: "adjacent" }), book);
      expect(r.scenario).toBe("adjacent");
      expect(r.total).toEqual({ low: formula(implants, units), high: formula(implants, units) });
      expect(r.implant_count).toEqual({ low: implants, high: implants });
      expect(r.prosthetic_units).toBe(units);
    }
  });

  it("separate: one implant and one crown per tooth, scan once", () => {
    for (let n = 2; n <= 6; n += 1) {
      const r = calculateJaw(jawInput({ tooth_count: n, location: "separate" }), book);
      expect(r.scenario).toBe("separate");
      expect(r.total.low).toBe(formula(n, n));
      expect(r.components.find((c) => c.service_code === "SCAN_JAW_STAGE")?.quantity).toEqual({ low: 1, high: 1 });
    }
  });

  it("unknown / null location: a range adjacent..separate", () => {
    for (const location of ["unknown", null] as const) {
      const r = calculateJaw(jawInput({ tooth_count: 4, location }), book);
      expect(r.scenario).toBe("adjacent_or_separate");
      expect(r.total).toEqual({ low: formula(2, 4), high: formula(4, 4) });
      expect(r.implant_count).toEqual({ low: 2, high: 4 });
      const implant = r.components.find((c) => c.service_code === "IMPLANT_INSTALL");
      expect(implant?.quantity).toEqual({ low: 2, high: 4 });
      expect(implant?.total).toEqual({ low: 2 * 18000, high: 4 * 18000 });
    }
  });

  it("2 teeth: both schemes coincide", () => {
    const r = calculateJaw(jawInput({ tooth_count: 2, location: "unknown" }), book);
    expect(r.total.low).toBe(r.total.high);
  });
});

describe("implants already installed (ТЗ §4.3.1)", () => {
  it("scan + installed×superstructure + teeth×crown, no implant/healing", () => {
    const r = calculateJaw(
      jawInput({ tooth_count: 4, status: "implants_installed", installed_implant_count: 3 }),
      book,
    );
    expect(r.scenario).toBe("installed");
    expect(r.total.low).toBe(SCAN + 3 * 5500 + 4 * CROWN);
    expect(r.total.high).toBe(r.total.low);
    expect(r.components.map((c) => c.service_code).sort()).toEqual(["CROWN_IMPLANT", "SCAN_JAW_STAGE", "SUPERSTRUCTURE_SET"]);
    expect(r.implant_count).toEqual({ low: 3, high: 3 });
  });

  it("the count is clamped to 1..teeth", () => {
    const r = calculateJaw(jawInput({ tooth_count: 3, status: "implants_installed", installed_implant_count: 9 }), book);
    expect(r.implant_count).toEqual({ low: 3, high: 3 });
    expect(calculateJaw(jawInput({ tooth_count: 3, status: "implants_installed", installed_implant_count: 0 }), book).implant_count.low).toBe(1);
  });

  it("unknown count → range over the allowed schemes", () => {
    expect(installedBounds(1)).toEqual({ low: 1, high: 1 });
    expect(installedBounds(4)).toEqual({ low: 2, high: 4 });
    expect(installedBounds(6)).toEqual({ low: 3, high: 6 });
    expect(installedBounds(7)).toEqual({ low: 4, high: 7 });
    expect(installedBounds(14)).toEqual({ low: 4, high: 8 });
    for (const count of ["unknown", null] as const) {
      const r = calculateJaw(jawInput({ tooth_count: 4, status: "implants_installed", installed_implant_count: count }), book);
      expect(r.total).toEqual({ low: SCAN + 2 * 5500 + 4 * CROWN, high: SCAN + 4 * 5500 + 4 * CROWN });
      expect(r.implant_count).toEqual({ low: 2, high: 4 });
    }
  });

  it("7–14 installed → installed scheme, no scenario tabs", () => {
    const r = calculateJaw(jawInput({ tooth_count: 10, status: "implants_installed", installed_implant_count: 6, scenario: "aox4" }), book);
    expect(r.scenario).toBe("installed");
    expect(r.alternatives).toEqual([]);
    expect(r.total.low).toBe(SCAN + 6 * 5500 + 10 * CROWN);
  });
});

describe("7–14 teeth (ТЗ §4.4, §4.5)", () => {
  const input = (patch = {}) => jawInput({ tooth_count: 10, scenario: "bridges", ...patch });

  it("bridges: 4 implants, 4 healing, 4 superstructures, scan, teeth × crown", () => {
    const r = calculateJaw(input(), book);
    expect(r.scenario).toBe("bridges");
    expect(r.total.low).toBe(4 * SET + SCAN + 10 * CROWN);
    expect(r.implant_count).toEqual({ low: 4, high: 4 });
    expect(r.prosthetic_units).toBe(10);
  });

  it("All-on-N: first stage, permanent stage and full treatment", () => {
    for (const [scenario, n] of [["aox4", 4], ["aox6", 6], ["aox8", 8]] as const) {
      const r = calculateJaw(input({ scenario }), book);
      const first = n * 18000 + n * 6500 + 38000 + SCAN;
      const permanent = 130000 + 1000;
      expect(r.scenario).toBe(scenario);
      expect(r.first_stage).toEqual({ low: first, high: first });
      expect(r.permanent_stage).toEqual({ low: permanent, high: permanent });
      expect(r.total).toEqual({ low: first + permanent, high: first + permanent });
      expect(r.implant_count).toEqual({ low: n, high: n });
      expect(r.components.filter((c) => c.stage === "first").map((c) => c.service_code)).toEqual([
        "IMPLANT_INSTALL",
        "MULTIUNIT",
        "ARCH_TEMP",
        "SCAN_JAW_STAGE",
      ]);
    }
  });

  it("MULTIUNIT follows the implant tier, ARCH_FINAL the arch tier — independently", () => {
    const r = calculateJaw(input({ scenario: "aox4", implant_tier: "minimum", crown_or_arch_tier: "premium" }), book);
    expect(r.first_stage?.low).toBe(4 * 12000 + 4 * 5000 + 38000 + SCAN);
    expect(r.permanent_stage?.low).toBe(210000 + 1000);
  });

  it("alternatives hold all four scenarios incl. the selected one", () => {
    const r = calculateJaw(input({ scenario: "aox6" }), book);
    expect(r.alternatives.map((a) => a.scenario)).toEqual(["bridges", "aox4", "aox6", "aox8"]);
    const selected = r.alternatives.find((a) => a.scenario === "aox6");
    expect(selected?.total).toEqual(r.total);
    expect(r.alternatives[0].total.low).toBe(4 * SET + SCAN + 10 * CROWN);
  });

  it("a null scenario defaults to bridges; 14 teeth work", () => {
    expect(calculateJaw(input({ scenario: null }), book).scenario).toBe("bridges");
    expect(calculateJaw(jawInput({ tooth_count: 14, scenario: "bridges" }), book).total.low).toBe(4 * SET + SCAN + 14 * CROWN);
  });

  it("no scenario tabs below 7 teeth", () => {
    expect(calculateJaw(jawInput({ tooth_count: 6, location: "adjacent" }), book).alternatives).toEqual([]);
  });
});

describe("temporary prosthetics (ТЗ §4.4)", () => {
  it("adds teeth × temp crown + repeat scan + implants × final abutment", () => {
    const base = calculateJaw(jawInput({ tooth_count: 3, location: "adjacent" }), book);
    const withTemp = calculateJaw(jawInput({ tooth_count: 3, location: "adjacent", include_temporary: true }), book);
    // 2 implants for 3 adjacent teeth
    expect(withTemp.total.low - base.total.low).toBe(3 * 2500 + 1000 + 2 * 4000);
    const temp = withTemp.components.filter((c) => c.stage === "temporary").map((c) => c.service_code);
    expect(temp).toEqual(["TEMP_CROWN_UNIT", "REPEAT_SCAN_JAW", "ABUTMENT_FINAL"]);
  });

  it("final abutment uses the implant tier", () => {
    const r = calculateJaw(jawInput({ implant_tier: "premium", include_temporary: true }), book);
    expect(r.components.find((c) => c.service_code === "ABUTMENT_FINAL")).toMatchObject({ tier: "premium", unit_value: 6000 });
  });

  it("works for single, bridges (4 implants), installed (count) and ranges", () => {
    const delta = (a: { total: { low: number } }, b: { total: { low: number } }) => b.total.low - a.total.low;
    const t = (patch: object) => [calculateJaw(jawInput(patch), book), calculateJaw(jawInput({ ...patch, include_temporary: true }), book)] as const;
    expect(delta(...t({ tooth_count: 1 }))).toBe(2500 + 1000 + 4000);
    expect(delta(...t({ tooth_count: 9, scenario: "bridges" }))).toBe(9 * 2500 + 1000 + 4 * 4000);
    expect(delta(...t({ tooth_count: 3, status: "implants_installed", installed_implant_count: 2 }))).toBe(3 * 2500 + 1000 + 2 * 4000);
    const [a, b] = t({ tooth_count: 4, location: "unknown" });
    expect(b.total.low - a.total.low).toBe(4 * 2500 + 1000 + 2 * 4000);
    expect(b.total.high - a.total.high).toBe(4 * 2500 + 1000 + 4 * 4000);
  });

  it("never applies to All-on (ARCH_TEMP is already there)", () => {
    const [a, b] = [false, true].map((t) => calculateJaw(jawInput({ tooth_count: 10, scenario: "aox4", include_temporary: t }), book));
    expect(b.total).toEqual(a.total);
    expect(b.components.some((c) => c.stage === "temporary")).toBe(false);
    // …but the comparison strip's bridges include it
    const bridges = [false, true].map((t) => calculateJaw(jawInput({ tooth_count: 10, scenario: "aox4", include_temporary: t }), book).alternatives[0]);
    expect(bridges[1].total.low - bridges[0].total.low).toBe(10 * 2500 + 1000 + 4 * 4000);
  });
});

describe("missing prices are never invented", () => {
  it("reports missing codes and an unavailable (zero) total", () => {
    const noCrown = makeBook({ omit: ["CROWN_IMPLANT|premium"] });
    const r = calculateJaw(jawInput({ crown_or_arch_tier: "premium" }), noCrown);
    expect(r.missing_codes).toEqual(["CROWN_IMPLANT"]);
    expect(r.total).toEqual({ low: 0, high: 0 });
    // other tiers still work
    expect(calculateJaw(jawInput(), noCrown).missing_codes).toEqual([]);
  });

  it("collects every missing code once; ranges too", () => {
    const sparse = makeBook({ omit: ["SCAN_JAW_STAGE|common", "SUPERSTRUCTURE_SET|classic"] });
    const r = calculateJaw(jawInput({ tooth_count: 4, location: "unknown" }), sparse);
    expect(r.missing_codes.sort()).toEqual(["SCAN_JAW_STAGE", "SUPERSTRUCTURE_SET"]);
    expect(r.total).toEqual({ low: 0, high: 0 });
  });

  it("an unavailable scenario is dropped from the comparison, the others stay", () => {
    const noMulti = makeBook({ omit: ["MULTIUNIT|classic"] });
    const r = calculateJaw(jawInput({ tooth_count: 9, scenario: "bridges" }), noMulti);
    expect(r.missing_codes).toEqual([]);
    expect(r.alternatives.map((a) => a.scenario)).toEqual(["bridges"]);
    const aox = calculateJaw(jawInput({ tooth_count: 9, scenario: "aox4" }), noMulti);
    expect(aox.missing_codes).toEqual(["MULTIUNIT"]);
    expect(aox.first_stage).toBeNull();
  });

  it("an empty book makes everything missing", () => {
    const empty = makeBook({ omit: Object.keys({}) });
    const none = { ...empty, get: () => undefined };
    const r = calculateJaw(jawInput(), none);
    expect(r.missing_codes.length).toBe(5);
    expect(r.components).toEqual([]);
  });
});

describe("«Не знаю точно» range of teeth", () => {
  it("1..3 separate teeth", () => {
    const r = calculateJawFromRange(jawInput({ tooth_count: 3, location: "separate", status: "unknown" }), 1, book);
    expect(r.total.low).toBe(SET + SCAN + CROWN);
    expect(r.total.high).toBe(3 * SET + SCAN + 3 * CROWN);
    expect(r.implant_count).toEqual({ low: 1, high: 3 });
    expect(r.components.find((c) => c.service_code === "CROWN_IMPLANT")?.quantity).toEqual({ low: 1, high: 3 });
    expect(r.components.find((c) => c.service_code === "SCAN_JAW_STAGE")?.quantity).toEqual({ low: 1, high: 1 });
  });
});

describe("calculateQuote (ТЗ §4.6, §8.1)", () => {
  const upper = jawInput({ jaw: "upper", tooth_count: 3, location: "adjacent" });
  const lower = jawInput({ jaw: "lower", tooth_count: 1, implant_tier: "premium" });

  it("two jaws: independent calculations, each with its own scan, total = plain sum", () => {
    const q = calculateQuote(upper, lower, book);
    const u = calculateJaw(upper, book);
    const l = calculateJaw(lower, book);
    expect(q.upperJawCalculation).toEqual(u);
    expect(q.lowerJawCalculation).toEqual(l);
    expect(q.overallTotal).toEqual({ low: u.total.low + l.total.low, high: u.total.high + l.total.high });
    for (const calc of [q.upperJawCalculation, q.lowerJawCalculation]) {
      expect(calc?.components.filter((c) => c.service_code === "SCAN_JAW_STAGE")).toHaveLength(1);
    }
    expect(q.upperJawCalculation?.jaw).toBe("upper");
    expect(q.lowerJawCalculation?.jaw).toBe("lower");
  });

  it("changing one jaw does not touch the other", () => {
    const a = calculateQuote(upper, lower, book);
    const b = calculateQuote(jawInput({ ...upper, implant_tier: "premium" }), lower, book);
    expect(b.lowerJawCalculation).toEqual(a.lowerJawCalculation);
    expect(b.upperJawCalculation?.total.low).toBeGreaterThan(a.upperJawCalculation?.total.low ?? 0);
  });

  it("an inactive jaw is null and one jaw is enough", () => {
    expect(calculateQuote(null, lower, book).upperJawCalculation).toBeNull();
    expect(calculateQuote(jawInput({ tooth_count: 0 }), lower, book).upperJawCalculation).toBeNull();
    const only = calculateQuote(upper, null, book);
    expect(only.lowerJawCalculation).toBeNull();
    expect(only.overallTotal).toEqual(only.upperJawCalculation?.total);
  });

  it("both inactive → no total", () => {
    const q = calculateQuote(null, jawInput({ tooth_count: 0 }), book);
    expect(q.overallTotal).toBeNull();
    expect(q.upperJawCalculation).toBeNull();
    expect(q.lowerJawCalculation).toBeNull();
  });

  it("a jaw with missing prices makes the overall total unavailable", () => {
    const sparse = makeBook({ omit: ["CROWN_IMPLANT|premium"] });
    const q = calculateQuote(upper, jawInput({ jaw: "lower", crown_or_arch_tier: "premium" }), sparse);
    expect(q.overallTotal).toBeNull();
    expect(q.upperJawCalculation?.missing_codes).toEqual([]);
    expect(q.lowerJawCalculation?.missing_codes).toEqual(["CROWN_IMPLANT"]);
  });

  it("range option for the 1..N teeth guess", () => {
    const q = calculateQuote(jawInput({ tooth_count: 3, location: "separate", status: "unknown" }), null, book, {
      rangeFromTeeth: { upper: 1 },
    });
    expect(q.overallTotal).toEqual({ low: SET + SCAN + CROWN, high: 3 * SET + SCAN + 3 * CROWN });
  });

  it("is deterministic and does not mutate its input", () => {
    const input = { ...upper };
    const a = JSON.stringify(calculateQuote(input, lower, book));
    const b = JSON.stringify(calculateQuote(input, lower, book));
    expect(a).toBe(b);
    expect(input).toEqual(upper);
  });

  it("clamps absurd tooth counts", () => {
    expect(calculateJaw(jawInput({ tooth_count: 99, scenario: "bridges" }), book).tooth_count).toBe(14);
    expect(calculateJaw(jawInput({ tooth_count: -3 }), book).total).toEqual({ low: 0, high: 0 });
    expect(calculateJaw(jawInput({ tooth_count: 2.9, location: "adjacent" }), book).tooth_count).toBe(2);
  });
});
