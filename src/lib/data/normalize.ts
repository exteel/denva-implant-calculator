import type { PublicPrice, PublicService } from "@/lib/contracts";

/**
 * The public RPCs build their JSON with jsonb_build_object, so numerics
 * arrive as JSON numbers — but a numeric that ever slips through as a string
 * ("8000.00") would make the engine concatenate instead of add. Shared by the
 * calculator data source and the SEO build loader.
 */
export const toNumber = (value: unknown): number => (typeof value === "number" ? value : Number(value));

function normalizeWeights(weights: PublicPrice["blend_weights"] | undefined): PublicPrice["blend_weights"] {
  if (!weights) return null;
  return { local: toNumber(weights.local), baseline: toNumber(weights.baseline) };
}

export function normalizePrice(p: PublicPrice): PublicPrice {
  return {
    ...p,
    value: toNumber(p.value),
    local_clinic_count: p.local_clinic_count === null || p.local_clinic_count === undefined ? 0 : toNumber(p.local_clinic_count),
    baseline_scope: p.baseline_scope ?? null,
    blend_weights: normalizeWeights(p.blend_weights),
    calculated_at: p.calculated_at ?? null,
  };
}

export function normalizeService(s: PublicService): PublicService {
  return { ...s, sort: toNumber(s.sort) };
}

export function normalizeEurRate(rate: { rate: unknown; date: unknown } | null | undefined): { rate: number; date: string } | null {
  return rate ? { rate: toNumber(rate.rate), date: String(rate.date) } : null;
}
