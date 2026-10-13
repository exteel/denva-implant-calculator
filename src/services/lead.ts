import type { LeadIntent, LeadPayload, LocationKind, PatientTier } from "@/lib/contracts";
import type { Answers, Calculation, Params } from "@/engine/v2";
import { scenarioLabel } from "@/engine/v2";

/** UTM / click-id tags of the landing URL, kept for attribution (ТЗ §6.3). */
export function readUtm(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const utm: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key.startsWith("utm_") || key === "gclid" || key === "fbclid") utm[key] = value;
  });
  return utm;
}

/** Ukrainian numbers with or without +38 / 38: 10–12 digits. */
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "").length;
  return digits >= 10 && digits <= 12;
}

/** Keeps only what a phone field may hold while typing. */
export function sanitizePhoneInput(raw: string): string {
  return raw.replace(/[^\d+\s()-]/g, "").slice(0, 19);
}

export interface LeadContext {
  intent: LeadIntent;
  phone: string;
  location: { kind: LocationKind; id: string; name: string };
  answers: Answers;
  params: Params;
  calculation: Calculation;
  implantTier: PatientTier;
  crownTier: PatientTier;
  pageUrl: string;
  search: string;
  now?: Date;
}

/** ТЗ §6.3: what the central Telegram team (and later Planfix) receives. */
export function buildLeadPayload(ctx: LeadContext): LeadPayload {
  const { params, calculation, answers } = ctx;
  const answerMap: Record<string, string | number> = {};
  if (answers.scope) answerMap.scope = answers.scope;
  if (answers.scope === "individual" && answers.count !== undefined) answerMap.teeth_count = answers.count;
  if (answers.followUp) answerMap[answers.followUp.id] = answers.followUp.value;

  const scenario: Record<string, unknown> = {
    kind: calculation.kind,
    scope: params.scope,
    teeth: params.teeth,
    tooth_state: params.toothState,
    arrangement: params.arrangement,
    jaws: params.scope === "both_jaws" ? 2 : params.scope === "one_jaw" ? 1 : params.jaws,
    all_on: params.allOn,
    teeth_present: params.teethPresent,
  };
  if (calculation.main && calculation.main.low !== calculation.main.high) {
    scenario.total_range_uah = [calculation.main.low, calculation.main.high];
  }

  return {
    intent: ctx.intent,
    phone: ctx.phone.trim(),
    location: ctx.location,
    scenario,
    scenario_label: scenarioLabel(params),
    answers: answerMap,
    implant_tier: ctx.implantTier,
    crown_or_arch_tier: ctx.crownTier,
    total_uah: calculation.main?.low ?? null,
    full_treatment_uah: calculation.full?.low ?? null,
    price_source: calculation.source?.label ?? "даних поки недостатньо",
    page_url: ctx.pageUrl,
    utm: readUtm(ctx.search),
    created_at: (ctx.now ?? new Date()).toISOString(),
  };
}
