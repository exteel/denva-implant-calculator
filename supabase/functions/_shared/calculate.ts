/**
 * ТЗ §8.1 calculation API: city/region + two independent JawInputs →
 * upperJawCalculation, lowerJawCalculation, overallTotal, priceMeta.
 * Uses the generated copy of the browser engine, so results are identical.
 */
import { calculateQuote, createPriceBook } from "./engine/index.ts";
import type {
  CalculateRequest,
  CalculateResponse,
  JawInput,
  LocationPricesResponse,
} from "./engine/contracts.ts";

export class CalculateInputError extends Error {}

const TIERS = new Set(["minimum", "classic", "premium"]);
const LOCATIONS = new Set(["adjacent", "separate", "unknown"]);
const STATUSES = new Set(["removed", "partly_present", "extraction_recommended", "implants_installed", "unknown"]);
const SCENARIOS = new Set(["bridges", "aox4", "aox6", "aox8"]);

function checkJaw(value: unknown, jaw: "upper" | "lower"): JawInput | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") throw new CalculateInputError(`${jaw}JawInput must be an object or null`);
  const j = value as Record<string, unknown>;
  const teeth = j.tooth_count;
  if (typeof teeth !== "number" || !Number.isInteger(teeth) || teeth < 0 || teeth > 14) {
    throw new CalculateInputError(`${jaw}: tooth_count must be an integer 0–14`);
  }
  if (j.jaw !== jaw) throw new CalculateInputError(`${jaw}: jaw must be "${jaw}"`);
  if (!TIERS.has(String(j.implant_tier)) || !TIERS.has(String(j.crown_or_arch_tier))) {
    throw new CalculateInputError(`${jaw}: implant_tier / crown_or_arch_tier must be minimum|classic|premium`);
  }
  if (j.location !== null && j.location !== undefined && !LOCATIONS.has(String(j.location))) {
    throw new CalculateInputError(`${jaw}: invalid location`);
  }
  if (!STATUSES.has(String(j.status))) throw new CalculateInputError(`${jaw}: invalid status`);
  if (j.scenario !== null && j.scenario !== undefined && !SCENARIOS.has(String(j.scenario))) {
    throw new CalculateInputError(`${jaw}: invalid scenario`);
  }
  const installed = j.installed_implant_count;
  if (
    installed !== null &&
    installed !== undefined &&
    installed !== "unknown" &&
    !(typeof installed === "number" && Number.isInteger(installed) && installed >= 1 && installed <= teeth)
  ) {
    throw new CalculateInputError(`${jaw}: installed_implant_count must be 1…tooth_count, "unknown" or null`);
  }
  return {
    jaw,
    tooth_count: teeth,
    location: (j.location ?? null) as JawInput["location"],
    status: j.status as JawInput["status"],
    installed_implant_count: (installed ?? null) as JawInput["installed_implant_count"],
    scenario: (j.scenario ?? null) as JawInput["scenario"],
    implant_tier: j.implant_tier as JawInput["implant_tier"],
    crown_or_arch_tier: j.crown_or_arch_tier as JawInput["crown_or_arch_tier"],
    include_temporary: Boolean(j.include_temporary),
  };
}

export function parseCalculateRequest(body: unknown): CalculateRequest {
  if (!body || typeof body !== "object") throw new CalculateInputError("JSON body required");
  const b = body as Record<string, unknown>;
  const loc = b.location as Record<string, unknown> | undefined;
  if (!loc || (loc.kind !== "city" && loc.kind !== "region") || typeof loc.id !== "string" || !loc.id) {
    throw new CalculateInputError('location {kind: "city"|"region", id} required');
  }
  const upper = checkJaw(b.upperJawInput, "upper");
  const lower = checkJaw(b.lowerJawInput, "lower");
  if ((upper?.tooth_count ?? 0) === 0 && (lower?.tooth_count ?? 0) === 0) {
    throw new CalculateInputError("at least one jaw needs tooth_count > 0");
  }
  return { location: { kind: loc.kind, id: loc.id }, upperJawInput: upper, lowerJawInput: lower };
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

/** jsonb numerics may arrive as strings ("8000.00"): coerce like src/lib/data/normalize.ts does. */
export function normalizePrices(raw: LocationPricesResponse): LocationPricesResponse {
  return {
    ...raw,
    eur_rate: raw.eur_rate ? { rate: num(raw.eur_rate.rate), date: String(raw.eur_rate.date) } : null,
    services: (raw.services ?? []).map((s) => ({ ...s, sort: num(s.sort) })),
    prices: (raw.prices ?? []).map((p) => ({
      ...p,
      value: num(p.value),
      local_clinic_count: p.local_clinic_count == null ? 0 : num(p.local_clinic_count),
      baseline_scope: p.baseline_scope ?? null,
      blend_weights: p.blend_weights ? { local: num(p.blend_weights.local), baseline: num(p.blend_weights.baseline) } : null,
      calculated_at: p.calculated_at ?? null,
    })),
  };
}

export async function handleCalculate(
  body: unknown,
  fetchPrices: (kind: "city" | "region", id: string) => Promise<LocationPricesResponse | null>,
): Promise<CalculateResponse> {
  const req = parseCalculateRequest(body);
  const prices = await fetchPrices(req.location.kind, req.location.id);
  if (!prices) throw new CalculateInputError("unknown location");
  return calculateQuote(req.upperJawInput, req.lowerJawInput, createPriceBook(normalizePrices(prices)));
}
