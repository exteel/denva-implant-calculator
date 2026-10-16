import type { LeadIntent, LeadPayload, LocationKind } from "@/lib/contracts";
import type { LeadParts } from "@/components/calculator/model";

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
  parts: LeadParts;
  pageUrl: string;
  search: string;
  now?: Date;
}

/**
 * ТЗ §6.3 / ARCHITECTURE_v3 §3: what the central Telegram team receives —
 * both JawInput / JawCalculation, overallTotal, readable answers, source
 * sentence, URL and UTM. The phone is the only personal field.
 */
export function buildLeadPayload(ctx: LeadContext): LeadPayload {
  const { parts } = ctx;
  return {
    intent: ctx.intent,
    phone: ctx.phone.trim(),
    location: ctx.location,
    answers: parts.answers,
    scenario_label: parts.scenario_label,
    upperJawInput: parts.inputs.upper,
    lowerJawInput: parts.inputs.lower,
    upperJawCalculation: parts.quote.upperJawCalculation,
    lowerJawCalculation: parts.quote.lowerJawCalculation,
    overallTotal: parts.quote.overallTotal,
    price_source: parts.price_source,
    page_url: ctx.pageUrl,
    utm: readUtm(ctx.search),
    created_at: (ctx.now ?? new Date()).toISOString(),
  };
}
