import type { Answers, FollowUpId, Params, ScenarioKind, ToothState } from "./types";

export const MAX_TEETH = 7;

/** One follow-up per branch (ТЗ §5.3). */
export function followUpFor(answers: Answers): FollowUpId | null {
  switch (answers.scope) {
    case "individual": {
      const count = answers.count;
      if (count === undefined) return null;
      if (count <= 1) return "tooth_state";
      return count >= MAX_TEETH ? "seven_where" : "arrangement";
    }
    case "one_jaw":
    case "both_jaws":
      return "jaw_state";
    case "unknown":
      return "approx";
    default:
      return null;
  }
}

/** Keeps the follow-up answer only while it belongs to the (new) branch. */
export function pruneFollowUp(answers: Answers): Answers {
  const { followUp, ...rest } = answers;
  return followUp && followUp.id === followUpFor(answers) ? answers : rest;
}

export function isComplete(answers: Answers): boolean {
  const id = followUpFor(answers);
  return id !== null && answers.followUp?.id === id;
}

export const DEFAULT_PARAMS: Params = {
  scope: "individual",
  teeth: 1,
  toothState: "unknown",
  arrangement: "unknown",
  jaws: 1,
  allOn: 4,
  teethPresent: false,
};

/**
 * Answers → scenario parameters (ТЗ §5.3). Returns null until the branch is
 * complete. "Не знаю точно" maps as agreed with the owner: один → one tooth,
 * кілька → 3 teeth with unknown arrangement, більшість → one jaw, не знаю →
 * the single-tooth reference price.
 */
export function deriveParams(answers: Answers): Params | null {
  if (!isComplete(answers) || !answers.followUp) return null;
  const value = answers.followUp.value;
  const base = { ...DEFAULT_PARAMS };

  switch (answers.scope) {
    case "individual": {
      const teeth = Math.min(Math.max(answers.count ?? 1, 1), MAX_TEETH);
      if (teeth === 1) {
        const toothState = value as ToothState;
        return { ...base, scope: "individual", teeth, toothState, teethPresent: toothState === "present" };
      }
      if (teeth < MAX_TEETH) {
        return { ...base, scope: "individual", teeth, arrangement: value as Params["arrangement"] };
      }
      return { ...base, scope: "individual", teeth, jaws: value === "both" ? 2 : 1 };
    }
    case "one_jaw":
      return { ...base, scope: "one_jaw", jaws: 1, teethPresent: value === "present" };
    case "both_jaws":
      return { ...base, scope: "both_jaws", jaws: 2, teethPresent: value === "present" };
    case "unknown":
      switch (value) {
        case "one":
          return { ...base, scope: "individual", teeth: 1 };
        case "several":
          return { ...base, scope: "individual", teeth: 3, approx: "several" };
        case "most_one_jaw":
          return { ...base, scope: "one_jaw", jaws: 1 };
        default:
          return { ...base, scope: "reference" };
      }
    default:
      return null;
  }
}

export function scenarioKind(p: Params): ScenarioKind {
  if (p.scope === "reference") return "reference";
  if (p.scope === "one_jaw" || p.scope === "both_jaws") return "arch";
  if (p.teeth <= 1) return "single";
  return p.teeth >= MAX_TEETH ? "seven_plus" : "multi";
}

/** Jaws treated by the scenario (arch scopes and "7+"). */
export function jawsOf(p: Params): 1 | 2 {
  if (p.scope === "both_jaws") return 2;
  if (p.scope === "one_jaw") return 1;
  return p.jaws;
}

/** Full-arch results (All-on tabs, first stage / permanent / total). */
export function isArchLike(kind: ScenarioKind): boolean {
  return kind === "arch" || kind === "seven_plus";
}

/** An already-placed implant needs no implant price, so the toggle is moot. */
export function usesImplantTier(p: Params): boolean {
  return !(scenarioKind(p) === "single" && p.toothState === "implant_placed");
}

// ───────────────────────── edits on the result page (ТЗ §6) ─────────────────────────

export function setScope(p: Params, scope: "individual" | "one_jaw" | "both_jaws"): Params {
  if (scope === "individual") {
    return { ...p, scope, teeth: p.scope === "individual" ? p.teeth : 1, approx: undefined };
  }
  return { ...p, scope, jaws: scope === "both_jaws" ? 2 : 1, approx: undefined };
}

export function setTeeth(p: Params, teeth: number): Params {
  const next = Math.min(Math.max(Math.round(teeth), 1), MAX_TEETH);
  // A count the patient never typed in is no longer an assumption.
  return { ...p, scope: "individual", teeth: next, approx: undefined, teethPresent: next === 1 ? p.toothState === "present" : false };
}

export function setToothState(p: Params, toothState: ToothState): Params {
  return { ...p, toothState, teethPresent: toothState === "present" };
}
