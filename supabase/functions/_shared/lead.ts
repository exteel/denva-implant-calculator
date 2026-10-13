/** Валідація тіла заявки (ТЗ §6.3). Чистий TypeScript. */
import type { LeadPayload, PatientTier } from "./telegram.ts";

export type ValidationResult =
  | { ok: true; lead: LeadPayload }
  | { ok: false; errors: string[] };

const TIERS: readonly string[] = ["minimum", "classic", "premium"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function validateLead(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["lead має бути об'єктом"] };

  const intent = input.intent;
  if (intent !== "refine" && intent !== "send_calculation") errors.push("intent: refine | send_calculation");

  const phone = str(input.phone, 40);
  const digits = phoneDigits(phone);
  if (digits.length < 10 || digits.length > 15) errors.push("phone: потрібно щонайменше 10 цифр");

  const loc = isObj(input.location) ? input.location : {};
  const locKind = loc.kind === "city" || loc.kind === "region" ? loc.kind : null;
  const locId = str(loc.id, 100);
  const locName = str(loc.name, 200);
  if (!locKind || !locId || !locName) errors.push("location: потрібні kind (city|region), id, name");

  if (!isObj(input.scenario)) errors.push("scenario: об'єкт");
  const scenarioLabel = str(input.scenario_label, 300);
  if (!scenarioLabel) errors.push("scenario_label: обов'язкове");

  for (const f of ["implant_tier", "crown_or_arch_tier"] as const) {
    if (typeof input[f] !== "string" || !TIERS.includes(input[f] as string)) errors.push(`${f}: minimum | classic | premium`);
  }

  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  if (input.total_uah != null && num(input.total_uah) === null) errors.push("total_uah: число ≥ 0 або null");
  if (input.full_treatment_uah != null && num(input.full_treatment_uah) === null) errors.push("full_treatment_uah: число ≥ 0 або null");

  const priceSource = str(input.price_source, 300);
  if (!priceSource) errors.push("price_source: обов'язкове");

  if (errors.length > 0) return { ok: false, errors };

  const answers: Record<string, string | number> = {};
  if (isObj(input.answers)) {
    for (const [k, v] of Object.entries(input.answers).slice(0, 30)) {
      if (typeof v === "string") answers[k.slice(0, 80)] = v.slice(0, 300);
      else if (typeof v === "number" && Number.isFinite(v)) answers[k.slice(0, 80)] = v;
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
    scenario: input.scenario as Record<string, unknown>,
    scenario_label: scenarioLabel,
    answers,
    implant_tier: input.implant_tier as PatientTier,
    crown_or_arch_tier: input.crown_or_arch_tier as PatientTier,
    total_uah: num(input.total_uah),
    full_treatment_uah: input.full_treatment_uah == null ? null : num(input.full_treatment_uah),
    price_source: priceSource,
    page_url: str(input.page_url, 2000),
    utm,
    created_at: str(input.created_at, 40) || new Date().toISOString(),
  };
  return { ok: true, lead };
}
