import type { ServiceTarget } from "@/engine/types";

/**
 * Lead submission for the routing CTAs. The services (CheckMyPlan, CT
 * analysis, consultation, Dental Tender) don't have their own pages yet, so
 * every CTA opens a short request form. When `NEXT_PUBLIC_LEAD_ENDPOINT` is
 * set the payload is POSTed there as JSON; otherwise it is kept locally
 * (stub) so the whole funnel can be exercised end to end.
 */

export type ContactChannel = "call" | "viber" | "telegram";

export interface LeadPayload {
  service: ServiceTarget;
  ctaLabel: string;
  contact: {
    name: string;
    phone: string;
    channel: ContactChannel;
    comment: string;
  };
  consent: true;
  location: { id: string; label: string };
  answers: Record<string, string | string[]>;
  calculation: {
    title: string;
    kind: "priced" | "no_basket";
    scenarioId?: string;
    scenarioLabel?: string;
    package?: { implant: string; prosthetic: string };
    totalUah?: { p25: number; median: number; p75: number };
    clinicalConfidence: string;
    marketConfidence?: string;
  };
  comparison?: {
    offerUah: number;
    comparable: boolean;
    deviationPct?: number;
    position?: string;
  };
  utm: Record<string, string>;
  createdAt: string;
}

export interface LeadResult {
  id: string;
}

const STORAGE_KEY = "denva_leads";

export async function submitLead(payload: LeadPayload): Promise<LeadResult> {
  const endpoint = process.env.NEXT_PUBLIC_LEAD_ENDPOINT;
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Lead endpoint responded ${response.status}`);
    const body = (await response.json().catch(() => ({}))) as Partial<LeadResult>;
    return { id: body.id ?? payload.createdAt };
  }

  await new Promise((resolve) => setTimeout(resolve, 600));
  const id = `stub-${Date.now().toString(36)}`;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown[];
    stored.push({ id, ...payload });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored.slice(-20)));
  } catch {
    // Storage can be unavailable (private mode) — the stub still succeeds.
  }
  console.info("[lead:stub]", id, payload);
  return { id };
}

/** UTM tags from the landing URL, kept for attribution (ТЗ §19 funnel). */
export function readUtm(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const utm: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key.startsWith("utm_") || key === "gclid" || key === "fbclid") utm[key] = value;
  });
  return utm;
}

/** ≥10 digits — Ukrainian mobile numbers with or without +38. */
export function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, "").length >= 10;
}
