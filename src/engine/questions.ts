/**
 * Question graph + flow state (ТЗ §5 S02, §6.1–6.7, §7 Q00).
 *
 * The flow is one question per screen; city selection happens before it.
 *
 * Design
 * ──────
 * - `QUESTIONS` is the static catalogue (ids are a stable contract with the
 *   resolver).
 * - The path is DERIVED from the answers by walking the graph from the root
 *   (`teeth`); every question has a `next(answers)` rule (see `NEXT`).
 * - Triage (ТЗ §6.7): when S02 is answered "unknown", the user is moved into
 *   an existing branch via option `sets`. The root answer stays
 *   `teeth = "unknown"`; the implied branch is stored under the separate key
 *   `resolved_teeth`. `effectiveTeeth(answers)` returns the one effective
 *   branch, and that is the only function the resolver should use to learn the
 *   branch. Other implied keys (e.g. `single_state`) are stored under their own
 *   question id, so the walker simply treats the question as already answered
 *   and skips it. Implied answers are NOT in `FlowState.asked`.
 * - `FlowState.asked` is the log of questions the user really answered. Every
 *   state change re-derives `answers` by replaying `asked` from scratch, so
 *   going back (or re-answering an earlier question) can never leave stale or
 *   implied answers behind; a final prune pass removes anything that is not on
 *   the derived path as a safety net.
 */

import type {
  Answers,
  FlowStep,
  Qualification,
  Question,
  QuestionOption,
} from "./types";

// ───────────────────────── helpers ─────────────────────────

const opt = (
  id: string,
  label: string,
  extra: Partial<Omit<QuestionOption, "id" | "label">> = {},
): QuestionOption => ({ id, label, ...extra });

const ARCH_PLAN_OPTIONS = (): QuestionOption[] => [
  opt("aox4", "All-on-4"),
  opt("aox6", "All-on-6"),
  opt("aox8", "All-on-8"),
  opt("other", "Інше"),
  opt("unknown", "Не знаю"),
];

const TEETH_OPTIONS: Array<[string, string]> = [
  ["one", "1 зуб"],
  ["adjacent_2_3", "2–3 зуби поруч"],
  ["adjacent_4_6", "4–6 зубів поруч"],
  ["separate", "Кілька зубів у різних місцях"],
  ["full_arch", "Більшість або всі зуби на одній щелепі"],
  ["both_jaws", "Обидві щелепи"],
];

const ADJACENT_STATE_OPTIONS = (): QuestionOption[] => [
  opt("all_removed", "Усі вже видалені"),
  opt("part_removed", "Частина видалена"),
  opt("extraction_recommended", "Рекомендують видалення"),
  opt("unsure_save", "Не знаю, чи можна зберегти"),
  opt("implants_placed", "Імпланти вже встановлені"),
  opt("unknown", "Не знаю"),
];

// ───────────────────────── question catalogue ─────────────────────────

export const QUESTIONS: Record<string, Question> = {
  // ── S02 ──
  teeth: {
    id: "teeth",
    title: "Скільки зубів потрібно відновити?",
    subtitle: "Це не діагноз — відповідь потрібна лише для того, щоб підібрати сценарій розрахунку.",
    type: "single",
    options: [
      opt("one", "1 зуб"),
      opt("adjacent_2_3", "2–3 зуби поруч"),
      opt("adjacent_4_6", "4–6 зубів поруч"),
      opt("separate", "Кілька зубів у різних місцях"),
      opt("full_arch", "Більшість або всі зуби на одній щелепі"),
      opt("both_jaws", "Обидві щелепи"),
      opt("unknown", "Не знаю"),
    ],
  },

  // ── 6.1 one tooth ──
  single_state: {
    id: "single_state",
    title: "Що зараз із цим зубом?",
    type: "single",
    options: [
      opt("already_removed", "Зуб уже видалений"),
      opt("extraction_recommended", "Зуб ще є, лікар рекомендує видалити"),
      opt("unsure_save", "Не знаю, чи можна його зберегти"),
      opt("implant_placed", "Імплант уже встановлений"),
      opt("old_problem", "Проблема зі старою коронкою або імплантом"),
      opt("unknown", "Не знаю"),
    ],
  },
  implant_system_known: {
    id: "implant_system_known",
    title: "Чи відома система імпланта (є паспорт імпланта)?",
    subtitle:
      "Від цього залежить сумісність компонентів. Паспорт імпланта зазвичай видає клініка після встановлення.",
    type: "single",
    options: [opt("yes", "Так"), opt("no", "Ні або не пам’ятаю")],
  },
  old_problem_kind: {
    id: "old_problem_kind",
    title: "Що саме турбує?",
    type: "single",
    options: [
      opt("crown_only", "Лише коронка (імплант у порядку)"),
      opt("implant_problem", "Проблема з самим імплантом"),
      opt("unknown", "Не знаю"),
    ],
  },

  // ── 6.2 / 6.3 adjacent ──
  adjacent_count_2_3: {
    id: "adjacent_count_2_3",
    title: "Скільки зубів поруч потрібно відновити?",
    type: "single",
    options: [opt("two", "2 зуби"), opt("three", "3 зуби"), opt("unknown", "Не знаю")],
  },
  adjacent_count_4_6: {
    id: "adjacent_count_4_6",
    title: "Скільки зубів поруч потрібно відновити?",
    type: "single",
    options: [
      opt("four", "4 зуби"),
      opt("five", "5 зубів"),
      opt("six", "6 зубів"),
      opt("unknown", "Не знаю"),
    ],
  },
  adjacent_state: {
    id: "adjacent_state",
    title: "Який зараз стан цих зубів?",
    type: "single",
    options: ADJACENT_STATE_OPTIONS(),
  },

  // ── 6.4 separate ──
  separate_count: {
    id: "separate_count",
    title: "Скільки зубів у різних місцях потрібно відновити?",
    type: "single",
    options: [
      opt("two", "2 зуби"),
      opt("three", "3 зуби"),
      opt("four", "4 зуби"),
      opt("five_six", "5–6 зубів"),
      opt("more_than_six", "Більше 6"),
      opt("unknown", "Не знаю"),
    ],
  },
  separate_state: {
    id: "separate_state",
    title: "Який зараз стан цих зубів?",
    type: "single",
    options: [
      opt("all_missing", "Усі відсутні"),
      opt("part_missing", "Частина відсутня"),
      opt("extraction_recommended", "Рекомендують видалення"),
      opt("unsure_save", "Не знаю, чи можна зберегти"),
      opt("some_implants_placed", "Частина імплантів уже встановлена"),
      opt("unknown", "Не знаю"),
    ],
  },
  existing_implants_count: {
    id: "existing_implants_count",
    title: "Скільки імплантів уже встановлено?",
    type: "single",
    options: [
      opt("one", "1"),
      opt("two", "2"),
      opt("three_plus", "3 і більше"),
      opt("unknown", "Не знаю"),
    ],
  },

  // ── 6.5 one jaw ──
  arch_situation: {
    id: "arch_situation",
    title: "Яка зараз ситуація на цій щелепі?",
    type: "single",
    options: [
      opt("no_teeth", "Зубів немає"),
      opt("few_left", "Залишилося лише кілька зубів"),
      opt("mostly_destroyed", "Більшість зубів сильно зруйновані або рухомі"),
      opt("removable_denture", "Ношу знімний протез"),
      opt("unknown", "Не знаю"),
    ],
  },
  arch_plan_offered: {
    id: "arch_plan_offered",
    title: "Чи вам уже пропонували повне відновлення щелепи?",
    type: "single",
    options: [
      opt("no", "Ні"),
      opt("aox4", "Так, All-on-4"),
      opt("aox6", "Так, All-on-6"),
      opt("aox8", "Так, All-on-8"),
      opt("offered_unknown", "Пропонували, але не знаю яке"),
    ],
  },

  // ── 6.6 both jaws ──
  both_situation: {
    id: "both_situation",
    title: "Яка зараз ситуація на щелепах?",
    type: "single",
    options: [
      opt("almost_none_both", "Майже немає зубів на обох щелепах"),
      opt("one_none_other_partial", "На одній майже немає, на іншій частина зубів збережена"),
      opt("many_problem_both", "Багато проблемних зубів на обох щелепах"),
      opt("removable_dentures", "Ношу знімні протези"),
      opt("unknown", "Не знаю"),
    ],
  },
  both_plan_exists: {
    id: "both_plan_exists",
    title: "Чи вже є план лікування від лікаря?",
    type: "single",
    options: [opt("yes", "Так"), opt("no", "Ні")],
  },
  upper_plan: {
    id: "upper_plan",
    title: "Що запропонували для верхньої щелепи?",
    type: "single",
    options: ARCH_PLAN_OPTIONS(),
  },
  lower_plan: {
    id: "lower_plan",
    title: "Що запропонували для нижньої щелепи?",
    type: "single",
    options: ARCH_PLAN_OPTIONS(),
  },

  // ── 6.7 triage ──
  triage: {
    id: "triage",
    title: "Що найкраще описує вашу ситуацію?",
    subtitle: "Допоможемо підібрати відповідний сценарій — це займе ще одне-два прості запитання.",
    type: "single",
    options: [
      opt("missing_teeth", "Немає одного або кількох зубів"),
      opt("destroyed_mobile", "Є сильно зруйновані або рухомі зуби"),
      opt("doctor_mentioned", "Лікар уже говорив про імпланти"),
      opt("denture_fixed", "Ношу знімний протез і розглядаю незнімні зуби"),
      opt("old_implants", "Проблема зі старими імплантами або коронками", {
        sets: { resolved_teeth: "one", single_state: "old_problem" },
      }),
      opt("hard_to_say", "Важко сказати"),
    ],
  },
  triage_missing: {
    id: "triage_missing",
    title: "Скільки приблизно зубів немає?",
    type: "single",
    options: [
      opt("one", "1 зуб", { sets: { resolved_teeth: "one", single_state: "already_removed" } }),
      opt("few_adjacent", "2–3 поруч", { sets: { resolved_teeth: "adjacent_2_3" } }),
      opt("several_places", "Кілька в різних місцях", { sets: { resolved_teeth: "separate" } }),
      opt("most_on_jaw", "Більшість на одній щелепі", { sets: { resolved_teeth: "full_arch" } }),
    ],
  },
  triage_destroyed: {
    id: "triage_destroyed",
    title: "Скільки таких зубів?",
    type: "single",
    options: [
      opt("one", "1 зуб", { sets: { resolved_teeth: "one", single_state: "unsure_save" } }),
      opt("several", "Кілька", {
        sets: { resolved_teeth: "separate", separate_state: "unsure_save" },
      }),
      opt("most_one_jaw", "Більшість на одній щелепі", {
        sets: { resolved_teeth: "full_arch", arch_situation: "mostly_destroyed" },
      }),
      opt("both_jaws", "Багато на обох щелепах", {
        sets: { resolved_teeth: "both_jaws", both_situation: "many_problem_both" },
      }),
    ],
  },
  triage_doctor: {
    id: "triage_doctor",
    title: "Про скільки зубів ішлося?",
    type: "single",
    options: [
      ...TEETH_OPTIONS.map(([id, label]) => opt(id, label, { sets: { resolved_teeth: id } })),
      opt("unknown", "Не пам’ятаю"),
    ],
  },
  triage_denture: {
    id: "triage_denture",
    title: "Одна щелепа чи обидві?",
    type: "single",
    options: [
      opt("one_jaw", "Одна щелепа", {
        sets: { resolved_teeth: "full_arch", arch_situation: "removable_denture" },
      }),
      opt("both", "Обидві щелепи", {
        sets: { resolved_teeth: "both_jaws", both_situation: "removable_dentures" },
      }),
    ],
  },

  // ── Q00 ──
  qualification: {
    id: "qualification",
    title: "Що у вас уже є?",
    subtitle:
      "Можна обрати кілька. Це допоможе підказати наступний крок — результат ви побачите в будь-якому разі.",
    type: "multi",
    skippable: true,
    options: [
      opt("has_ct", "Маю КТ"),
      opt("has_plan", "Маю план лікування / кошторис"),
      opt("has_quote", "Мені вже назвали вартість"),
      opt("nothing", "Нічого з цього", { exclusive: true }),
    ],
  },
};

// ───────────────────────── graph ─────────────────────────

const ROOT = "teeth";
const QUALIFICATION = "qualification";
const MAX_STEPS = 64;

const str = (a: Answers, key: string): string | undefined => {
  const v = a[key];
  return typeof v === "string" ? v : undefined;
};

/**
 * The one effective S02 branch: the direct `teeth` answer, or — after a
 * "Не знаю" + triage — the branch the triage resolved to (`resolved_teeth`).
 * `undefined` = not answered yet, or triage could not place the user in any
 * branch (hard_to_say / "Не пам’ятаю").
 */
export function effectiveTeeth(answers: Answers): string | undefined {
  const t = str(answers, "teeth");
  if (t === undefined) return undefined;
  if (t === "unknown") return str(answers, "resolved_teeth");
  return t;
}

/** First question of the branch for an S02 value (undefined → straight to Q00). */
function branchEntry(teeth: string | undefined): string {
  switch (teeth) {
    case "one":
      return "single_state";
    case "adjacent_2_3":
      return "adjacent_count_2_3";
    case "adjacent_4_6":
      return "adjacent_count_4_6";
    case "separate":
      return "separate_count";
    case "full_arch":
      return "arch_situation";
    case "both_jaws":
      return "both_situation";
    default:
      return QUALIFICATION;
  }
}

const afterTriageSub = (a: Answers): string => branchEntry(effectiveTeeth(a));

/** Next question rule per question; `null` = end of the flow (→ result). */
const NEXT: Record<string, (a: Answers) => string | null> = {
  teeth: (a) => (str(a, "teeth") === "unknown" ? "triage" : branchEntry(str(a, "teeth"))),

  single_state: (a) => {
    const s = str(a, "single_state");
    if (s === "implant_placed") return "implant_system_known";
    if (s === "old_problem") return "old_problem_kind";
    return QUALIFICATION;
  },
  implant_system_known: () => QUALIFICATION,
  old_problem_kind: () => QUALIFICATION,

  adjacent_count_2_3: () => "adjacent_state",
  adjacent_count_4_6: () => "adjacent_state",
  adjacent_state: () => QUALIFICATION,

  separate_count: () => "separate_state",
  separate_state: (a) =>
    str(a, "separate_state") === "some_implants_placed" && str(a, "separate_count") !== "more_than_six"
      ? "existing_implants_count"
      : QUALIFICATION,
  existing_implants_count: () => "implant_system_known",

  arch_situation: () => "arch_plan_offered",
  arch_plan_offered: () => QUALIFICATION,

  both_situation: () => "both_plan_exists",
  both_plan_exists: (a) => (str(a, "both_plan_exists") === "yes" ? "upper_plan" : QUALIFICATION),
  upper_plan: () => "lower_plan",
  lower_plan: () => QUALIFICATION,

  triage: (a) => {
    switch (str(a, "triage")) {
      case "missing_teeth":
        return "triage_missing";
      case "destroyed_mobile":
        return "triage_destroyed";
      case "doctor_mentioned":
        return "triage_doctor";
      case "denture_fixed":
        return "triage_denture";
      case "old_implants":
        return afterTriageSub(a);
      default:
        return QUALIFICATION; // hard_to_say → no basket
    }
  },
  triage_missing: afterTriageSub,
  triage_destroyed: afterTriageSub,
  triage_doctor: afterTriageSub, // "Не пам’ятаю" → no resolved_teeth → Q00
  triage_denture: afterTriageSub,

  qualification: () => null,
};

interface Walk {
  /** Every question on the path that already has an answer (asked or implied). */
  path: string[];
  /** The next unanswered question; `null` = flow complete. */
  next: string | null;
}

function walk(answers: Answers): Walk {
  const path: string[] = [];
  let cur: string | null = ROOT;
  for (let i = 0; i < MAX_STEPS && cur; i++) {
    if (answers[cur] === undefined) return { path, next: cur };
    path.push(cur);
    cur = NEXT[cur](answers);
  }
  return { path, next: null };
}

/**
 * Drop answers that are no longer justified: a key survives when its question
 * is on the derived path, or when it is implied (`sets`) by the chosen option
 * of a question that is on the path (implied answers may sit beyond the next
 * unanswered question, e.g. `separate_state` implied by triage_destroyed).
 */
function prune(answers: Answers): Answers {
  const { path } = walk(answers);
  const keep = new Set(path);
  for (const id of path) {
    const value = answers[id];
    if (typeof value !== "string") continue;
    const sets = QUESTIONS[id]?.options.find((o) => o.id === value)?.sets;
    if (sets) for (const key of Object.keys(sets)) keep.add(key);
  }
  const out: Answers = {};
  for (const [key, value] of Object.entries(answers)) if (keep.has(key)) out[key] = value;
  return out;
}

// ───────────────────────── flow state ─────────────────────────

export interface FlowState {
  answers: Answers;
  /** question ids the user actually answered, in order */
  asked: string[];
}

export function startFlow(): FlowState {
  return { answers: {}, asked: [] };
}

function normalizeValue(question: Question, value: string | string[]): string | string[] {
  const valid = new Set(question.options.map((o) => o.id));
  if (question.type === "single") {
    if (typeof value !== "string" || !valid.has(value)) {
      throw new Error(`Invalid answer "${String(value)}" for question "${question.id}"`);
    }
    return value;
  }
  const list = Array.from(new Set(typeof value === "string" ? [value] : value));
  for (const v of list) {
    if (!valid.has(v)) throw new Error(`Invalid answer "${v}" for question "${question.id}"`);
  }
  const exclusive = question.options.find((o) => o.exclusive && list.includes(o.id));
  return exclusive && list.length > 1 ? [exclusive.id] : list;
}

/** Merge one answer (+ its option `sets`) into answers, then prune. */
function applyAnswer(answers: Answers, question: Question, value: string | string[]): Answers {
  const merged: Answers = { ...answers, [question.id]: value };
  if (question.type === "single" && typeof value === "string") {
    const option = question.options.find((o) => o.id === value);
    if (option?.sets) Object.assign(merged, option.sets);
  }
  return prune(merged);
}

/** Rebuild answers from the asked log (drops every implied answer not re-implied). */
function replay(asked: string[], source: Answers): FlowState {
  let answers: Answers = {};
  const kept: string[] = [];
  for (const id of asked) {
    const value = source[id];
    if (value === undefined) continue;
    answers = applyAnswer(answers, QUESTIONS[id], value);
    kept.push(id);
  }
  return { answers, asked: kept };
}

export function currentStep(state: FlowState): FlowStep {
  const { next } = walk(state.answers);
  return next ? { type: "question", questionId: next } : { type: "result" };
}

export function answerQuestion(
  state: FlowState,
  questionId: string,
  value: string | string[],
): FlowState {
  const question = QUESTIONS[questionId];
  if (!question) throw new Error(`Unknown question "${questionId}"`);
  const normalized = normalizeValue(question, value);

  let base = state;
  const idx = state.asked.indexOf(questionId);
  if (idx >= 0) {
    // Re-answering an earlier question: rewind to just before it.
    base = replay(state.asked.slice(0, idx), state.answers);
  } else {
    const { next } = walk(state.answers);
    if (next !== questionId) {
      throw new Error(`Question "${questionId}" is not the current step (current: ${String(next)})`);
    }
  }
  const answers = applyAnswer(base.answers, question, normalized);
  return { answers, asked: [...base.asked, questionId] };
}

export function canGoBack(state: FlowState): boolean {
  return state.asked.length > 0;
}

export function goBack(state: FlowState): FlowState {
  if (!canGoBack(state)) return state;
  return replay(state.asked.slice(0, -1), state.answers);
}

/** Question ids on the current path that the user sees: asked ones + the next one. */
export function flowPath(state: FlowState): string[] {
  const { path, next } = walk(state.answers);
  const asked = new Set(state.asked);
  const visible = path.filter((id) => asked.has(id));
  return next ? [...visible, next] : visible;
}

/**
 * Worst-case number of questions still to be shown (counting the next one,
 * up to and including Q00), over every way the user could answer. Because it
 * is an upper bound, `asked / (asked + remaining)` can only go up as the user
 * answers; shorter paths make it jump forward, never backward.
 */
function maxRemaining(answers: Answers, memo: Map<string, number>): number {
  const { next } = walk(answers);
  if (!next) return 0;
  if (next === QUALIFICATION) return 1;
  const key = JSON.stringify(Object.entries(answers).sort(([a], [b]) => (a < b ? -1 : 1)));
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const question = QUESTIONS[next];
  let best = 0;
  for (const option of question.options) {
    best = Math.max(best, maxRemaining(applyAnswer(answers, question, option.id), memo));
  }
  memo.set(key, 1 + best);
  return 1 + best;
}

export function progressEstimate(state: FlowState): number {
  const { next } = walk(state.answers);
  if (!next) return 1;
  const done = state.asked.length;
  const remaining = maxRemaining(state.answers, new Map());
  return done / (done + remaining);
}

export function qualificationFromAnswers(answers: Answers): Qualification {
  const raw = answers.qualification;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return {
    hasCt: list.includes("has_ct"),
    hasPlan: list.includes("has_plan"),
    hasQuote: list.includes("has_quote"),
  };
}
