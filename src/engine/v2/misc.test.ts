import { describe, expect, it } from "vitest";
import type { PublicLocation } from "@/lib/contracts";
import {
  FOLLOW_UPS,
  chooseCount,
  chooseFollowUp,
  chooseScope,
  clinicsGenitive,
  deriveParams,
  eurFromUah,
  followUpFor,
  formatDateUk,
  formatEurRange,
  formatNumber,
  formatRate,
  formatUah,
  formatUahRange,
  isComplete,
  lineSourceLabel,
  listRegions,
  aggregateLabel,
  pluralUk,
  scenarioKind,
  scenarioLabel,
  searchCities,
  setScope,
  setTeeth,
  setToothState,
  usesImplantTier,
  type Answers,
} from "./index";

const NBSP = " ";

describe("formatting", () => {
  it("numbers and money use NBSP grouping", () => {
    expect(formatNumber(52000)).toBe(`52${NBSP}000`);
    expect(formatUah(36800)).toBe(`36${NBSP}800${NBSP}грн`);
    expect(formatUahRange({ low: 82100, high: 107400 })).toBe(`82${NBSP}100–107${NBSP}400${NBSP}грн`);
    expect(formatUahRange({ low: 5, high: 5 })).toBe(`5${NBSP}грн`);
  });

  it("EUR is rounded sensibly and keeps the rate semantics", () => {
    expect(eurFromUah(36800, 50.1385)).toBe(730);
    expect(eurFromUah(5000, 50)).toBe(100);
    expect(eurFromUah(30000, 50)).toBe(600);
    expect(formatEurRange({ low: 36800, high: 36800 }, 50.1385)).toBe(`≈${NBSP}730${NBSP}€`);
    expect(formatEurRange({ low: 82100, high: 107400 }, 50.1385)).toBe(`≈${NBSP}1${NBSP}640–2${NBSP}140${NBSP}€`);
    expect(formatRate(50.1385)).toBe("50,14");
  });

  it("dates are Ukrainian", () => {
    expect(formatDateUk("2026-10-09")).toBe("9 жовтня 2026");
    expect(formatDateUk("2026-01-31T23:00:00Z")).toBe("31 січня 2026");
    expect(formatDateUk("bad")).toBe("bad");
  });

  it("plurals", () => {
    expect([1, 2, 5, 11, 21, 22].map((n) => pluralUk(n, "зуб", "зуби", "зубів"))).toEqual([
      "зуб",
      "зуби",
      "зубів",
      "зубів",
      "зуб",
      "зуби",
    ]);
    // "на основі прайсів N клінік": genitive after the number
    expect([1, 2, 3, 4, 5, 11, 12, 21, 22, 25, 101].map(clinicsGenitive)).toEqual([
      "клініки",
      "клінік",
      "клінік",
      "клінік",
      "клінік",
      "клінік",
      "клінік",
      "клініки",
      "клінік",
      "клінік",
      "клініки",
    ]);
    expect(aggregateLabel(3)).toBe("на основі прайсів 3 клінік");
    expect(aggregateLabel(21)).toBe("на основі прайсів 21 клініки");
    expect(aggregateLabel(null)).toBe("на основі прайсів клінік");
  });

  it("line source hints", () => {
    expect(lineSourceLabel({ source: "aggregate", clinicCount: 3 })).toBe("на основі прайсів 3 клінік");
    expect(lineSourceLabel({ source: "manual_override", clinicCount: null })).toBe("статистичний орієнтир Denva");
    expect(lineSourceLabel({ source: "regional_fallback", clinicCount: null })).toBe("середня ціна регіону");
    expect(lineSourceLabel({ source: null, clinicCount: null })).toBeNull();
  });
});

describe("flow and answers (ТЗ §5.3)", () => {
  it("picks the follow-up per branch", () => {
    const f = (a: Answers) => followUpFor(a);
    expect(f({ scope: "individual", count: 1 })).toBe("tooth_state");
    for (const n of [2, 3, 4, 5, 6]) expect(f({ scope: "individual", count: n })).toBe("arrangement");
    expect(f({ scope: "individual", count: 7 })).toBe("seven_where");
    expect(f({ scope: "one_jaw" })).toBe("jaw_state");
    expect(f({ scope: "both_jaws" })).toBe("jaw_state");
    expect(f({ scope: "unknown" })).toBe("approx");
    expect(f({})).toBeNull();
  });

  it("question texts match the spec", () => {
    expect(FOLLOW_UPS.tooth_state.title).toBe("Що зараз із цим зубом?");
    expect(FOLLOW_UPS.arrangement.title).toBe("Як розташовані ці зуби?");
    expect(FOLLOW_UPS.seven_where.title).toBe("Де розташовані ці зуби?");
    expect(FOLLOW_UPS.jaw_state.title).toBe("Яка зараз ситуація?");
    expect(FOLLOW_UPS.approx.title).toBe("Скільки приблизно зубів відсутні або потребують видалення?");
    expect(FOLLOW_UPS.tooth_state.options).toHaveLength(4);
    expect(FOLLOW_UPS.seven_where.options).toHaveLength(3);
  });

  it("keeps the follow-up only while it belongs to the branch", () => {
    let a = chooseScope({}, "individual");
    a = chooseCount(a, 4);
    a = chooseFollowUp(a, "adjacent");
    expect(isComplete(a)).toBe(true);
    // 4 → 5: still "arrangement", kept
    expect(chooseCount(a, 5).followUp?.value).toBe("adjacent");
    // 4 → 1: different question, dropped
    const one = chooseCount(a, 1);
    expect(one.followUp).toBeUndefined();
    expect(isComplete(one)).toBe(false);
    // other scope drops it, but the count is remembered for "Назад"
    const jaw = chooseScope(a, "one_jaw");
    expect(jaw.followUp).toBeUndefined();
    expect(jaw.count).toBe(4);
    expect(chooseScope(jaw, "individual").count).toBe(4);
  });

  it("derives the scenario parameters", () => {
    const d = (a: Answers) => deriveParams(a);
    expect(d({ scope: "individual", count: 1 })).toBeNull();
    expect(d({ scope: "individual", count: 1, followUp: { id: "tooth_state", value: "present" } })).toMatchObject({
      scope: "individual",
      teeth: 1,
      toothState: "present",
      teethPresent: true,
    });
    expect(d({ scope: "individual", count: 3, followUp: { id: "arrangement", value: "mixed" } })).toMatchObject({
      teeth: 3,
      arrangement: "mixed",
    });
    expect(d({ scope: "individual", count: 7, followUp: { id: "seven_where", value: "both" } })).toMatchObject({
      teeth: 7,
      jaws: 2,
    });
    expect(d({ scope: "individual", count: 7, followUp: { id: "seven_where", value: "unknown" } })?.jaws).toBe(1);
    expect(d({ scope: "one_jaw", followUp: { id: "jaw_state", value: "present" } })).toMatchObject({
      scope: "one_jaw",
      jaws: 1,
      teethPresent: true,
    });
    expect(d({ scope: "both_jaws", followUp: { id: "jaw_state", value: "denture" } })).toMatchObject({
      scope: "both_jaws",
      jaws: 2,
      teethPresent: false,
    });
  });

  it("«Не знаю точно» maps as agreed", () => {
    const d = (value: string) => deriveParams({ scope: "unknown", followUp: { id: "approx", value } });
    expect(d("one")).toMatchObject({ scope: "individual", teeth: 1, toothState: "unknown" });
    expect(d("several")).toMatchObject({ scope: "individual", teeth: 3, arrangement: "unknown", approx: "several" });
    expect(d("most_one_jaw")).toMatchObject({ scope: "one_jaw", jaws: 1 });
    const reference = d("unknown")!;
    expect(reference.scope).toBe("reference");
    expect(scenarioKind(reference)).toBe("reference");
    expect(scenarioLabel(reference)).toBe("Довідкова ціна одного зуба");
  });
});

describe("edits on the result page", () => {
  const base = deriveParams({ scope: "individual", count: 1, followUp: { id: "tooth_state", value: "removed" } })!;

  it("changes teeth, scope and state without redoing the flow", () => {
    expect(scenarioKind(setTeeth(base, 4))).toBe("multi");
    expect(scenarioKind(setTeeth(base, 7))).toBe("seven_plus");
    expect(scenarioKind(setTeeth(base, 1))).toBe("single");
    expect(setTeeth(base, 99).teeth).toBe(7);
    expect(setTeeth(base, 0).teeth).toBe(1);
    expect(setScope(base, "both_jaws")).toMatchObject({ scope: "both_jaws", jaws: 2 });
    expect(setScope(setScope(base, "one_jaw"), "individual").teeth).toBe(1);
    const present = setToothState(base, "present");
    expect(present.teethPresent).toBe(true);
    expect(setTeeth(present, 3).teethPresent).toBe(false);
  });

  it("the implant level is moot for an already placed implant", () => {
    expect(usesImplantTier(setToothState(base, "implant_placed"))).toBe(false);
    expect(usesImplantTier(base)).toBe(true);
    expect(usesImplantTier(setScope(base, "one_jaw"))).toBe(true);
  });

  it("the assumed count of «кілька» stops being an assumption once edited", () => {
    const several = deriveParams({ scope: "unknown", followUp: { id: "approx", value: "several" } })!;
    expect(several.approx).toBe("several");
    expect(setTeeth(several, 4).approx).toBeUndefined();
  });

  it("scenario labels", () => {
    expect(scenarioLabel(base)).toBe("1 зуб · зуб уже видалений");
    expect(scenarioLabel(setTeeth(base, 3))).toBe("3 зуби · розташування не уточнено");
    expect(scenarioLabel({ ...setTeeth(base, 7), jaws: 2 })).toContain("обидві щелепи");
    expect(scenarioLabel({ ...setScope(base, "one_jaw"), allOn: 6 })).toBe("Усі зуби на одній щелепі · All-on-6");
  });
});

describe("city search (ТЗ §5.1)", () => {
  const loc = (kind: "city" | "region", id: string, name: string, aliases: string[] = []): PublicLocation => ({
    kind,
    id,
    name,
    region_id: null,
    region_name: null,
    aliases,
  });
  const all = [
    loc("city", "lviv", "Львів", ["lviv", "Львов"]),
    loc("city", "kyiv", "Київ", ["kyiv", "kiev"]),
    loc("city", "kharkiv", "Харків", ["kharkov"]),
    loc("region", "lvivska", "Львівська область"),
    loc("region", "vinnytska", "Вінницька область"),
  ];

  it("shows nothing before typing and only cities after", () => {
    expect(searchCities(all, "")).toEqual([]);
    expect(searchCities(all, "   ")).toEqual([]);
    expect(searchCities(all, "л").map((l) => l.id)).toEqual(["lviv"]);
  });

  it("matches names, aliases and loosely folded letters", () => {
    expect(searchCities(all, "kiev")[0].id).toBe("kyiv");
    expect(searchCities(all, "кыїв")[0].id).toBe("kyiv");
    expect(searchCities(all, "львов")[0].id).toBe("lviv");
    expect(searchCities(all, "zzz")).toEqual([]);
  });

  it("lists regions alphabetically", () => {
    expect(listRegions(all).map((r) => r.id)).toEqual(["vinnytska", "lvivska"]);
  });
});
