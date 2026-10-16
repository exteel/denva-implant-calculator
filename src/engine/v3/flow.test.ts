import { describe, expect, it } from "vitest";
import {
  EMPTY_JAW_ANSWERS,
  allQuestions,
  buildJawInput,
  isAnswered,
  jawQuestions,
  normalizeJawAnswers,
  type JawAnswers,
  type JawSettings,
} from "./flow";
import { mapUnknownScope, unknownJawInput } from "./unknown";
import { calculateJaw, calculateJawFromRange } from "./calc";
import { makeBook } from "./test-utils";

const answers = (patch: Partial<JawAnswers> = {}): JawAnswers => ({ ...EMPTY_JAW_ANSWERS, ...patch });
const settings: JawSettings = { implant_tier: "classic", crown_or_arch_tier: "classic", scenario: "bridges" };

describe("questions per jaw (ТЗ §5.4)", () => {
  const kinds = (count: number, a = answers()) => jawQuestions("upper", count, a).map((q) => q.kind);

  it("1 → стан; 2–6 → розташування + стан; 7–14 → стан; 0 → nothing", () => {
    expect(kinds(0)).toEqual([]);
    expect(kinds(1)).toEqual(["status"]);
    for (const n of [2, 3, 4, 5, 6]) expect(kinds(n)).toEqual(["location", "status"]);
    for (const n of [7, 10, 14]) expect(kinds(n)).toEqual(["status"]);
  });

  it("installed implants add the count question", () => {
    expect(kinds(4, answers({ status: "implants_installed" }))).toEqual(["location", "status", "installed"]);
    expect(kinds(1, answers({ status: "implants_installed" }))).toEqual(["status", "installed"]);
    expect(kinds(4, answers({ status: "removed" }))).toEqual(["location", "status"]);
  });

  it("upper jaw first, then lower; a jaw with 0 is skipped; questions name the jaw", () => {
    const q = allQuestions({ upper: 1, lower: 3 }, { upper: answers(), lower: answers() });
    expect(q).toEqual([
      { jaw: "upper", kind: "status" },
      { jaw: "lower", kind: "location" },
      { jaw: "lower", kind: "status" },
    ]);
    expect(allQuestions({ upper: 0, lower: 2 }, { upper: answers(), lower: answers() }).every((x) => x.jaw === "lower")).toBe(true);
    expect(allQuestions({ upper: 0, lower: 0 }, { upper: answers(), lower: answers() })).toEqual([]);
  });

  it("isAnswered", () => {
    expect(isAnswered({ jaw: "upper", kind: "status" }, answers())).toBe(false);
    expect(isAnswered({ jaw: "upper", kind: "status" }, answers({ status: "unknown" }))).toBe(true);
    expect(isAnswered({ jaw: "upper", kind: "location" }, answers({ location: "unknown" }))).toBe(true);
    expect(isAnswered({ jaw: "upper", kind: "installed" }, answers({ installed: "unknown" }))).toBe(true);
  });
});

describe("normalizeJawAnswers", () => {
  it("drops location outside 2–6 and installed without the status", () => {
    expect(normalizeJawAnswers(1, answers({ location: "adjacent", status: "removed" }))).toEqual(answers({ status: "removed" }));
    expect(normalizeJawAnswers(8, answers({ location: "separate" })).location).toBeNull();
    expect(normalizeJawAnswers(3, answers({ status: "removed", installed: 2 })).installed).toBeNull();
  });
  it("clamps the installed count to 1..teeth, keeps unknown", () => {
    expect(normalizeJawAnswers(3, answers({ status: "implants_installed", installed: 9 })).installed).toBe(3);
    expect(normalizeJawAnswers(3, answers({ status: "implants_installed", installed: 0 })).installed).toBe(1);
    expect(normalizeJawAnswers(3, answers({ status: "implants_installed", installed: "unknown" })).installed).toBe("unknown");
  });
  it("0 teeth clears everything", () => {
    expect(normalizeJawAnswers(0, answers({ status: "removed", location: "adjacent" }))).toEqual(EMPTY_JAW_ANSWERS);
  });
});

describe("buildJawInput", () => {
  it("is null for 0 teeth", () => {
    expect(buildJawInput("upper", 0, answers(), settings, false)).toBeNull();
  });

  it("defaults unanswered questions to unknown so the result is never blocked", () => {
    expect(buildJawInput("lower", 3, answers(), settings, false)).toMatchObject({
      jaw: "lower",
      tooth_count: 3,
      location: "unknown",
      status: "unknown",
      installed_implant_count: null,
      scenario: null,
    });
  });

  it("location only for 2–6, scenario only for 7–14, installed only with the status", () => {
    expect(buildJawInput("upper", 1, answers({ status: "removed" }), settings, false)).toMatchObject({ location: null, scenario: null });
    expect(buildJawInput("upper", 9, answers({ status: "removed" }), { ...settings, scenario: "aox6" }, true)).toMatchObject({
      location: null,
      scenario: "aox6",
      include_temporary: true,
    });
    expect(buildJawInput("upper", 4, answers({ location: "adjacent", status: "implants_installed", installed: 3 }), settings, false)).toMatchObject({
      location: "adjacent",
      installed_implant_count: 3,
    });
  });

  it("carries both tiers", () => {
    const input = buildJawInput("upper", 1, answers({ status: "removed" }), { ...settings, implant_tier: "premium", crown_or_arch_tier: "minimum" }, false);
    expect(input).toMatchObject({ implant_tier: "premium", crown_or_arch_tier: "minimum" });
  });
});

describe("«Не знаю точно» mapping (ARCHITECTURE_v3 §3)", () => {
  const book = makeBook();
  const base = { implant_tier: "classic", crown_or_arch_tier: "classic", include_temporary: false, scenario: null } as const;

  it("maps the four answers", () => {
    expect(mapUnknownScope("separate")).toMatchObject({ tooth_count: 3, location: "separate", rangeFromTeeth: 1, reference: false });
    expect(mapUnknownScope("significant")).toMatchObject({ tooth_count: 10, rangeFromTeeth: null, reference: false });
    expect(mapUnknownScope("all")).toMatchObject({ tooth_count: 14, reference: false });
    expect(mapUnknownScope("none")).toMatchObject({ tooth_count: 1, reference: true });
  });

  it("separate → range of 1–3 teeth", () => {
    const m = mapUnknownScope("separate");
    const r = calculateJawFromRange(unknownJawInput(m, base), m.rangeFromTeeth ?? 1, book);
    expect(r.total.low).toBe(18000 + 1800 + 5500 + 1200 + 10000);
    expect(r.total.high).toBe(3 * (18000 + 1800 + 5500 + 10000) + 1200);
  });

  it("significant / all → 10 / 14 teeth with the scenario comparison", () => {
    const r10 = calculateJaw(unknownJawInput(mapUnknownScope("significant"), base), book);
    expect(r10.tooth_count).toBe(10);
    expect(r10.alternatives).toHaveLength(4);
    expect(calculateJaw(unknownJawInput(mapUnknownScope("all"), base), book).tooth_count).toBe(14);
  });

  it("none → the reference price of one tooth", () => {
    const r = calculateJaw(unknownJawInput(mapUnknownScope("none"), base), book);
    expect(r.scenario).toBe("reference_single");
    expect(r.tooth_count).toBe(1);
  });
});
