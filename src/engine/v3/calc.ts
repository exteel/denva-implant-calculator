/**
 * DENVA AI v3 formulas — ТЗ 3.3 §4, ARCHITECTURE_v3 §2.
 *
 * Pure and portable: no React/DOM/Node APIs, deterministic, and NO rounding
 * (display formatting lives in format.ts). The same code runs in the browser
 * and in the `calculate` Edge Function. A price that is not published is never
 * invented: the codes are reported in `missing_codes` and the jaw total is
 * then unavailable (see calculateJaw).
 */
import { SERVICE_CODES } from "../../lib/contracts";
import type {
  CalcComponent,
  CalculateResponse,
  JawCalculation,
  JawInput,
  JawScenarioChoice,
  JawScenarioKind,
  MoneyRange,
  PriceMeta,
  ScenarioSummary,
  ServiceCode,
  Tier,
} from "../../lib/contracts";
import type { PriceBook } from "./prices";
import { buildPriceMeta } from "./meta";

const C = SERVICE_CODES;

export const MAX_TEETH_PER_JAW = 14;

/** ТЗ §4.3: adjacent teeth → [implants, crown units]. */
export const ADJACENT_TABLE: Readonly<Record<number, readonly [implants: number, units: number]>> = {
  2: [2, 2],
  3: [2, 3],
  4: [2, 4],
  5: [3, 5],
  6: [3, 6],
};

/** Implants of the segmental "Мости" scenario (ТЗ §4.4). */
export const BRIDGE_IMPLANTS = 4;

export const ALL_ON_IMPLANTS = { aox4: 4, aox6: 6, aox8: 8 } as const;

export const SCENARIO_CHOICES: readonly JawScenarioChoice[] = ["bridges", "aox4", "aox6", "aox8"];

type Stage = CalcComponent["stage"];

interface PlanLine {
  code: ServiceCode;
  qty: number;
  stage: Stage;
}

/** One exact (non-range) treatment scheme of a jaw, before prices. */
interface Plan {
  scenario: JawScenarioKind;
  implants: number;
  units: number;
  lines: PlanLine[];
  /** All-on: first stage + permanent stage are reported separately. */
  arch: boolean;
}

interface Evaluated {
  scenario: JawScenarioKind;
  implants: { low: number; high: number };
  units: number;
  components: CalcComponent[];
  first: MoneyRange | null;
  permanent: MoneyRange | null;
  total: MoneyRange;
  missing: ServiceCode[];
}

const line = (code: ServiceCode, qty: number, stage: Stage = null): PlanLine => ({ code, qty, stage });

// ───────────────────────── plans ─────────────────────────

function implantSet(implants: number): PlanLine[] {
  return [
    line(C.IMPLANT_INSTALL, implants),
    line(C.HEALING_ABUTMENT, implants),
    line(C.SUPERSTRUCTURE_SET, implants),
  ];
}

/** ТЗ §4.2 / §4.3: n teeth, `implants` implants, `units` crowns, one scan. */
function implantCrownPlan(scenario: JawScenarioKind, implants: number, units: number): Plan {
  return {
    scenario,
    implants,
    units,
    arch: false,
    lines: [...implantSet(implants), line(C.SCAN_JAW_STAGE, 1), line(C.CROWN_IMPLANT, units)],
  };
}

/** ТЗ §4.3.1: implants already in the bone — no implant / healing lines. */
function installedPlan(teeth: number, installed: number): Plan {
  return {
    scenario: "installed",
    implants: installed,
    units: teeth,
    arch: false,
    lines: [line(C.SCAN_JAW_STAGE, 1), line(C.SUPERSTRUCTURE_SET, installed), line(C.CROWN_IMPLANT, teeth)],
  };
}

/** ТЗ §4.4: segmental bridges — 4 implants, tooth_count crown units. */
function bridgesPlan(teeth: number): Plan {
  return implantCrownPlan("bridges", BRIDGE_IMPLANTS, teeth);
}

/** ТЗ §4.5: All-on-N. */
function allOnPlan(scenario: "aox4" | "aox6" | "aox8"): Plan {
  const n = ALL_ON_IMPLANTS[scenario];
  return {
    scenario,
    implants: n,
    units: 1,
    arch: true,
    lines: [
      line(C.IMPLANT_INSTALL, n, "first"),
      line(C.MULTIUNIT, n, "first"),
      line(C.ARCH_TEMP, 1, "first"),
      line(C.SCAN_JAW_STAGE, 1, "first"),
      line(C.ARCH_FINAL, 1, "permanent"),
      line(C.REPEAT_SCAN_JAW, 1, "permanent"),
    ],
  };
}

/** ТЗ §4.4: temporary_addon = teeth×temp crown + repeat scan + implants×final abutment. */
function withTemporary(plan: Plan, teeth: number, include: boolean): Plan {
  // An All-on arch already includes its own temporary teeth (ARCH_TEMP).
  if (!include || plan.arch) return plan;
  return {
    ...plan,
    lines: [
      ...plan.lines,
      line(C.TEMP_CROWN_UNIT, teeth, "temporary"),
      line(C.REPEAT_SCAN_JAW, 1, "temporary"),
      line(C.ABUTMENT_FINAL, plan.implants, "temporary"),
    ],
  };
}

// ───────────────────────── evaluation ─────────────────────────

function tierFor(book: PriceBook, code: ServiceCode, input: JawInput): Tier {
  switch (book.tierSource(code)) {
    case "implant_tier":
      return input.implant_tier;
    case "crown_or_arch_tier":
      return input.crown_or_arch_tier;
    default:
      return "common";
  }
}

const exact = (value: number): MoneyRange => ({ low: value, high: value });

const addMoney = (a: MoneyRange, b: MoneyRange): MoneyRange => ({ low: a.low + b.low, high: a.high + b.high });

function sumMoney(items: MoneyRange[]): MoneyRange {
  return items.reduce(addMoney, exact(0));
}

function evaluate(plan: Plan, input: JawInput, book: PriceBook): Evaluated {
  const components: CalcComponent[] = [];
  const missing: ServiceCode[] = [];
  for (const planLine of plan.lines) {
    if (planLine.qty <= 0) continue;
    const tier = tierFor(book, planLine.code, input);
    const price = book.get(planLine.code, tier);
    if (!price) {
      if (!missing.includes(planLine.code)) missing.push(planLine.code);
      continue;
    }
    components.push({
      service_code: planLine.code,
      tier,
      quantity: { low: planLine.qty, high: planLine.qty },
      unit_value: price.value,
      total: exact(price.value * planLine.qty),
      stage: planLine.stage,
    });
  }

  if (missing.length > 0) {
    // No invented totals: the caller must look at `missing`.
    return {
      scenario: plan.scenario,
      implants: { low: plan.implants, high: plan.implants },
      units: plan.units,
      components,
      first: null,
      permanent: null,
      total: exact(0),
      missing,
    };
  }

  const stageSum = (stage: Stage) => sumMoney(components.filter((c) => c.stage === stage).map((c) => c.total));
  const total = sumMoney(components.map((c) => c.total));
  return {
    scenario: plan.scenario,
    implants: { low: plan.implants, high: plan.implants },
    units: plan.units,
    components,
    first: plan.arch ? stageSum("first") : null,
    permanent: plan.arch ? stageSum("permanent") : null,
    total,
    missing,
  };
}

/**
 * Merges the components of a low and a high scheme per (service, stage):
 * quantities and totals become ranges.
 */
function mergeComponents(low: CalcComponent[], high: CalcComponent[]): CalcComponent[] {
  const key = (c: CalcComponent) => `${c.service_code}|${c.stage ?? ""}`;
  const merged = new Map<string, CalcComponent>();
  for (const c of low) {
    merged.set(key(c), { ...c, quantity: { low: c.quantity.low, high: 0 }, total: { low: c.total.low, high: 0 } });
  }
  for (const c of high) {
    const existing = merged.get(key(c));
    if (existing) {
      existing.quantity.high = c.quantity.high;
      existing.total.high = c.total.high;
    } else {
      merged.set(key(c), { ...c, quantity: { low: 0, high: c.quantity.high }, total: { low: 0, high: c.total.high } });
    }
  }
  return [...merged.values()];
}

function unionCodes(a: ServiceCode[], b: ServiceCode[]): ServiceCode[] {
  const out = [...a];
  for (const code of b) if (!out.includes(code)) out.push(code);
  return out;
}

/**
 * Two exact schemes → one range (adjacent..separate, installed count
 * unknown). Every component is monotone in the scheme, so low/high of the
 * sum are the sums of low/high.
 */
function mergeRange(scenario: JawScenarioKind, lowEval: Evaluated, highEval: Evaluated): Evaluated {
  const missing = unionCodes(lowEval.missing, highEval.missing);
  return {
    scenario,
    implants: { low: lowEval.implants.low, high: highEval.implants.high },
    units: highEval.units,
    components: mergeComponents(lowEval.components, highEval.components),
    first: null,
    permanent: null,
    total: missing.length === 0 ? { low: lowEval.total.low, high: highEval.total.high } : exact(0),
    missing,
  };
}

function summary(e: Evaluated): ScenarioSummary {
  return {
    scenario: e.scenario,
    implant_count: e.implants,
    prosthetic_units: e.units,
    first_stage: e.first,
    permanent_stage: e.permanent,
    total: e.total,
  };
}

// ───────────────────────── calculateJaw ─────────────────────────

export function clampTeeth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_TEETH_PER_JAW);
}

/**
 * Implant counts a jaw of `teeth` teeth can have when the patient doesn't
 * know how many are installed: from the minimum scheme to one per tooth
 * (at most 8 for a big jaw — beyond All-on-8 nobody places more).
 */
export function installedBounds(teeth: number): { low: number; high: number } {
  if (teeth <= 1) return { low: 1, high: 1 };
  if (teeth <= 6) return { low: ADJACENT_TABLE[teeth][0], high: teeth };
  return { low: BRIDGE_IMPLANTS, high: Math.min(teeth, 8) };
}

function plansFor(input: JawInput, teeth: number, choice: JawScenarioChoice): { low: Plan; high: Plan; kind: JawScenarioKind } {
  const temp = input.include_temporary;
  const wrap = (plan: Plan) => withTemporary(plan, teeth, temp);

  if (input.status === "implants_installed") {
    const bounds = installedBounds(teeth);
    const count = input.installed_implant_count;
    if (typeof count === "number") {
      const c = Math.min(Math.max(Math.trunc(count), 1), teeth);
      const plan = wrap(installedPlan(teeth, c));
      return { low: plan, high: plan, kind: "installed" };
    }
    return { low: wrap(installedPlan(teeth, bounds.low)), high: wrap(installedPlan(teeth, bounds.high)), kind: "installed" };
  }

  if (teeth === 1) {
    const plan = wrap(implantCrownPlan("single", 1, 1));
    const reference = input.status === "unknown" && input.location === "unknown";
    const kind: JawScenarioKind = reference ? "reference_single" : "single";
    const typed = { ...plan, scenario: kind };
    return { low: typed, high: typed, kind };
  }

  if (teeth <= 6) {
    const [adjImplants, units] = ADJACENT_TABLE[teeth];
    const adjacent = wrap(implantCrownPlan("adjacent", adjImplants, units));
    const separate = wrap(implantCrownPlan("separate", teeth, teeth));
    if (input.location === "adjacent") return { low: adjacent, high: adjacent, kind: "adjacent" };
    if (input.location === "separate") return { low: separate, high: separate, kind: "separate" };
    return { low: adjacent, high: separate, kind: "adjacent_or_separate" };
  }

  const plan = planForChoice(choice, teeth, temp);
  return { low: plan, high: plan, kind: plan.scenario };
}

function planForChoice(choice: JawScenarioChoice, teeth: number, temp: boolean): Plan {
  return choice === "bridges" ? withTemporary(bridgesPlan(teeth), teeth, temp) : allOnPlan(choice);
}

function evalPlans(input: JawInput, plans: { low: Plan; high: Plan; kind: JawScenarioKind }, book: PriceBook): Evaluated {
  const low = evaluate(plans.low, input, book);
  if (plans.low === plans.high) return low;
  return mergeRange(plans.kind, low, evaluate(plans.high, input, book));
}

/**
 * ТЗ §4: one jaw. `tooth_count` 0 returns an empty zero calculation (the
 * quote builder never calls it for an inactive jaw).
 *
 * When any required price is not published the jaw `total` is {0,0} and
 * `missing_codes` is non-empty — callers must treat that as "даних поки
 * недостатньо". 7–14 teeth: `alternatives` lists the computable scenarios
 * of the comparison strip (a scenario with missing prices is absent).
 */
export function calculateJaw(input: JawInput, book: PriceBook): JawCalculation {
  const teeth = clampTeeth(input.tooth_count);
  if (teeth === 0) {
    return {
      jaw: input.jaw,
      tooth_count: 0,
      scenario: "single",
      implant_count: { low: 0, high: 0 },
      prosthetic_units: 0,
      first_stage: null,
      permanent_stage: null,
      total: exact(0),
      components: [],
      alternatives: [],
      missing_codes: [],
    };
  }

  const choice: JawScenarioChoice = input.scenario ?? "bridges";
  const plans = plansFor(input, teeth, choice);
  const selected = evalPlans(input, plans, book);

  let alternatives: ScenarioSummary[] = [];
  if (teeth >= 7 && input.status !== "implants_installed") {
    alternatives = SCENARIO_CHOICES.map((c) => evalPlans(input, { low: planForChoice(c, teeth, input.include_temporary), high: planForChoice(c, teeth, input.include_temporary), kind: c }, book))
      .filter((e) => e.missing.length === 0)
      .map(summary);
  }

  return {
    jaw: input.jaw,
    tooth_count: teeth,
    ...summary(selected),
    components: selected.components,
    alternatives,
    missing_codes: selected.missing,
  };
}

/**
 * «Не знаю точно» → "окремі зуби": a range from `lowTeeth` teeth to the
 * jaw as given (ARCHITECTURE_v3 §3). Merges two exact calculations.
 */
export function calculateJawFromRange(input: JawInput, lowTeeth: number, book: PriceBook): JawCalculation {
  const high = calculateJaw(input, book);
  const lowInput: JawInput = {
    ...input,
    tooth_count: lowTeeth,
    location: lowTeeth >= 2 && lowTeeth <= 6 ? "separate" : null,
  };
  const low = calculateJaw(lowInput, book);
  const missing = unionCodes(low.missing_codes, high.missing_codes);
  return {
    ...high,
    implant_count: { low: low.implant_count.low, high: high.implant_count.high },
    first_stage: null,
    permanent_stage: null,
    total: missing.length === 0 ? { low: low.total.low, high: high.total.high } : exact(0),
    components: mergeComponents(low.components, high.components),
    alternatives: [],
    missing_codes: missing,
  };
}

// ───────────────────────── calculateQuote ─────────────────────────

export interface QuoteOptions {
  /** "Не знаю точно → окремі зуби": per jaw, the low end of the teeth range. */
  rangeFromTeeth?: { upper?: number | null; lower?: number | null };
}

function isActive(input: JawInput | null): input is JawInput {
  return input !== null && clampTeeth(input.tooth_count) > 0;
}

/**
 * ТЗ §4.6, §8.1: two independent jaw calculations, `overallTotal` is their
 * plain sum (null as soon as one active jaw lacks prices or both are inactive).
 */
export function calculateQuote(
  upper: JawInput | null,
  lower: JawInput | null,
  book: PriceBook,
  options: QuoteOptions = {},
): CalculateResponse {
  const run = (input: JawInput | null, lowTeeth: number | null | undefined): JawCalculation | null => {
    if (!isActive(input)) return null;
    return lowTeeth ? calculateJawFromRange(input, lowTeeth, book) : calculateJaw(input, book);
  };
  const up = run(upper, options.rangeFromTeeth?.upper);
  const low = run(lower, options.rangeFromTeeth?.lower);

  const active = [up, low].filter((c): c is JawCalculation => c !== null);
  const available = active.length > 0 && active.every((c) => c.missing_codes.length === 0);
  const overallTotal = available ? sumMoney(active.map((c) => c.total)) : null;

  return {
    upperJawCalculation: up,
    lowerJawCalculation: low,
    overallTotal,
    priceMeta: buildPriceMeta(book, active),
  };
}

export type { PriceMeta };
