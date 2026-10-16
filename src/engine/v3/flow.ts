import type { Jaw, JawInput, JawScenarioChoice, PatientTier, ToothLocation, ToothStatus } from "../../lib/contracts";
import { clampTeeth } from "./calc";

/** Per-jaw answers of the question flow (ТЗ §5.3–5.4). */
export interface JawAnswers {
  location: ToothLocation | null;
  status: ToothStatus | null;
  /** Only with status "implants_installed". */
  installed: number | "unknown" | null;
}

export const EMPTY_JAW_ANSWERS: JawAnswers = { location: null, status: null, installed: null };

export type QuestionKind = "location" | "status" | "installed";

export interface Question {
  jaw: Jaw;
  kind: QuestionKind;
}

/** Questions of one jaw: 1 → стан; 2–6 → розташування + стан; 7–14 → стан; + кількість імплантів. */
export function jawQuestions(jaw: Jaw, count: number, answers: JawAnswers): Question[] {
  const n = clampTeeth(count);
  if (n === 0) return [];
  const list: Question[] = [];
  if (n >= 2 && n <= 6) list.push({ jaw, kind: "location" });
  list.push({ jaw, kind: "status" });
  if (answers.status === "implants_installed") list.push({ jaw, kind: "installed" });
  return list;
}

/** Upper jaw first, then lower; a jaw with 0 teeth is skipped (ТЗ §5.3). */
export function allQuestions(
  counts: { upper: number; lower: number },
  answers: { upper: JawAnswers; lower: JawAnswers },
): Question[] {
  return [...jawQuestions("upper", counts.upper, answers.upper), ...jawQuestions("lower", counts.lower, answers.lower)];
}

export function isAnswered(question: Question, answers: JawAnswers): boolean {
  switch (question.kind) {
    case "location":
      return answers.location !== null;
    case "status":
      return answers.status !== null;
    case "installed":
      return answers.installed !== null;
  }
}

/** Drops answers that no longer apply after the count / status changed. */
export function normalizeJawAnswers(count: number, answers: JawAnswers): JawAnswers {
  const n = clampTeeth(count);
  const location = n >= 2 && n <= 6 ? answers.location : null;
  const status = n === 0 ? null : answers.status;
  let installed: JawAnswers["installed"] = null;
  if (status === "implants_installed" && answers.installed !== null) {
    installed = answers.installed === "unknown" ? "unknown" : Math.min(Math.max(Math.trunc(answers.installed), 1), n);
  }
  return { location, status, installed };
}

export interface JawSettings {
  implant_tier: PatientTier;
  crown_or_arch_tier: PatientTier;
  scenario: JawScenarioChoice;
}

/**
 * State → JawInput. Unanswered questions default to "unknown" so the result
 * is never blocked (e.g. after the count was edited on the result page).
 */
export function buildJawInput(
  jaw: Jaw,
  count: number,
  answers: JawAnswers,
  settings: JawSettings,
  includeTemporary: boolean,
): JawInput | null {
  const n = clampTeeth(count);
  if (n === 0) return null;
  const a = normalizeJawAnswers(n, answers);
  const status = a.status ?? "unknown";
  return {
    jaw,
    tooth_count: n,
    location: n >= 2 && n <= 6 ? (a.location ?? "unknown") : null,
    status,
    installed_implant_count: status === "implants_installed" ? (a.installed ?? "unknown") : null,
    scenario: n >= 7 ? settings.scenario : null,
    implant_tier: settings.implant_tier,
    crown_or_arch_tier: settings.crown_or_arch_tier,
    include_temporary: includeTemporary,
  };
}
