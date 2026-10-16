/** Валідація тіла заявки v3 (ТЗ 3.3 §6.3, §8.1). Чистий TypeScript. */
import type {
  CalcComponent, Jaw, JawCalculation, JawInput, JawScenarioChoice, LeadPayload, MoneyRange, PatientTier,
  ScenarioSummary, ToothLocation, ToothStatus,
} from "./lead-types.ts";

export type ValidationResult =
  | { ok: true; lead: LeadPayload }
  | { ok: false; errors: string[] };

const TIERS: readonly string[] = ["minimum", "classic", "premium"];
const LOCATIONS: readonly string[] = ["adjacent", "separate", "unknown"];
const STATUSES: readonly string[] = ["removed", "partly_present", "extraction_recommended", "implants_installed", "unknown"];
const SCENARIO_CHOICES: readonly string[] = ["bridges", "aox4", "aox6", "aox8"];
const SCENARIO_KINDS: readonly string[] = [
  "single", "adjacent", "separate", "adjacent_or_separate", "installed", "bridges", "aox4", "aox6", "aox8", "reference_single",
];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function money(v: unknown): MoneyRange | null {
  if (!isObj(v) || !finite(v.low) || !finite(v.high) || v.low < 0 || v.high < v.low) return null;
  return { low: v.low, high: v.high };
}

function count(v: unknown): { low: number; high: number } | null {
  if (!isObj(v) || !finite(v.low) || !finite(v.high) || v.low < 0 || v.high < v.low) return null;
  return { low: v.low, high: v.high };
}

function jawInput(v: unknown, jaw: Jaw, errors: string[]): JawInput | null {
  if (v == null) return null;
  const name = `${jaw}JawInput`;
  if (!isObj(v)) {
    errors.push(`${name}: об'єкт або null`);
    return null;
  }
  if (v.jaw !== undefined && v.jaw !== jaw) errors.push(`${name}.jaw: очікується ${jaw}`);
  if (!Number.isInteger(v.tooth_count) || (v.tooth_count as number) < 0 || (v.tooth_count as number) > 14) {
    errors.push(`${name}.tooth_count: ціле 0–14`);
    return null;
  }
  const teeth = v.tooth_count as number;
  for (const f of ["implant_tier", "crown_or_arch_tier"] as const) {
    if (teeth > 0 && (typeof v[f] !== "string" || !TIERS.includes(v[f] as string))) {
      errors.push(`${name}.${f}: minimum | classic | premium`);
    }
  }
  const installed = v.installed_implant_count;
  return {
    jaw,
    tooth_count: teeth,
    location: typeof v.location === "string" && LOCATIONS.includes(v.location) ? (v.location as ToothLocation) : null,
    status: typeof v.status === "string" && STATUSES.includes(v.status) ? (v.status as ToothStatus) : "unknown",
    installed_implant_count:
      installed === "unknown" ? "unknown" : finite(installed) && installed >= 0 && installed <= 14 ? installed : null,
    scenario: typeof v.scenario === "string" && SCENARIO_CHOICES.includes(v.scenario) ? (v.scenario as JawScenarioChoice) : null,
    implant_tier: TIERS.includes(v.implant_tier as string) ? (v.implant_tier as PatientTier) : "classic",
    crown_or_arch_tier: TIERS.includes(v.crown_or_arch_tier as string) ? (v.crown_or_arch_tier as PatientTier) : "classic",
    include_temporary: v.include_temporary === true,
  };
}

function summary(v: unknown): ScenarioSummary | null {
  if (!isObj(v) || typeof v.scenario !== "string" || !SCENARIO_KINDS.includes(v.scenario)) return null;
  const total = money(v.total);
  const implants = count(v.implant_count);
  if (!total || !implants || !finite(v.prosthetic_units)) return null;
  const first = v.first_stage == null ? null : money(v.first_stage);
  const permanent = v.permanent_stage == null ? null : money(v.permanent_stage);
  if ((v.first_stage != null && !first) || (v.permanent_stage != null && !permanent)) return null;
  return {
    scenario: v.scenario as ScenarioSummary["scenario"],
    implant_count: implants,
    prosthetic_units: v.prosthetic_units,
    first_stage: first,
    permanent_stage: permanent,
    total,
  };
}

function jawCalculation(v: unknown, jaw: Jaw, errors: string[]): JawCalculation | null {
  if (v == null) return null;
  const name = `${jaw}JawCalculation`;
  const base = summary(v);
  if (!base || !isObj(v) || !finite(v.tooth_count)) {
    errors.push(`${name}: некоректний розрахунок щелепи`);
    return null;
  }
  const components = Array.isArray(v.components) ? (v.components.slice(0, 60) as CalcComponent[]) : [];
  const alternatives: ScenarioSummary[] = [];
  if (Array.isArray(v.alternatives)) {
    for (const a of v.alternatives.slice(0, 8)) {
      const s = summary(a);
      if (s) alternatives.push(s);
    }
  }
  const missing = Array.isArray(v.missing_codes)
    ? v.missing_codes.filter((c): c is string => typeof c === "string").slice(0, 40).map((c) => c.slice(0, 80))
    : [];
  return { ...base, jaw, tooth_count: v.tooth_count, components, alternatives, missing_codes: missing };
}

export function validateLead(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["lead має бути об'єктом"] };

  const intent = input.intent;
  if (intent !== "dental_tender" && intent !== "refine") errors.push("intent: dental_tender | refine");

  const phone = str(input.phone, 40);
  const digits = phoneDigits(phone);
  if (digits.length < 10 || digits.length > 15) errors.push("phone: потрібно щонайменше 10 цифр");

  const loc = isObj(input.location) ? input.location : {};
  const locKind = loc.kind === "city" || loc.kind === "region" ? loc.kind : null;
  const locId = str(loc.id, 100);
  const locName = str(loc.name, 200);
  if (!locKind || !locId || !locName) errors.push("location: потрібні kind (city|region), id, name");

  const upperIn = jawInput(input.upperJawInput, "upper", errors);
  const lowerIn = jawInput(input.lowerJawInput, "lower", errors);
  if (errors.length === 0 && !((upperIn?.tooth_count ?? 0) > 0 || (lowerIn?.tooth_count ?? 0) > 0)) {
    errors.push("потрібна хоча б одна активна щелепа (tooth_count > 0)");
  }
  const upperCalc = jawCalculation(input.upperJawCalculation, "upper", errors);
  const lowerCalc = jawCalculation(input.lowerJawCalculation, "lower", errors);
  const overall = input.overallTotal == null ? null : money(input.overallTotal);
  if (input.overallTotal != null && !overall) errors.push("overallTotal: {low, high} ≥ 0 або null");

  const priceSource = str(input.price_source, 300);
  if (!priceSource) errors.push("price_source: обов'язкове");

  if (errors.length > 0) return { ok: false, errors };

  const answers: Record<string, string | number> = {};
  if (isObj(input.answers)) {
    for (const [k, v] of Object.entries(input.answers).slice(0, 30)) {
      if (typeof v === "string") answers[k.slice(0, 80)] = v.slice(0, 300);
      else if (finite(v)) answers[k.slice(0, 80)] = v;
    }
  }
  const utm: Record<string, string> = {};
  if (isObj(input.utm)) {
    for (const [k, v] of Object.entries(input.utm).slice(0, 15)) {
      if (typeof v === "string") utm[k.slice(0, 40)] = v.slice(0, 200);
    }
  }

  const lead: LeadPayload = {
    intent: intent as LeadPayload["intent"],
    phone,
    location: { kind: locKind as "city" | "region", id: locId, name: locName },
    answers,
    scenario_label: str(input.scenario_label, 300),
    upperJawInput: upperIn,
    lowerJawInput: lowerIn,
    upperJawCalculation: upperCalc,
    lowerJawCalculation: lowerCalc,
    overallTotal: overall,
    price_source: priceSource,
    page_url: str(input.page_url, 2000),
    utm,
    created_at: str(input.created_at, 40) || new Date().toISOString(),
  };
  return { ok: true, lead };
}
