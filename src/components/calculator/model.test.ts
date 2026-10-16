import { describe, expect, it } from "vitest";
import { createPriceBook } from "@/engine/v3";
import { fixturePricesResponse } from "@/lib/data/fixture";
import {
  canContinueFromCounts,
  deriveInputs,
  initialState,
  leaveUnknownMode,
  questionList,
  quoteFor,
  setAnswer,
  setCount,
  setCountKeepingOne,
  setScenario,
  setTiers,
  setUnknownChoice,
  setUnknownMode,
} from "./model";
import { loadSession, reviveState, saveSession, type SavedSession } from "./storage";
import { listRegions, normalizeSearch, searchCities } from "./search";

const kyiv = createPriceBook(fixturePricesResponse("city", "kyiv"));

describe("counts and the sequential questions", () => {
  it("cannot continue with two zeros, except a «Не знаю точно» choice", () => {
    let s = initialState();
    expect(canContinueFromCounts(s)).toBe(false);
    s = setCount(s, "lower", 1);
    expect(canContinueFromCounts(s)).toBe(true);
    s = setUnknownMode(initialState(), true);
    expect(canContinueFromCounts(s)).toBe(false);
    expect(canContinueFromCounts(setUnknownChoice(s, "all"))).toBe(true);
  });

  it("the counts screen allows 0/0 (Continue is blocked), the result page keeps one jaw", () => {
    let s = setCount(initialState(), "upper", 2);
    expect(setCount(s, "upper", 0).counts).toEqual({ upper: 0, lower: 0 });
    s = setCountKeepingOne(s, "upper", 0);
    expect(s.counts.upper).toBe(2);
    s = setCount(s, "lower", 1);
    s = setCountKeepingOne(s, "upper", 0);
    expect(s.counts).toEqual({ upper: 0, lower: 1 });
    expect(setCountKeepingOne(s, "lower", 0).counts.lower).toBe(1);
    expect(setCount(s, "upper", 99).counts.upper).toBe(14);
  });

  it("questions: upper then lower, a 0-jaw skipped, none in the guess mode", () => {
    let s = setCount(setCount(initialState(), "upper", 3), "lower", 1);
    expect(questionList(s).map((q) => `${q.jaw}:${q.kind}`)).toEqual(["upper:location", "upper:status", "lower:status"]);
    s = setAnswer(s, "lower", { status: "implants_installed" });
    expect(questionList(s).map((q) => `${q.jaw}:${q.kind}`)).toEqual(["upper:location", "upper:status", "lower:status", "lower:installed"]);
    expect(questionList(setCount(initialState(), "lower", 2)).every((q) => q.jaw === "lower")).toBe(true);
    expect(questionList(setUnknownChoice(setUnknownMode(initialState(), true), "all"))).toEqual([]);
  });

  it("changing the count drops answers that no longer apply but keeps the other jaw", () => {
    let s = setCount(setCount(initialState(), "upper", 4), "lower", 2);
    s = setAnswer(s, "upper", { location: "adjacent", status: "implants_installed", installed: 3 });
    s = setAnswer(s, "lower", { location: "separate", status: "removed" });
    s = setCount(s, "upper", 2);
    expect(s.answers.upper.installed).toBe(2);
    s = setCount(s, "upper", 9);
    expect(s.answers.upper.location).toBeNull();
    expect(s.answers.lower).toEqual({ location: "separate", status: "removed", installed: null });
  });

  it("leaving the installed status forgets the installed count", () => {
    let s = setCount(initialState(), "upper", 3);
    s = setAnswer(s, "upper", { status: "implants_installed", installed: 2 });
    s = setAnswer(s, "upper", { status: "removed" });
    expect(s.answers.upper.installed).toBeNull();
  });
});

describe("state → engine", () => {
  it("unanswered questions default to unknown so the result is never blocked", () => {
    const s = setCount(initialState(), "upper", 3);
    const { upper } = deriveInputs(s);
    expect(upper).toMatchObject({ location: "unknown", status: "unknown", scenario: null });
    expect(quoteFor(s, kyiv).overallTotal).not.toBeNull();
  });

  it("tiers and scenarios are per jaw", () => {
    let s = setCount(setCount(initialState(), "upper", 10), "lower", 10);
    s = setTiers(s, "upper", { implant: "premium" });
    s = setScenario(s, "lower", "aox6");
    const { upper, lower } = deriveInputs(s);
    expect(upper).toMatchObject({ implant_tier: "premium", scenario: "bridges" });
    expect(lower).toMatchObject({ implant_tier: "classic", scenario: "aox6" });
    expect(quoteFor(s, kyiv).lowerJawCalculation?.scenario).toBe("aox6");
  });

  it("the guess mode maps to one assumed upper jaw and can be left for exact counts", () => {
    let s = setUnknownChoice(setUnknownMode(initialState(), true), "separate");
    expect(deriveInputs(s)).toMatchObject({ upper: { tooth_count: 3, location: "separate" }, lower: null, rangeFromTeeth: { upper: 1 } });
    const q = quoteFor(s, kyiv);
    expect(q.overallTotal!.low).toBeLessThan(q.overallTotal!.high);
    s = leaveUnknownMode(s);
    expect(s.unknown.active).toBe(false);
    expect(s.counts).toEqual({ upper: 3, lower: 0 });
    expect(s.answers.upper.location).toBe("separate");
    const exact = quoteFor(s, kyiv).overallTotal!;
    expect(exact.low).toBe(exact.high);
    expect(leaveUnknownMode(initialState())).toEqual(initialState());
  });

  it("«зовсім не знаю» is the reference single tooth", () => {
    const s = setUnknownChoice(setUnknownMode(initialState(), true), "none");
    expect(quoteFor(s, kyiv).upperJawCalculation?.scenario).toBe("reference_single");
  });
});

describe("storage (localStorage only)", () => {
  const session = (): SavedSession => ({
    v: 3,
    location: { kind: "city", id: "kyiv", name: "Київ" },
    state: setCount(initialState(), "upper", 5),
    step: "result",
    questionIndex: 1,
  });

  it("round-trips a session", () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveSession(session(), storage);
    expect(loadSession(storage)).toEqual(session());
  });

  it("ignores broken, foreign or outdated entries", () => {
    const of = (v: string | null) => ({ getItem: () => v });
    expect(loadSession(of(null))).toBeNull();
    expect(loadSession(of("{not json"))).toBeNull();
    expect(loadSession(of('{"v":2}'))).toBeNull();
    expect(loadSession(of("[]"))).toBeNull();
    expect(loadSession(null)).toBeNull();
  });

  it("revives untrusted state safely", () => {
    const s = reviveState({ counts: { upper: 99, lower: "x" }, answers: { upper: { status: "boom", installed: 2.7 } }, tiers: { lower: { implant: "gold" } }, currency: "USD" });
    expect(s.counts).toEqual({ upper: 14, lower: 0 });
    expect(s.answers.upper).toEqual({ location: null, status: null, installed: 2 });
    expect(s.tiers.lower.implant).toBe("classic");
    expect(s.currency).toBe("UAH");
    expect(reviveState(null)).toEqual(initialState());
  });

  it("does not throw when storage is full", () => {
    expect(() => saveSession(session(), { setItem: () => { throw new Error("quota"); } })).not.toThrow();
  });
});

describe("city search (ТЗ §5.1)", () => {
  const loc = (kind: "city" | "region", id: string, name: string, aliases: string[] = []) => ({
    kind, id, slug: id, name, region_id: null, region_name: null, aliases,
  });
  const all = [loc("city", "lviv", "Львів", ["lviv", "Львов"]), loc("city", "kyiv", "Київ", ["kiev"]), loc("region", "lvivska", "Львівська область"), loc("region", "vinnytska", "Вінницька область")];

  it("shows nothing before typing, only cities after", () => {
    expect(searchCities(all, "")).toEqual([]);
    expect(searchCities(all, "л").map((l) => l.id)).toEqual(["lviv"]);
    expect(searchCities(all, "kiev")[0].id).toBe("kyiv");
    expect(searchCities(all, "кыїв")[0].id).toBe("kyiv");
    expect(searchCities(all, "zzz")).toEqual([]);
    expect(normalizeSearch(" Кам’янець-Подільський ")).toBe("камянець подільській");
  });

  it("lists regions alphabetically", () => {
    expect(listRegions(all).map((r) => r.id)).toEqual(["vinnytska", "lvivska"]);
  });
});
