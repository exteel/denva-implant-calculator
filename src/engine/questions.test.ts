import { describe, it, expect } from "vitest";
import {
  QUESTIONS,
  answerQuestion,
  canGoBack,
  currentStep,
  effectiveTeeth,
  flowPath,
  goBack,
  progressEstimate,
  qualificationFromAnswers,
  startFlow,
  type FlowState,
} from "./questions";
import { resolve } from "./resolver";
import { routeCta } from "./routing";
import type { BasketCode, ExtraCode, Resolution } from "./types";

type Pair = [string, string | string[]];

function run(...pairs: Pair[]): FlowState {
  return pairs.reduce((s, [id, v]) => answerQuestion(s, id, v), startFlow());
}

function nextId(state: FlowState): string | null {
  const step = currentStep(state);
  return step.type === "question" ? step.questionId : null;
}

describe("question catalogue", () => {
  it("has unique option ids per question and matching ids", () => {
    for (const [key, q] of Object.entries(QUESTIONS)) {
      expect(q.id).toBe(key);
      const ids = q.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(q.title.length).toBeGreaterThan(0);
    }
  });

  it("S02 has the 7 spec options in order", () => {
    expect(QUESTIONS.teeth.options.map((o) => o.id)).toEqual([
      "one",
      "adjacent_2_3",
      "adjacent_4_6",
      "separate",
      "full_arch",
      "both_jaws",
      "unknown",
    ]);
  });

  it("Q00 is multi, skippable, with an exclusive 'nothing'", () => {
    const q = QUESTIONS.qualification;
    expect(q.type).toBe("multi");
    expect(q.skippable).toBe(true);
    expect(q.options.find((o) => o.id === "nothing")?.exclusive).toBe(true);
    expect(q.options.map((o) => o.id)).toEqual(["has_ct", "has_plan", "has_quote", "nothing"]);
  });

  it("only triage options carry `sets`, and every set key/value is a real question/option", () => {
    for (const q of Object.values(QUESTIONS)) {
      for (const o of q.options) {
        if (!o.sets) continue;
        expect(q.id.startsWith("triage")).toBe(true);
        for (const [key, value] of Object.entries(o.sets)) {
          if (key === "resolved_teeth") {
            expect(QUESTIONS.teeth.options.map((x) => x.id)).toContain(value);
          } else {
            expect(QUESTIONS[key]).toBeDefined();
            expect(QUESTIONS[key].options.map((x) => x.id)).toContain(value);
          }
        }
      }
    }
  });
});

describe("flow basics", () => {
  it("starts at S02 with nothing to go back to", () => {
    const s = startFlow();
    expect(currentStep(s)).toEqual({ type: "question", questionId: "teeth" });
    expect(canGoBack(s)).toBe(false);
    expect(progressEstimate(s)).toBe(0);
    expect(flowPath(s)).toEqual(["teeth"]);
    expect(goBack(s)).toEqual(s);
  });

  it("does not mutate the previous state", () => {
    const s0 = startFlow();
    const s1 = answerQuestion(s0, "teeth", "one");
    expect(s0).toEqual({ answers: {}, asked: [] });
    expect(s1.asked).toEqual(["teeth"]);
  });

  it("one tooth, already removed: S02 → single_state → Q00 → result", () => {
    let s = run(["teeth", "one"]);
    expect(nextId(s)).toBe("single_state");
    s = answerQuestion(s, "single_state", "already_removed");
    expect(nextId(s)).toBe("qualification");
    s = answerQuestion(s, "qualification", ["has_ct"]);
    expect(currentStep(s)).toEqual({ type: "result" });
    expect(s.asked).toEqual(["teeth", "single_state", "qualification"]);
    expect(progressEstimate(s)).toBe(1);
    expect(flowPath(s)).toEqual(["teeth", "single_state", "qualification"]);
  });

  it("implant_placed asks the implant system; old_problem asks what exactly", () => {
    expect(nextId(run(["teeth", "one"], ["single_state", "implant_placed"]))).toBe("implant_system_known");
    expect(nextId(run(["teeth", "one"], ["single_state", "old_problem"]))).toBe("old_problem_kind");
    expect(
      nextId(run(["teeth", "one"], ["single_state", "implant_placed"], ["implant_system_known", "no"])),
    ).toBe("qualification");
  });

  it("adjacent 2–3 and 4–6 share the adjacent_state question", () => {
    expect(nextId(run(["teeth", "adjacent_2_3"]))).toBe("adjacent_count_2_3");
    expect(nextId(run(["teeth", "adjacent_4_6"]))).toBe("adjacent_count_4_6");
    expect(nextId(run(["teeth", "adjacent_2_3"], ["adjacent_count_2_3", "two"]))).toBe("adjacent_state");
    expect(nextId(run(["teeth", "adjacent_4_6"], ["adjacent_count_4_6", "six"]))).toBe("adjacent_state");
  });

  it("separate: implants-placed asks count + system, except for >6", () => {
    const base = run(["teeth", "separate"], ["separate_count", "three"]);
    const placed = answerQuestion(base, "separate_state", "some_implants_placed");
    expect(nextId(placed)).toBe("existing_implants_count");
    const afterCount = answerQuestion(placed, "existing_implants_count", "two");
    expect(nextId(afterCount)).toBe("implant_system_known");
    expect(nextId(answerQuestion(afterCount, "implant_system_known", "yes"))).toBe("qualification");

    const many = run(
      ["teeth", "separate"],
      ["separate_count", "more_than_six"],
      ["separate_state", "some_implants_placed"],
    );
    expect(nextId(many)).toBe("qualification");
  });

  it("full arch: situation → plan offered → Q00", () => {
    const s = run(["teeth", "full_arch"], ["arch_situation", "few_left"]);
    expect(nextId(s)).toBe("arch_plan_offered");
    expect(nextId(answerQuestion(s, "arch_plan_offered", "aox6"))).toBe("qualification");
  });

  it("both jaws: plan yes asks upper then lower; plan no goes to Q00", () => {
    let s = run(["teeth", "both_jaws"], ["both_situation", "almost_none_both"]);
    expect(nextId(s)).toBe("both_plan_exists");
    const no = answerQuestion(s, "both_plan_exists", "no");
    expect(nextId(no)).toBe("qualification");
    s = answerQuestion(s, "both_plan_exists", "yes");
    expect(nextId(s)).toBe("upper_plan");
    s = answerQuestion(s, "upper_plan", "aox4");
    expect(nextId(s)).toBe("lower_plan");
    s = answerQuestion(s, "lower_plan", "aox6");
    expect(nextId(s)).toBe("qualification");
  });

  it("rejects unknown questions, invalid options and off-path answers", () => {
    expect(() => answerQuestion(startFlow(), "nope", "x")).toThrow();
    expect(() => answerQuestion(startFlow(), "teeth", "banana")).toThrow();
    expect(() => answerQuestion(startFlow(), "teeth", ["one"])).toThrow();
    expect(() => answerQuestion(startFlow(), "single_state", "already_removed")).toThrow();
  });
});

describe("going back and branch switching", () => {
  it("answer one → 1A, go back twice, switch to full_arch: no single_state left", () => {
    let s = run(["teeth", "one"], ["single_state", "already_removed"]);
    expect(s.answers.single_state).toBe("already_removed");
    s = goBack(s);
    s = goBack(s);
    expect(s).toEqual(startFlow());
    s = answerQuestion(s, "teeth", "full_arch");
    expect(s.answers).toEqual({ teeth: "full_arch" });
    expect("single_state" in s.answers).toBe(false);
    expect(flowPath(s)).toEqual(["teeth", "arch_situation"]);
  });

  it("re-answering an earlier question without goBack rewinds and prunes", () => {
    let s = run(["teeth", "one"], ["single_state", "implant_placed"], ["implant_system_known", "yes"]);
    s = answerQuestion(s, "teeth", "both_jaws");
    expect(s.answers).toEqual({ teeth: "both_jaws" });
    expect(s.asked).toEqual(["teeth"]);
    expect(nextId(s)).toBe("both_situation");
  });

  it("goBack from Q00 returns to the last clinical question and drops the answer", () => {
    const s = run(["teeth", "one"], ["single_state", "already_removed"], ["qualification", []]);
    expect(currentStep(s)).toEqual({ type: "result" });
    const back = goBack(s);
    expect(nextId(back)).toBe("qualification");
    expect("qualification" in back.answers).toBe(false);
    expect(canGoBack(back)).toBe(true);
  });

  it("changing the count within a branch keeps the branch consistent", () => {
    let s = run(["teeth", "adjacent_2_3"], ["adjacent_count_2_3", "two"], ["adjacent_state", "all_removed"]);
    s = goBack(goBack(s));
    s = answerQuestion(s, "adjacent_count_2_3", "three");
    expect(s.answers).toEqual({ teeth: "adjacent_2_3", adjacent_count_2_3: "three" });
    expect(nextId(s)).toBe("adjacent_state");
  });
});

describe("triage (S02 = unknown)", () => {
  it("old_implants sets teeth=one + single_state=old_problem and asks old_problem_kind", () => {
    const s = run(["teeth", "unknown"], ["triage", "old_implants"]);
    expect(effectiveTeeth(s.answers)).toBe("one");
    expect(s.answers.teeth).toBe("unknown");
    expect(s.answers.single_state).toBe("old_problem");
    expect(s.asked).toEqual(["teeth", "triage"]);
    expect(nextId(s)).toBe("old_problem_kind");
    expect(flowPath(s)).toEqual(["teeth", "triage", "old_problem_kind"]);
  });

  it("goBack removes the implied answers together with the asked answer", () => {
    const s = goBack(run(["teeth", "unknown"], ["triage", "old_implants"]));
    expect(s.answers).toEqual({ teeth: "unknown" });
    expect(s.asked).toEqual(["teeth"]);
    expect(nextId(s)).toBe("triage");
    expect(effectiveTeeth(s.answers)).toBeUndefined();
  });

  it("missing_teeth → one: implied state skips single_state, goes to Q00", () => {
    const s = run(["teeth", "unknown"], ["triage", "missing_teeth"], ["triage_missing", "one"]);
    expect(effectiveTeeth(s.answers)).toBe("one");
    expect(s.answers.single_state).toBe("already_removed");
    expect(s.asked).toEqual(["teeth", "triage", "triage_missing"]);
    expect(nextId(s)).toBe("qualification");
    const back = goBack(s);
    expect("single_state" in back.answers).toBe(false);
    expect("resolved_teeth" in back.answers).toBe(false);
    expect(nextId(back)).toBe("triage_missing");
  });

  it("missing_teeth → 2–3 поруч continues in the adjacent branch", () => {
    const s = run(["teeth", "unknown"], ["triage", "missing_teeth"], ["triage_missing", "few_adjacent"]);
    expect(nextId(s)).toBe("adjacent_count_2_3");
  });

  it("destroyed_mobile → several still asks separate_count; separate_state is implied", () => {
    const s = run(["teeth", "unknown"], ["triage", "destroyed_mobile"], ["triage_destroyed", "several"]);
    expect(nextId(s)).toBe("separate_count");
    const s2 = answerQuestion(s, "separate_count", "three");
    expect(s2.answers.separate_state).toBe("extraction_recommended");
    expect(nextId(s2)).toBe("qualification");
    expect(s2.asked).not.toContain("separate_state");
  });

  it("destroyed_mobile → one/most_one_jaw/both_jaws imply the branch state", () => {
    const one = run(["teeth", "unknown"], ["triage", "destroyed_mobile"], ["triage_destroyed", "one"]);
    expect(one.answers.single_state).toBe("unsure_save");
    expect(nextId(one)).toBe("qualification");

    const arch = run(["teeth", "unknown"], ["triage", "destroyed_mobile"], ["triage_destroyed", "most_one_jaw"]);
    expect(arch.answers.arch_situation).toBe("mostly_destroyed");
    expect(nextId(arch)).toBe("arch_plan_offered");

    const both = run(["teeth", "unknown"], ["triage", "destroyed_mobile"], ["triage_destroyed", "both_jaws"]);
    expect(both.answers.both_situation).toBe("many_problem_both");
    expect(nextId(both)).toBe("both_plan_exists");
  });

  it("denture_fixed maps to the denture situations", () => {
    const one = run(["teeth", "unknown"], ["triage", "denture_fixed"], ["triage_denture", "one_jaw"]);
    expect(one.answers.arch_situation).toBe("removable_denture");
    expect(effectiveTeeth(one.answers)).toBe("full_arch");
    const both = run(["teeth", "unknown"], ["triage", "denture_fixed"], ["triage_denture", "both"]);
    expect(both.answers.both_situation).toBe("removable_dentures");
    expect(effectiveTeeth(both.answers)).toBe("both_jaws");
  });

  it("doctor_mentioned mirrors S02; 'Не пам’ятаю' ends without a basket", () => {
    const sep = run(["teeth", "unknown"], ["triage", "doctor_mentioned"], ["triage_doctor", "separate"]);
    expect(nextId(sep)).toBe("separate_count");
    const unk = run(["teeth", "unknown"], ["triage", "doctor_mentioned"], ["triage_doctor", "unknown"]);
    expect(effectiveTeeth(unk.answers)).toBeUndefined();
    expect(nextId(unk)).toBe("qualification");
    expect(resolve(answerQuestion(unk, "qualification", []).answers).kind).toBe("no_basket");
  });

  it("hard_to_say goes straight to Q00 and resolves to no_basket", () => {
    const s = run(["teeth", "unknown"], ["triage", "hard_to_say"]);
    expect(nextId(s)).toBe("qualification");
    const done = answerQuestion(s, "qualification", ["nothing"]);
    expect(currentStep(done)).toEqual({ type: "result" });
    expect(resolve(done.answers).kind).toBe("no_basket");
  });

  it("switching the triage answer re-derives implied answers (no stale keys)", () => {
    let s = run(["teeth", "unknown"], ["triage", "destroyed_mobile"], ["triage_destroyed", "most_one_jaw"]);
    s = goBack(goBack(s));
    s = answerQuestion(s, "triage", "denture_fixed");
    s = answerQuestion(s, "triage_denture", "both");
    expect(s.answers).toEqual({
      teeth: "unknown",
      triage: "denture_fixed",
      triage_denture: "both",
      resolved_teeth: "both_jaws",
      both_situation: "removable_dentures",
    });
  });
});

describe("Q00 qualification", () => {
  it("skipping stores an empty array (answered-but-empty) and still reaches the result", () => {
    const s = run(["teeth", "one"], ["single_state", "already_removed"], ["qualification", []]);
    expect(s.answers.qualification).toEqual([]);
    expect(currentStep(s)).toEqual({ type: "result" });
    expect(qualificationFromAnswers(s.answers)).toEqual({ hasCt: false, hasPlan: false, hasQuote: false });
  });

  it("maps selected options to signals", () => {
    expect(qualificationFromAnswers({ qualification: ["has_ct", "has_quote"] })).toEqual({
      hasCt: true,
      hasPlan: false,
      hasQuote: true,
    });
    expect(qualificationFromAnswers({ qualification: ["has_plan"] }).hasPlan).toBe(true);
    expect(qualificationFromAnswers({})).toEqual({ hasCt: false, hasPlan: false, hasQuote: false });
  });

  it("'Нічого з цього' is exclusive", () => {
    const s = run(["teeth", "one"], ["single_state", "already_removed"], ["qualification", ["has_ct", "nothing"]]);
    expect(s.answers.qualification).toEqual(["nothing"]);
  });

  it("rejects unknown multi options", () => {
    expect(() =>
      run(["teeth", "one"], ["single_state", "already_removed"], ["qualification", ["bogus"]]),
    ).toThrow();
  });
});

// ───────────────────────── exhaustive path enumeration ─────────────────────────

const BASKETS: BasketCode[] = [
  "SINGLE_TOOTH_STANDARD",
  "SINGLE_TOOTH_TEMP",
  "IMPLANT_ALREADY_PLACED",
  "ADJACENT_2",
  "ADJACENT_3_BRIDGE",
  "ADJACENT_4_BRIDGE",
  "ADJACENT_5_BRIDGE",
  "ADJACENT_6_BRIDGE",
  "MULTIPLE_SEPARATE",
  "FULL_ARCH_AOX4",
  "FULL_ARCH_AOX6",
  "FULL_ARCH_AOX8",
];
const EXTRAS: ExtraCode[] = [
  "EXTRACTION_SIMPLE",
  "EXTRACTION_COMPLEX",
  "BONE_AUGMENTATION",
  "SINUS_LIFT",
  "SOFT_TISSUE_GRAFT",
  "SURGICAL_GUIDE",
  "SEDATION",
  "TEMPORARY_CROWN",
];

/** Representative Q00 sets, covering every signal and the skip. */
const Q00_SETS: string[][] = [[], ["nothing"], ["has_ct"], ["has_plan", "has_quote"], ["has_ct", "has_plan", "has_quote"]];

function assertValidResolution(r: Resolution, ctx: string): void {
  expect(r.title.length, ctx).toBeGreaterThan(0);
  expect(r.assumptions.length, ctx).toBeGreaterThanOrEqual(1);
  expect(r.assumptions.length, ctx).toBeLessThanOrEqual(4);
  for (const a of r.assumptions) expect(a.length, ctx).toBeGreaterThan(0);
  expect(JSON.stringify(r).toLowerCase(), ctx).not.toContain("переплачу");

  if (r.kind === "no_basket") {
    expect(r.scenarios, ctx).toEqual([]);
    expect(r.noBasketMessage?.length ?? 0, ctx).toBeGreaterThan(20);
    expect(r.comparisonScope, ctx).toBeNull();
    expect(r.defaultScenarioId, ctx).toBeUndefined();
    return;
  }

  expect(r.scenarios.length, ctx).toBeGreaterThanOrEqual(1);
  const ids = r.scenarios.map((s) => s.id);
  expect(new Set(ids).size, ctx).toBe(ids.length);
  const def = r.scenarios.find((s) => s.id === r.defaultScenarioId);
  expect(def, ctx).toBeDefined();
  expect(def?.isSecondary, ctx).toBeFalsy();

  for (const s of r.scenarios) {
    expect(s.label.length, ctx).toBeGreaterThan(0);
    expect([1, 2], ctx).toContain(s.parts.length);
    if (s.parts.length === 2) {
      expect(s.parts.map((p) => p.arch), ctx).toEqual(["UPPER", "LOWER"]);
    }
    for (const p of s.parts) {
      expect(BASKETS, ctx).toContain(p.basket);
      const m = p.modifiers;
      for (const v of [m.implants, m.existingImplants, m.units, m.tempCrowns]) {
        expect(Number.isInteger(v) && v >= 0, `${ctx} ${JSON.stringify(m)}`).toBe(true);
      }
      if (p.basket.startsWith("FULL_ARCH")) {
        const n = Number(p.basket.slice(-1));
        expect(m.implants, ctx).toBe(n);
        expect(m.units, ctx).toBe(0);
        expect(m.existingImplants, ctx).toBe(0);
      } else {
        expect(m.units, ctx).toBeGreaterThanOrEqual(m.implants + m.existingImplants);
        expect(m.units, ctx).toBeGreaterThanOrEqual(1);
        expect(m.tempCrowns, ctx).toBe(0);
      }
      if (p.basket === "IMPLANT_ALREADY_PLACED") {
        expect(m.implants, ctx).toBe(0);
        expect(m.existingImplants, ctx).toBeGreaterThanOrEqual(1);
        expect(r.flags.existingImplants, ctx).toBe(true);
      }
    }
  }
  for (const e of r.relevantExtras) {
    expect(EXTRAS, ctx).toContain(e.code);
    if (e.quantity !== undefined) expect(e.quantity, ctx).toBeGreaterThanOrEqual(1);
  }
  const isArch = r.scenarios.every((s) => s.parts.every((p) => p.basket.startsWith("FULL_ARCH")));
  if (r.comparisonScope !== null) {
    expect(r.comparisonScope, ctx).toBe(isArch ? "full_arch" : "teeth");
  } else {
    expect(r.directionNotes?.length ?? 0, ctx).toBeGreaterThan(0);
  }
}

describe("every path through the graph", () => {
  it("ends in a result with a valid resolution, sane progress and consistent routing", () => {
    let leaves = 0;
    const seenScenarioIds = new Set<string>();
    const noBasketTitles = new Set<string>();

    function visit(state: FlowState, prevProgress: number, trail: string): void {
      const step = currentStep(state);
      const progress = progressEstimate(state);
      expect(progress, trail).toBeGreaterThanOrEqual(0);
      expect(progress, trail).toBeLessThanOrEqual(1);
      expect(progress, trail).toBeGreaterThanOrEqual(prevProgress - 1e-9);

      // flowPath always ends with the current question (or is all-asked at the result).
      const path = flowPath(state);
      if (step.type === "question") {
        expect(QUESTIONS[step.questionId], trail).toBeDefined();
        expect(path[path.length - 1], trail).toBe(step.questionId);
      } else {
        expect(progress, trail).toBe(1);
        expect(path, trail).toEqual(state.asked);
      }

      if (step.type === "result") {
        leaves++;
        const r = resolve(state.answers);
        assertValidResolution(r, trail);
        r.scenarios.forEach((s) => seenScenarioIds.add(s.id));
        if (r.kind === "no_basket") noBasketTitles.add(r.title);
        const cta = routeCta({ resolution: r, qualification: qualificationFromAnswers(state.answers) });
        expect(["checkmyplan", "ct", "consultation", "tender"], trail).toContain(cta.service);
        return;
      }

      const q = QUESTIONS[step.questionId];
      if (q.id === "qualification") {
        // Q00 is reached exactly once, on every path, with everything answered before it.
        expect(state.asked.filter((x) => x === "qualification"), trail).toHaveLength(0);
        for (const set of Q00_SETS) {
          const next = answerQuestion(state, q.id, set);
          expect(currentStep(next), `${trail} > Q00 ${set.join(",")}`).toEqual({ type: "result" });
          visit(next, progress, `${trail} > Q00 ${set.join(",")}`);
        }
        return;
      }
      for (const o of q.options) {
        const next = answerQuestion(state, q.id, o.id);
        // going back from any state restores the previous state exactly
        expect(goBack(next), `${trail} > ${q.id}=${o.id}`).toEqual(state);
        visit(next, progress, `${trail} > ${q.id}=${o.id}`);
      }
    }

    visit(startFlow(), 0, "root");

    expect(leaves).toBeGreaterThan(1000);
    for (const id of [
      "SINGLE_TOOTH_STANDARD",
      "IMPLANT_ALREADY_PLACED",
      "ADJACENT_2",
      "ADJACENT_3_BRIDGE",
      "ADJACENT_4_BRIDGE",
      "ADJACENT_5_BRIDGE",
      "ADJACENT_6_BRIDGE",
      "MULTIPLE_SEPARATE_2",
      "MULTIPLE_SEPARATE_6",
      "AOX4",
      "AOX6",
      "AOX8",
      "AOX4+AOX4",
      "AOX6+AOX6",
      "AOX4+AOX6",
      "FULL_ARCH_AOX4",
    ]) {
      expect(seenScenarioIds.has(id), id).toBe(true);
    }
    expect(noBasketTitles.size).toBeGreaterThanOrEqual(3);
  });
});
