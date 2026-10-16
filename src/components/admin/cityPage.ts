import type { AdminPriceMatrixRow, CityPageContent, Tier } from "@/lib/contracts";
import { PATIENT_TIER_LIST } from "./helpers";

/** Helpers for the SEO city-page editor (ТЗ §11.3). Pure. */

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateSlug(slug: string): string | null {
  if (!slug.trim()) return "Вкажіть slug.";
  if (!SLUG_PATTERN.test(slug)) return "Slug: малі латинські літери, цифри та «-», без пробілів і крапок на краях.";
  return null;
}

export function emptyContent(): CityPageContent {
  return { intro: null, faq: [], local_notes: null, reviewer_name: null, reviewer_url: null, reviewed_at: null };
}

/** Accepts whatever jsonb the DB returned (null, partial, wrong types) and returns a complete content object. */
export function normalizeContent(raw: unknown): CityPageContent {
  const base = emptyContent();
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const faq = Array.isArray(r.faq)
    ? r.faq
        .map((x) => (typeof x === "object" && x !== null ? { q: String((x as { q?: unknown }).q ?? ""), a: String((x as { a?: unknown }).a ?? "") } : null))
        .filter((x): x is { q: string; a: string } => x !== null)
    : [];
  return {
    intro: s(r.intro),
    faq,
    local_notes: s(r.local_notes),
    reviewer_name: s(r.reviewer_name),
    reviewer_url: s(r.reviewer_url),
    reviewed_at: s(r.reviewed_at)?.slice(0, 10) ?? null,
  };
}

/** Drops blank FAQ rows and empty strings before saving. */
export function cleanContent(content: CityPageContent): CityPageContent {
  const t = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    intro: t(content.intro),
    faq: content.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })).filter((f) => f.q && f.a),
    local_notes: t(content.local_notes),
    reviewer_name: t(content.reviewer_name),
    reviewer_url: t(content.reviewer_url),
    reviewed_at: t(content.reviewed_at),
  };
}

/** What is missing before a city page may become «published» (ТЗ §11.3: унікальний контент і рецензент). */
export function contentProblems(content: CityPageContent): string[] {
  const c = cleanContent(content);
  const problems: string[] = [];
  if (!c.intro) problems.push("немає вступу міста");
  if (c.faq.length === 0) problems.push("немає жодного повного локального питання FAQ (питання й відповідь)");
  if (!c.reviewer_name) problems.push("не вказано рецензента");
  if (!c.reviewed_at) problems.push("не вказано дату перевірки");
  if (content.faq.some((f) => (f.q.trim() === "") !== (f.a.trim() === ""))) problems.push("у FAQ є рядок без питання або без відповіді");
  return problems;
}

/** Key prices the calculator needs for one tooth and a full arch, per level. */
export const KEY_TIERED_CODES = ["IMPLANT_INSTALL", "HEALING_ABUTMENT", "SUPERSTRUCTURE_SET", "CROWN_IMPLANT", "MULTIUNIT", "ARCH_FINAL"] as const;
// REPEAT_SCAN_JAW: the All-on full_treatment (ТЗ §4.5) — the SEO price block shows it per level.
export const KEY_COMMON_CODES = ["SCAN_JAW_STAGE", "REPEAT_SCAN_JAW", "ARCH_TEMP"] as const;

export interface MissingPrice {
  service_code: string;
  tier: Tier;
}

/** Key service × level combinations with no published value in the city's price matrix. */
export function missingKeyPrices(matrix: readonly Pick<AdminPriceMatrixRow, "service_code" | "tier" | "published_value">[]): MissingPrice[] {
  const has = new Set(matrix.filter((r) => r.published_value !== null && r.published_value !== undefined).map((r) => `${r.service_code}|${r.tier}`));
  const missing: MissingPrice[] = [];
  for (const code of KEY_TIERED_CODES) {
    for (const tier of PATIENT_TIER_LIST) if (!has.has(`${code}|${tier}`)) missing.push({ service_code: code, tier });
  }
  for (const code of KEY_COMMON_CODES) if (!has.has(`${code}|common`)) missing.push({ service_code: code, tier: "common" });
  return missing;
}
