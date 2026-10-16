/**
 * Pure state logic of the calculator UI: answers → engine inputs → quote.
 * No React here, so it is unit-tested directly.
 */
import type {
  CalculateResponse,
  Jaw,
  JawCalculation,
  JawInput,
  JawScenarioChoice,
  PatientTier,
  ToothLocation,
  ToothStatus,
} from "@/lib/contracts";
import {
  EMPTY_JAW_ANSWERS,
  allQuestions,
  buildJawInput,
  calculateJaw,
  calculateJawFromRange,
  calculateQuote,
  mapUnknownScope,
  normalizeJawAnswers,
  sourceSentence,
  unknownJawInput,
  type JawAnswers,
  type PriceBook,
  type Question,
  type UnknownScope,
} from "@/engine/v3";
import { teethText } from "@/engine/v3/format";

export const JAWS: readonly Jaw[] = ["upper", "lower"];
export const JAW_NAME: Record<Jaw, string> = { upper: "Верхня щелепа", lower: "Нижня щелепа" };

export const TIER_LABEL: Record<PatientTier, string> = {
  minimum: "Мінімальний",
  classic: "Класичний",
  premium: "Преміальний",
};

export const SCENARIO_LABEL: Record<JawScenarioChoice, string> = {
  bridges: "Мости",
  aox4: "All-on-4",
  aox6: "All-on-6",
  aox8: "All-on-8",
};

export interface JawTiers {
  implant: PatientTier;
  crown: PatientTier;
}

export interface CalcState {
  counts: Record<Jaw, number>;
  unknown: { active: boolean; choice: UnknownScope | null };
  answers: Record<Jaw, JawAnswers>;
  tiers: Record<Jaw, JawTiers>;
  scenario: Record<Jaw, JawScenarioChoice>;
  includeTemporary: boolean;
  currency: "UAH" | "EUR";
}

export const DEFAULT_TIERS: JawTiers = { implant: "classic", crown: "classic" };

export function initialState(): CalcState {
  return {
    counts: { upper: 0, lower: 0 },
    unknown: { active: false, choice: null },
    answers: { upper: { ...EMPTY_JAW_ANSWERS }, lower: { ...EMPTY_JAW_ANSWERS } },
    tiers: { upper: { ...DEFAULT_TIERS }, lower: { ...DEFAULT_TIERS } },
    scenario: { upper: "bridges", lower: "bridges" },
    includeTemporary: false,
    currency: "UAH",
  };
}

// ───────────────────────── editing ─────────────────────────

/** Changes a jaw's tooth count (0–14). Continuing with two zeros is blocked by the counts screen. */
export function setCount(state: CalcState, jaw: Jaw, count: number): CalcState {
  const next = Math.min(Math.max(Math.trunc(count), 0), 14);
  return {
    ...state,
    counts: { ...state.counts, [jaw]: next },
    answers: { ...state.answers, [jaw]: normalizeJawAnswers(next, state.answers[jaw]) },
  };
}

/** Same as setCount, but on the result page a treatment must remain: the last active jaw cannot go to 0. */
export function setCountKeepingOne(state: CalcState, jaw: Jaw, count: number): CalcState {
  const other: Jaw = jaw === "upper" ? "lower" : "upper";
  if (Math.trunc(count) <= 0 && state.counts[other] === 0) return state;
  return setCount(state, jaw, count);
}

export function setAnswer(state: CalcState, jaw: Jaw, patch: Partial<JawAnswers>): CalcState {
  const merged = { ...state.answers[jaw], ...patch };
  // Changing the status away from "installed" forgets the installed count.
  if (patch.status !== undefined && patch.status !== "implants_installed") merged.installed = null;
  return {
    ...state,
    answers: { ...state.answers, [jaw]: normalizeJawAnswers(state.counts[jaw], merged) },
  };
}

export function setTiers(state: CalcState, jaw: Jaw, patch: Partial<JawTiers>): CalcState {
  return { ...state, tiers: { ...state.tiers, [jaw]: { ...state.tiers[jaw], ...patch } } };
}

export function setScenario(state: CalcState, jaw: Jaw, scenario: JawScenarioChoice): CalcState {
  return { ...state, scenario: { ...state.scenario, [jaw]: scenario } };
}

export function setUnknownMode(state: CalcState, active: boolean): CalcState {
  return { ...state, unknown: { active, choice: active ? state.unknown.choice : null } };
}

export function setUnknownChoice(state: CalcState, choice: UnknownScope): CalcState {
  return { ...state, unknown: { active: true, choice } };
}

/**
 * Leaves «Не знаю точно» for explicit counts, taking over what the guess
 * assumed (so the patient can fine-tune it on the result page).
 */
export function leaveUnknownMode(state: CalcState): CalcState {
  if (!state.unknown.active) return state;
  const choice = state.unknown.choice;
  const base: CalcState = { ...state, unknown: { active: false, choice: null } };
  if (!choice) return base;
  const mapping = mapUnknownScope(choice);
  return {
    ...base,
    counts: { upper: mapping.tooth_count, lower: 0 },
    answers: {
      ...base.answers,
      upper: normalizeJawAnswers(mapping.tooth_count, {
        location: mapping.location,
        status: mapping.status,
        installed: null,
      }),
    },
  };
}

/** Both jaws at 0 is not a treatment (ТЗ §5.2) — except the «Не знаю точно» guess. */
export function canContinueFromCounts(state: CalcState): boolean {
  if (state.unknown.active) return state.unknown.choice !== null;
  return state.counts.upper + state.counts.lower > 0;
}

/** The sequential per-jaw questions of the current answers (empty in the guess mode). */
export function questionList(state: CalcState): Question[] {
  if (state.unknown.active) return [];
  return allQuestions(state.counts, state.answers);
}

// ───────────────────────── engine inputs ─────────────────────────

export interface QuoteInputs {
  upper: JawInput | null;
  lower: JawInput | null;
  rangeFromTeeth: { upper: number | null; lower: number | null };
}

export function deriveInputs(state: CalcState): QuoteInputs {
  const settings = (jaw: Jaw) => ({
    implant_tier: state.tiers[jaw].implant,
    crown_or_arch_tier: state.tiers[jaw].crown,
    scenario: state.scenario[jaw],
  });

  if (state.unknown.active && state.unknown.choice) {
    const mapping = mapUnknownScope(state.unknown.choice);
    const base = settings("upper");
    return {
      upper: unknownJawInput(mapping, { ...base, include_temporary: state.includeTemporary }),
      lower: null,
      rangeFromTeeth: { upper: mapping.rangeFromTeeth, lower: null },
    };
  }
  return {
    upper: buildJawInput("upper", state.counts.upper, state.answers.upper, settings("upper"), state.includeTemporary),
    lower: buildJawInput("lower", state.counts.lower, state.answers.lower, settings("lower"), state.includeTemporary),
    rangeFromTeeth: { upper: null, lower: null },
  };
}

export function quoteFor(state: CalcState, book: PriceBook): CalculateResponse {
  const { upper, lower, rangeFromTeeth } = deriveInputs(state);
  return calculateQuote(upper, lower, book, { rangeFromTeeth });
}

/** One jaw with both tiers overridden — for the compact «Мінімальний / Преміальний» rows. */
export function presetJaw(
  input: JawInput,
  tier: PatientTier,
  book: PriceBook,
  rangeFromTeeth: number | null,
): JawCalculation {
  const preset: JawInput = { ...input, implant_tier: tier, crown_or_arch_tier: tier };
  return rangeFromTeeth ? calculateJawFromRange(preset, rangeFromTeeth, book) : calculateJaw(preset, book);
}

/** Missing prices make a jaw total unavailable. */
export const jawAvailable = (calc: JawCalculation | null): boolean => calc !== null && calc.missing_codes.length === 0;

// ───────────────────────── readable texts ─────────────────────────

export const LOCATION_LABEL: Record<ToothLocation, string> = {
  adjacent: "Поруч",
  separate: "У різних місцях",
  unknown: "Не знаю",
};

export function statusLabel(status: ToothStatus, teeth: number): string {
  const one = teeth === 1;
  switch (status) {
    case "removed":
      return one ? "Зуб уже видалений" : "Зуби вже видалені";
    case "partly_present":
      return one ? "Залишилась частина зуба" : "Частина зубів залишилась";
    case "extraction_recommended":
      return "Лікар рекомендував видалення";
    case "implants_installed":
      return one ? "Імплант уже встановлений" : "Імпланти вже встановлені";
    case "unknown":
      return "Не знаю";
  }
}

export const STATUS_ORDER: readonly ToothStatus[] = [
  "removed",
  "partly_present",
  "extraction_recommended",
  "implants_installed",
  "unknown",
];

export const UNKNOWN_LABEL: Record<UnknownScope, string> = {
  separate: "Один або кілька окремих зубів",
  significant: "Значна частина зубів",
  all: "Можливо, всі зуби",
  none: "Зовсім не знаю",
};

export const QUESTION_TEXT: Record<Question["kind"], string> = {
  location: "Як розташовані ці зуби?",
  status: "Ці зуби вже видалені, частина залишилась, лікар рекомендував видалення, імпланти вже встановлені чи ви не знаєте?",
  installed: "Скільки імплантів уже встановлено?",
};

/** Readable one-liner of a jaw for headings and the Telegram scenario label. */
export function jawSummary(input: JawInput, calc: JawCalculation | null): string {
  const parts: string[] = [teethText(input.tooth_count)];
  if (input.location === "adjacent") parts.push("поруч");
  if (input.location === "separate") parts.push("у різних місцях");
  if (input.status === "implants_installed") parts.push("імпланти вже встановлені");
  if (calc) {
    if (calc.scenario === "bridges") parts.push("мости");
    if (calc.scenario === "aox4") parts.push("All-on-4");
    if (calc.scenario === "aox6") parts.push("All-on-6");
    if (calc.scenario === "aox8") parts.push("All-on-8");
    if (calc.scenario === "reference_single") parts.push("довідкова ціна одного зуба");
  }
  return parts.join(", ");
}

export function scenarioLabelFor(inputs: QuoteInputs, quote: CalculateResponse): string {
  const lines: string[] = [];
  if (inputs.upper) lines.push(`${JAW_NAME.upper}: ${jawSummary(inputs.upper, quote.upperJawCalculation)}`);
  if (inputs.lower) lines.push(`${JAW_NAME.lower}: ${jawSummary(inputs.lower, quote.lowerJawCalculation)}`);
  return lines.join("; ");
}

/** ТЗ §6.3: readable "question → answer" pairs for the Telegram team. */
export function readableAnswers(state: CalcState, inputs: QuoteInputs): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (state.unknown.active && state.unknown.choice) {
    out["Скільки зубів потрібно замінити імплантами?"] = "Не знаю точно";
    out["Яка ситуація?"] = UNKNOWN_LABEL[state.unknown.choice];
  }
  for (const jaw of JAWS) {
    const input = inputs[jaw];
    if (!input) continue;
    const name = JAW_NAME[jaw];
    if (!state.unknown.active) out[`${name}: скільки зубів потрібно замінити?`] = input.tooth_count;
    if (input.location && !(state.unknown.active && input.location === "unknown" && input.tooth_count === 1)) {
      out[`${name}: як розташовані зуби?`] = LOCATION_LABEL[input.location];
    }
    if (!state.unknown.active) out[`${name}: стан зубів`] = statusLabel(input.status, input.tooth_count);
    if (input.installed_implant_count !== null) {
      out[`${name}: скільки імплантів уже встановлено?`] =
        input.installed_implant_count === "unknown" ? "Не знаю" : input.installed_implant_count;
    }
    if (input.scenario && input.tooth_count >= 7) out[`${name}: вибраний сценарій`] = SCENARIO_LABEL[input.scenario];
    const arch = input.scenario !== null && input.scenario !== "bridges" && input.tooth_count >= 7;
    out[`${name}: рівень ${arch ? "імплантів" : "імпланта"}`] = TIER_LABEL[input.implant_tier];
    out[`${name}: рівень ${arch ? "постійної конструкції" : "коронки"}`] = TIER_LABEL[input.crown_or_arch_tier];
  }
  out["Врахувати тимчасове протезування"] = state.includeTemporary ? "Так" : "Ні";
  return out;
}

// ───────────────────────── lead ─────────────────────────

export interface LeadParts {
  inputs: QuoteInputs;
  quote: CalculateResponse;
  answers: Record<string, string | number>;
  scenario_label: string;
  price_source: string;
}

/** Everything a lead needs from the current calculator state (ТЗ §6.3). */
export function leadParts(state: CalcState, book: PriceBook): LeadParts {
  const inputs = deriveInputs(state);
  const quote = quoteFor(state, book);
  const anyJaw = quote.upperJawCalculation !== null || quote.lowerJawCalculation !== null;
  return {
    inputs,
    quote,
    answers: readableAnswers(state, inputs),
    scenario_label: scenarioLabelFor(inputs, quote),
    price_source: anyJaw && quote.overallTotal ? sourceSentence(quote.priceMeta) : "Даних поки недостатньо",
  };
}
