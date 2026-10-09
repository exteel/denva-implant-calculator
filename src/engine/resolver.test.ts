import { describe, it, expect } from "vitest";
import { resolve } from "./resolver";
import type { Answers, BasketModifiers, Resolution } from "./types";

const noPay = (r: Resolution) => expect(JSON.stringify(r).toLowerCase()).not.toContain("переплачу");

const mod = (m: Partial<BasketModifiers>): BasketModifiers => ({
  implants: 0,
  existingImplants: 0,
  units: 0,
  tempCrowns: 0,
  ...m,
});

const single = (state: string, extra: Answers = {}): Resolution =>
  resolve({ teeth: "one", single_state: state, ...extra });

const adjacent = (count: string, state: string, range: "2_3" | "4_6" = "2_3"): Resolution =>
  resolve({
    teeth: range === "2_3" ? "adjacent_2_3" : "adjacent_4_6",
    [range === "2_3" ? "adjacent_count_2_3" : "adjacent_count_4_6"]: count,
    adjacent_state: state,
  });

const separate = (count: string, state: string, extra: Answers = {}): Resolution =>
  resolve({ teeth: "separate", separate_count: count, separate_state: state, ...extra });

const arch = (situation: string, plan: string): Resolution =>
  resolve({ teeth: "full_arch", arch_situation: situation, arch_plan_offered: plan });

const both = (situation: string, plan: "no" | [string, string]): Resolution =>
  resolve({
    teeth: "both_jaws",
    both_situation: situation,
    ...(plan === "no"
      ? { both_plan_exists: "no" }
      : { both_plan_exists: "yes", upper_plan: plan[0], lower_plan: plan[1] }),
  });

const ids = (r: Resolution) => r.scenarios.map((s) => s.id);
const extras = (r: Resolution) => r.relevantExtras.map((e) => e.code);

describe("6.1 one tooth", () => {
  it("1A already removed → SINGLE_TOOTH_STANDARD, HIGH, temp option, no extraction extras", () => {
    const r = single("already_removed");
    expect(r.kind).toBe("priced");
    expect(ids(r)).toEqual(["SINGLE_TOOTH_STANDARD"]);
    expect(r.scenarios[0].parts).toEqual([
      { basket: "SINGLE_TOOTH_STANDARD", modifiers: mod({ implants: 1, units: 1 }) },
    ]);
    expect(r.clinicalConfidence).toBe("HIGH");
    expect(r.flags).toEqual({ massExtraction: false, unsureSave: false, existingImplants: false, tempCrownOption: true });
    expect(extras(r)).toEqual(["BONE_AUGMENTATION", "SINUS_LIFT", "SOFT_TISSUE_GRAFT", "SEDATION"]);
    expect(r.relevantExtras.find((e) => e.code === "SINUS_LIFT")?.note).toContain("верхньої щелепи");
    expect(extras(r)).not.toContain("TEMPORARY_CROWN");
    expect(r.comparisonScope).toBe("teeth");
    expect(r.defaultScenarioId).toBe("SINGLE_TOOTH_STANDARD");
    noPay(r);
  });

  it("1B extraction recommended → MEDIUM_HIGH + extraction extras (quantity 1, with note)", () => {
    const r = single("extraction_recommended");
    expect(r.clinicalConfidence).toBe("MEDIUM_HIGH");
    expect(r.relevantExtras.slice(0, 2)).toEqual([
      { code: "EXTRACTION_SIMPLE", note: "якщо видалення підтвердять", quantity: 1 },
      { code: "EXTRACTION_COMPLEX", note: "якщо видалення підтвердять", quantity: 1 },
    ]);
    expect(r.flags.tempCrownOption).toBe(true);
    expect(r.flags.unsureSave).toBe(false);
  });

  it("1C unsure_save → conditional, LOW_MEDIUM, unsureSave flag", () => {
    const r = single("unsure_save");
    expect(r.clinicalConfidence).toBe("LOW_MEDIUM");
    expect(r.conditionalNote).toBe(
      "Цей розрахунок має сенс лише якщо видалення зуба справді необхідне. Спершу варто перевірити, чи можна його зберегти.",
    );
    expect(r.flags.unsureSave).toBe(true);
    expect(extras(r)).toContain("EXTRACTION_SIMPLE");
    expect(r.flags.tempCrownOption).toBe(true);
  });

  it("1D implant placed: HIGH with known system, MEDIUM + compatibility assumption without", () => {
    const known = single("implant_placed", { implant_system_known: "yes" });
    expect(ids(known)).toEqual(["IMPLANT_ALREADY_PLACED"]);
    expect(known.scenarios[0].parts[0].modifiers).toEqual(mod({ existingImplants: 1, units: 1 }));
    expect(known.clinicalConfidence).toBe("HIGH");
    expect(known.flags.existingImplants).toBe(true);
    expect(known.flags.tempCrownOption).toBe(false);
    expect(known.relevantExtras.map((e) => e.code)).toEqual(["SOFT_TISSUE_GRAFT", "TEMPORARY_CROWN"]);
    expect(known.assumptions.join(" ")).not.toContain("система імпланта невідома");

    const unknown = single("implant_placed", { implant_system_known: "no" });
    expect(unknown.clinicalConfidence).toBe("MEDIUM");
    expect(unknown.assumptions).toContain("Сумісність компонентів треба перевірити — система імпланта невідома.");
  });

  it("1E crown_only → IMPLANT_ALREADY_PLACED LOW_MEDIUM; implant_problem/unknown → no_basket", () => {
    const crown = single("old_problem", { old_problem_kind: "crown_only" });
    expect(ids(crown)).toEqual(["IMPLANT_ALREADY_PLACED"]);
    expect(crown.clinicalConfidence).toBe("LOW_MEDIUM");
    expect(crown.assumptions.join(" ")).toContain("старої коронки");
    expect(crown.flags.existingImplants).toBe(true);

    for (const kind of ["implant_problem", "unknown"]) {
      const r = single("old_problem", { old_problem_kind: kind });
      expect(r.kind).toBe("no_basket");
      expect(r.clinicalConfidence).toBe("LOW");
      expect(r.noBasketMessage).toBeTruthy();
      expect(r.scenarios).toEqual([]);
      expect(r.comparisonScope).toBeNull();
    }
    expect(single("old_problem", { old_problem_kind: "implant_problem" }).noBasketMessage).toContain(
      "без огляду та знімка",
    );
  });

  it("1F unknown → conditional standard scenario, LOW_MEDIUM", () => {
    const r = single("unknown");
    expect(ids(r)).toEqual(["SINGLE_TOOTH_STANDARD"]);
    expect(r.clinicalConfidence).toBe("LOW_MEDIUM");
    expect(r.flags.tempCrownOption).toBe(true);
    expect(r.assumptions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("6.2 / 6.3 adjacent", () => {
  it("2 teeth → ADJACENT_2, 2+2, MEDIUM_HIGH, reference note", () => {
    const r = adjacent("two", "all_removed");
    expect(ids(r)).toEqual(["ADJACENT_2"]);
    expect(r.scenarios[0].parts[0]).toEqual({
      basket: "ADJACENT_2",
      modifiers: mod({ implants: 2, units: 2 }),
    });
    expect(r.clinicalConfidence).toBe("MEDIUM_HIGH");
    expect(r.scenarios[0].referenceNote).toBe("Референс для оцінки: 2 імпланти + 2 ортопедичні одиниці");
    expect(r.assumptions).toContain(
      "Ми використовуємо один із можливих сценаріїв лише для оцінки вартості — кількість і розташування імплантів визначає лікар після діагностики.",
    );
    expect(r.comparisonScope).toBe("teeth");
    expect(extras(r)).toEqual([
      "BONE_AUGMENTATION",
      "SINUS_LIFT",
      "SOFT_TISSUE_GRAFT",
      "SURGICAL_GUIDE",
      "SEDATION",
      "TEMPORARY_CROWN",
    ]);
    expect(r.relevantExtras.find((e) => e.code === "TEMPORARY_CROWN")?.quantity).toBe(2);
    expect(r.flags.tempCrownOption).toBe(false);
  });

  it("3 teeth → ADJACENT_3_BRIDGE 2+3 MEDIUM", () => {
    const r = adjacent("three", "all_removed");
    expect(r.scenarios[0].parts[0].modifiers).toEqual(mod({ implants: 2, units: 3 }));
    expect(r.scenarios[0].referenceNote).toBe("Референс для оцінки: 2 імпланти + 3 ортопедичні одиниці");
    expect(r.clinicalConfidence).toBe("MEDIUM");
    expect(r.relevantExtras.find((e) => e.code === "TEMPORARY_CROWN")?.quantity).toBe(3);
  });

  it("2–3 unknown → two scenarios, LOW_MEDIUM", () => {
    const r = adjacent("unknown", "all_removed");
    expect(ids(r)).toEqual(["ADJACENT_2", "ADJACENT_3_BRIDGE"]);
    expect(r.clinicalConfidence).toBe("LOW_MEDIUM");
    expect(r.scenarios.every((s) => !s.isSecondary)).toBe(true);
    expect(r.defaultScenarioId).toBe("ADJACENT_2");
  });

  it("4/5/6 → bridge baskets with 2+4, 3+5, 3+6", () => {
    const four = adjacent("four", "all_removed", "4_6");
    expect(four.scenarios[0].parts[0]).toEqual({
      basket: "ADJACENT_4_BRIDGE",
      modifiers: mod({ implants: 2, units: 4 }),
    });
    expect(four.clinicalConfidence).toBe("MEDIUM");
    const five = adjacent("five", "all_removed", "4_6");
    expect(five.scenarios[0].parts[0].modifiers).toEqual(mod({ implants: 3, units: 5 }));
    expect(five.scenarios[0].referenceNote).toBe("Референс для оцінки: 3 імпланти + 5 ортопедичних одиниць");
    expect(five.clinicalConfidence).toBe("LOW_MEDIUM");
    const six = adjacent("six", "all_removed", "4_6");
    expect(six.scenarios[0].parts[0]).toEqual({
      basket: "ADJACENT_6_BRIDGE",
      modifiers: mod({ implants: 3, units: 6 }),
    });
    expect(six.clinicalConfidence).toBe("LOW_MEDIUM");
  });

  it("4–6 unknown → scenarios for 4 and 6, LOW", () => {
    const r = adjacent("unknown", "all_removed", "4_6");
    expect(ids(r)).toEqual(["ADJACENT_4_BRIDGE", "ADJACENT_6_BRIDGE"]);
    expect(r.clinicalConfidence).toBe("LOW");
  });

  it("state unsure_save: conditional note + flag + one level lower", () => {
    const r = adjacent("two", "unsure_save");
    expect(r.flags.unsureSave).toBe(true);
    expect(r.conditionalNote).toBeTruthy();
    expect(r.clinicalConfidence).toBe("MEDIUM");
    expect(extras(r)).toContain("EXTRACTION_SIMPLE");
  });

  it("state extraction_recommended: extraction extras with quantity = tooth count", () => {
    const r = adjacent("three", "extraction_recommended");
    const ex = r.relevantExtras.filter((e) => e.code.startsWith("EXTRACTION"));
    expect(ex.map((e) => e.quantity)).toEqual([3, 3]);
    expect(r.clinicalConfidence).toBe("MEDIUM");
    expect(r.flags.massExtraction).toBe(false);
  });

  it("state part_removed: extraction extras per remaining tooth", () => {
    const r = adjacent("three", "part_removed");
    const ex = r.relevantExtras.find((e) => e.code === "EXTRACTION_SIMPLE");
    expect(ex?.note).toBe("за кожен зуб, який ще треба видалити");
    expect(r.clinicalConfidence).toBe("MEDIUM");
  });

  it("state implants_placed: IMPLANT_ALREADY_PLACED with existing = reference implants, units = teeth, MEDIUM", () => {
    const r = adjacent("three", "implants_placed");
    expect(r.scenarios[0].parts[0]).toEqual({
      basket: "IMPLANT_ALREADY_PLACED",
      modifiers: mod({ existingImplants: 2, units: 3 }),
    });
    expect(r.clinicalConfidence).toBe("MEDIUM");
    expect(r.flags.existingImplants).toBe(true);
    expect(extras(r)).not.toContain("EXTRACTION_SIMPLE");

    const two = adjacent("two", "implants_placed");
    expect(two.clinicalConfidence).toBe("MEDIUM");
    expect(two.scenarios[0].parts[0].modifiers).toEqual(mod({ existingImplants: 2, units: 2 }));

    const unk = adjacent("unknown", "implants_placed");
    expect(ids(unk)).toEqual(["IMPLANT_ALREADY_PLACED_2", "IMPLANT_ALREADY_PLACED_3"]);
    expect(unk.clinicalConfidence).toBe("LOW_MEDIUM");
  });

  it("state unknown lowers confidence by one level", () => {
    expect(adjacent("two", "unknown").clinicalConfidence).toBe("MEDIUM");
    expect(adjacent("four", "unknown", "4_6").clinicalConfidence).toBe("LOW_MEDIUM");
    expect(adjacent("unknown", "unknown", "4_6").clinicalConfidence).toBe("LOW");
  });

  it("many teeth recommended for removal (≥5) raise the massExtraction flag (P-06)", () => {
    expect(adjacent("six", "extraction_recommended", "4_6").flags.massExtraction).toBe(true);
    expect(adjacent("four", "extraction_recommended", "4_6").flags.massExtraction).toBe(false);
  });
});

describe("6.4 separate", () => {
  it("2/3/4 → MULTIPLE_SEPARATE N+N, MEDIUM", () => {
    for (const [count, n] of [
      ["two", 2],
      ["three", 3],
      ["four", 4],
    ] as const) {
      const r = separate(count, "all_missing");
      expect(r.scenarios).toHaveLength(1);
      expect(r.scenarios[0].parts[0]).toEqual({
        basket: "MULTIPLE_SEPARATE",
        modifiers: mod({ implants: n, units: n }),
      });
      expect(r.clinicalConfidence).toBe("MEDIUM");
      expect(r.comparisonScope).toBe("teeth");
      expect(r.assumptions.join(" ")).toContain("один раз");
    }
  });

  it("5–6 → two scenarios N=5 and N=6, LOW", () => {
    const r = separate("five_six", "all_missing");
    expect(r.scenarios.map((s) => s.parts[0].modifiers.units)).toEqual([5, 6]);
    expect(r.scenarios.map((s) => s.parts[0].modifiers.implants)).toEqual([5, 6]);
    expect(r.clinicalConfidence).toBe("LOW");
  });

  it("more than 6 → full-arch direction only, LOW, no comparison scope, no 1:1 implants", () => {
    const r = separate("more_than_six", "all_missing");
    expect(r.kind).toBe("priced");
    expect(ids(r)).toEqual(["FULL_ARCH_AOX4", "FULL_ARCH_AOX6"]);
    expect(r.scenarios.every((s) => s.label.startsWith("Напрям: повнощелепне відновлення"))).toBe(true);
    expect(r.clinicalConfidence).toBe("LOW");
    expect(r.comparisonScope).toBeNull();
    expect(r.directionNotes?.join(" ")).toContain("не припускаємо один імплант на кожен відсутній зуб");
    expect(r.directionNotes?.join(" ")).toContain("Часткове відновлення");
    expect(r.flags.massExtraction).toBe(false);
    expect(separate("more_than_six", "extraction_recommended").flags.massExtraction).toBe(true);
  });

  it("unknown count: scenarios 2 and 4 (LOW) unless the state is unknown too → no_basket", () => {
    const r = separate("unknown", "all_missing");
    expect(r.scenarios.map((s) => s.parts[0].modifiers.units)).toEqual([2, 4]);
    expect(r.clinicalConfidence).toBe("LOW");
    expect(separate("unknown", "unknown").kind).toBe("no_basket");
  });

  it("some_implants_placed: implants = N − existing, system unknown lowers confidence", () => {
    const known = separate("four", "some_implants_placed", {
      existing_implants_count: "two",
      implant_system_known: "yes",
    });
    expect(known.scenarios[0].parts[0].modifiers).toEqual(mod({ implants: 2, existingImplants: 2, units: 4 }));
    expect(known.clinicalConfidence).toBe("MEDIUM");
    expect(known.flags.existingImplants).toBe(true);

    const unknownSystem = separate("four", "some_implants_placed", {
      existing_implants_count: "two",
      implant_system_known: "no",
    });
    expect(unknownSystem.clinicalConfidence).toBe("LOW_MEDIUM");

    const threePlus = separate("three", "some_implants_placed", {
      existing_implants_count: "three_plus",
      implant_system_known: "yes",
    });
    expect(threePlus.scenarios[0].parts[0].modifiers).toEqual(mod({ implants: 0, existingImplants: 3, units: 3 }));

    const unk = separate("two", "some_implants_placed", {
      existing_implants_count: "unknown",
      implant_system_known: "yes",
    });
    expect(unk.scenarios[0].parts[0].modifiers).toEqual(mod({ implants: 1, existingImplants: 1, units: 2 }));
    expect(unk.assumptions.join(" ")).toContain("беремо один імплант");
  });

  it("existing implants never exceed N (units ≥ implants + existing)", () => {
    const r = separate("two", "some_implants_placed", {
      existing_implants_count: "three_plus",
      implant_system_known: "yes",
    });
    const m = r.scenarios[0].parts[0].modifiers;
    expect(m.existingImplants).toBe(2);
    expect(m.implants).toBe(0);
  });

  it("unsure_save / unknown state lower confidence; extraction quantity = N", () => {
    expect(separate("three", "unsure_save").clinicalConfidence).toBe("LOW_MEDIUM");
    expect(separate("three", "unsure_save").flags.unsureSave).toBe(true);
    expect(separate("three", "unknown").clinicalConfidence).toBe("LOW_MEDIUM");
    const r = separate("three", "extraction_recommended");
    expect(r.relevantExtras.filter((e) => e.code.startsWith("EXTRACTION")).map((e) => e.quantity)).toEqual([3, 3]);
  });
});

describe("6.5 one jaw (full arch)", () => {
  it("no plan: AOX4 + AOX6 primary, AOX8 secondary; MEDIUM for no_teeth / removable_denture", () => {
    for (const situation of ["no_teeth", "removable_denture"]) {
      const r = arch(situation, "no");
      expect(ids(r)).toEqual(["AOX4", "AOX6", "AOX8"]);
      expect(r.scenarios.map((s) => !!s.isSecondary)).toEqual([false, false, true]);
      expect(r.scenarios.map((s) => s.parts[0].basket)).toEqual([
        "FULL_ARCH_AOX4",
        "FULL_ARCH_AOX6",
        "FULL_ARCH_AOX8",
      ]);
      expect(r.scenarios.map((s) => s.parts[0].modifiers.implants)).toEqual([4, 6, 8]);
      expect(r.scenarios[0].parts[0].modifiers.units).toBe(0);
      expect(r.clinicalConfidence).toBe("MEDIUM");
      expect(r.comparisonScope).toBe("full_arch");
      expect(r.flags.massExtraction).toBe(false);
      expect(r.defaultScenarioId).toBe("AOX4");
      expect(extras(r)).not.toContain("EXTRACTION_SIMPLE");
    }
  });

  it("few_left / mostly_destroyed / unknown: LOW; mass extraction for the first two", () => {
    const few = arch("few_left", "no");
    expect(few.clinicalConfidence).toBe("LOW");
    expect(few.flags.massExtraction).toBe(true);
    expect(few.relevantExtras.find((e) => e.code === "EXTRACTION_SIMPLE")).toEqual({
      code: "EXTRACTION_SIMPLE",
      note: "за кожен зуб; кількість визначить лікар",
      quantity: 1,
    });
    const destroyed = arch("mostly_destroyed", "offered_unknown");
    expect(destroyed.clinicalConfidence).toBe("LOW");
    expect(destroyed.flags.massExtraction).toBe(true);
    const unknown = arch("unknown", "no");
    expect(unknown.clinicalConfidence).toBe("LOW");
    expect(unknown.flags.massExtraction).toBe(false);
    expect(extras(unknown)).toContain("EXTRACTION_SIMPLE");
  });

  it("offered plan: that scenario first and default, others secondary, confidence one level higher", () => {
    const r = arch("no_teeth", "aox6");
    expect(ids(r)).toEqual(["AOX6", "AOX4", "AOX8"]);
    expect(r.scenarios.map((s) => !!s.isSecondary)).toEqual([false, true, true]);
    expect(r.defaultScenarioId).toBe("AOX6");
    expect(r.clinicalConfidence).toBe("MEDIUM_HIGH");
    expect(arch("no_teeth", "aox8").defaultScenarioId).toBe("AOX8");
    expect(arch("no_teeth", "aox4").defaultScenarioId).toBe("AOX4");
    expect(arch("few_left", "aox4").clinicalConfidence).toBe("LOW_MEDIUM");
    expect(arch("no_teeth", "offered_unknown").clinicalConfidence).toBe("MEDIUM");
  });

  it("assumptions say All-on-X are not quality levels and stage 1 is not 'під ключ'", () => {
    const r = arch("no_teeth", "no");
    const text = r.assumptions.join(" ");
    expect(text).toContain("не рівні якості");
    expect(text).toContain("більша кількість імплантів не означає автоматично кращий варіант");
    expect(text).toContain("під ключ");
    expect(r.assumptions.length).toBeLessThanOrEqual(4);
  });

  it("extras include bone, sinus (upper note), guide, sedation", () => {
    const r = arch("no_teeth", "no");
    expect(extras(r)).toEqual(["BONE_AUGMENTATION", "SINUS_LIFT", "SURGICAL_GUIDE", "SEDATION"]);
  });
});

describe("6.6 both jaws", () => {
  it("no plan → AOX4+AOX4 and AOX6+AOX6 as dynamic UPPER+LOWER parts", () => {
    const r = both("almost_none_both", "no");
    expect(ids(r)).toEqual(["AOX4+AOX4", "AOX6+AOX6"]);
    for (const s of r.scenarios) {
      expect(s.parts.map((p) => p.arch)).toEqual(["UPPER", "LOWER"]);
    }
    expect(r.scenarios[0].parts.map((p) => p.basket)).toEqual(["FULL_ARCH_AOX4", "FULL_ARCH_AOX4"]);
    expect(r.scenarios[1].parts.map((p) => p.modifiers.implants)).toEqual([6, 6]);
    expect(r.scenarios[0].label).toBe("All-on-4 + All-on-4");
    expect(r.assumptions.join(" ")).toContain("змішаний варіант");
    expect(r.clinicalConfidence).toBe("MEDIUM");
    expect(r.comparisonScope).toBe("full_arch");
    expect(r.title).toBe("Обидві щелепи");
  });

  it("confidence: MEDIUM for removable_dentures, LOW for many_problem_both/unknown; many_problem → massExtraction", () => {
    expect(both("removable_dentures", "no").clinicalConfidence).toBe("MEDIUM");
    const many = both("many_problem_both", "no");
    expect(many.clinicalConfidence).toBe("LOW");
    expect(many.flags.massExtraction).toBe(true);
    expect(extras(many)).toContain("EXTRACTION_SIMPLE");
    expect(both("unknown", "no").clinicalConfidence).toBe("LOW");
    expect(both("unknown", "no").flags.massExtraction).toBe(false);
  });

  it("full plan → one combined scenario, MEDIUM_HIGH", () => {
    const r = both("almost_none_both", ["aox4", "aox6"]);
    expect(ids(r)).toEqual(["AOX4+AOX6"]);
    expect(r.scenarios[0].parts.map((p) => [p.arch, p.basket])).toEqual([
      ["UPPER", "FULL_ARCH_AOX4"],
      ["LOWER", "FULL_ARCH_AOX6"],
    ]);
    expect(r.clinicalConfidence).toBe("MEDIUM_HIGH");
    expect(both("many_problem_both", ["aox8", "aox8"]).clinicalConfidence).toBe("LOW_MEDIUM");
  });

  it("an 'other'/'unknown' arch falls back to AOX4 and AOX6 for that arch only", () => {
    const r = both("almost_none_both", ["aox8", "other"]);
    expect(ids(r)).toEqual(["AOX8+AOX4", "AOX8+AOX6"]);
    expect(r.clinicalConfidence).toBe("MEDIUM");
    const r2 = both("almost_none_both", ["unknown", "aox6"]);
    expect(ids(r2)).toEqual(["AOX4+AOX6", "AOX6+AOX6"]);
    expect(both("almost_none_both", ["unknown", "unknown"]).scenarios.map((s) => s.id)).toEqual([
      "AOX4+AOX4",
      "AOX6+AOX6",
    ]);
  });

  it("both arches 'other' → no_basket", () => {
    const r = both("almost_none_both", ["other", "other"]);
    expect(r.kind).toBe("no_basket");
    expect(r.noBasketMessage).toBeTruthy();
    expect(r.comparisonScope).toBeNull();
  });

  it("one jaw almost toothless, the other partial → single-arch AOX4/AOX6 + direction note, LOW", () => {
    const r = both("one_none_other_partial", "no");
    expect(ids(r)).toEqual(["AOX4", "AOX6"]);
    expect(r.scenarios.every((s) => s.parts.length === 1)).toBe(true);
    expect(r.scenarios[0].parts[0].arch).toBeUndefined();
    expect(r.directionNotes).toEqual(["Для другої щелепи вартість залежить від плану часткового відновлення."]);
    expect(r.clinicalConfidence).toBe("LOW");
    expect(r.comparisonScope).toBe("full_arch");
    const planned = both("one_none_other_partial", ["aox6", "other"]);
    expect(ids(planned)).toEqual(["AOX6"]);
    expect(planned.clinicalConfidence).toBe("LOW_MEDIUM");
  });
});

describe("6.7 / incomplete answers", () => {
  it("triage hard_to_say and doctor 'не пам’ятаю' → no_basket with consultation / CheckMyPlan hint", () => {
    const hard = resolve({ teeth: "unknown", triage: "hard_to_say" });
    expect(hard.kind).toBe("no_basket");
    expect(hard.noBasketMessage).toContain("CheckMyPlan");
    expect(hard.clinicalConfidence).toBe("LOW");
    expect(hard.comparisonScope).toBeNull();
    const doctor = resolve({ teeth: "unknown", triage: "doctor_mentioned", triage_doctor: "unknown" });
    expect(doctor.kind).toBe("no_basket");
    expect(doctor.noBasketMessage).toContain("консультація");
  });

  it("triage-resolved answers resolve through the effective branch", () => {
    const r = resolve({
      teeth: "unknown",
      triage: "destroyed_mobile",
      triage_destroyed: "several",
      resolved_teeth: "separate",
      separate_state: "extraction_recommended",
      separate_count: "three",
    });
    expect(ids(r)).toEqual(["MULTIPLE_SEPARATE_3"]);
    expect(r.relevantExtras.filter((e) => e.code.startsWith("EXTRACTION")).length).toBe(2);
  });

  it("missing answers never crash and never invent a basket", () => {
    expect(resolve({}).kind).toBe("no_basket");
    expect(resolve({ teeth: "unknown" }).kind).toBe("no_basket");
    expect(resolve({ teeth: "one" }).kind).toBe("priced");
  });

  it("no string in any resolution mentions 'переплачу'", () => {
    const all = [
      single("already_removed"),
      adjacent("six", "extraction_recommended", "4_6"),
      separate("more_than_six", "extraction_recommended"),
      arch("few_left", "no"),
      both("many_problem_both", "no"),
      resolve({ teeth: "unknown", triage: "hard_to_say" }),
    ];
    all.forEach(noPay);
  });
});
