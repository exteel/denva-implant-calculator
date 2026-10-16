/**
 * Типи заявки v3 (ТЗ 3.3 §6.3, §8.1) — дзеркало `LeadPayload` із src/lib/contracts.ts
 * (сумісність у обидва боки перевіряє supabase/tests/functions.test.ts). Імпорту з src/ немає
 * навмисно: функція деплоїться з каталогу supabase/functions без решти репозиторію.
 */

export type PatientTier = "minimum" | "classic" | "premium";
export type LeadIntent = "dental_tender" | "refine";
export type Jaw = "upper" | "lower";
export type ToothLocation = "adjacent" | "separate" | "unknown";
export type ToothStatus = "removed" | "partly_present" | "extraction_recommended" | "implants_installed" | "unknown";
export type JawScenarioChoice = "bridges" | "aox4" | "aox6" | "aox8";
export type JawScenarioKind =
  | "single"
  | "adjacent"
  | "separate"
  | "adjacent_or_separate"
  | "installed"
  | "bridges"
  | "aox4"
  | "aox6"
  | "aox8"
  | "reference_single";
export type Tier = "common" | "minimum" | "classic" | "premium";

export interface JawInput {
  jaw: Jaw;
  tooth_count: number;
  location: ToothLocation | null;
  status: ToothStatus;
  installed_implant_count: number | "unknown" | null;
  scenario: JawScenarioChoice | null;
  implant_tier: PatientTier;
  crown_or_arch_tier: PatientTier;
  include_temporary: boolean;
}

export interface MoneyRange {
  low: number;
  high: number;
}

export interface CalcComponent {
  service_code: string;
  tier: Tier;
  quantity: { low: number; high: number };
  unit_value: number;
  total: MoneyRange;
  stage: "first" | "permanent" | "temporary" | null;
}

export interface ScenarioSummary {
  scenario: JawScenarioKind;
  implant_count: { low: number; high: number };
  prosthetic_units: number;
  first_stage: MoneyRange | null;
  permanent_stage: MoneyRange | null;
  total: MoneyRange;
}

export interface JawCalculation extends ScenarioSummary {
  jaw: Jaw;
  tooth_count: number;
  components: CalcComponent[];
  alternatives: ScenarioSummary[];
  missing_codes: string[];
}

export interface LeadPayload {
  intent: LeadIntent;
  phone: string;
  location: { kind: "city" | "region"; id: string; name: string };
  answers: Record<string, string | number>;
  scenario_label: string;
  upperJawInput: JawInput | null;
  lowerJawInput: JawInput | null;
  upperJawCalculation: JawCalculation | null;
  lowerJawCalculation: JawCalculation | null;
  overallTotal: MoneyRange | null;
  price_source: string;
  page_url: string;
  utm: Record<string, string>;
  created_at: string;
}
