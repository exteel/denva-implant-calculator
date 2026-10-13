import type {
  LeadPayload,
  LocationKind,
  LocationPricesResponse,
  PublicLocation,
  PublicPrice,
  SubmitLeadResponse,
} from "@/lib/contracts";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { DataUnavailableError, type CalculatorDataSource } from "./types";

/**
 * `get_location_prices` builds its JSON with jsonb_build_object, so numerics
 * arrive as JSON numbers — but a numeric that ever slips through as a string
 * ("8000.00") would make the engine concatenate instead of add. Coerce the
 * few numeric fields defensively.
 */
const toNumber = (value: unknown): number => (typeof value === "number" ? value : Number(value));
const toNullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : toNumber(value));

export function normalizePricesResponse(raw: LocationPricesResponse): LocationPricesResponse {
  return {
    ...raw,
    eur_rate: raw.eur_rate ? { rate: toNumber(raw.eur_rate.rate), date: String(raw.eur_rate.date) } : null,
    services: (raw.services ?? []).map((s) => ({ ...s, sort: toNumber(s.sort) })),
    prices: (raw.prices ?? []).map(
      (p): PublicPrice => ({ ...p, value: toNumber(p.value), clinic_count: toNullableNumber(p.clinic_count) }),
    ),
  };
}

/** Production data source: public RPCs + the submit-lead Edge Function. */
export function createSupabaseDataSource(): CalculatorDataSource {
  if (!isSupabaseConfigured) throw new DataUnavailableError();
  const supabase = getSupabase();

  return {
    async listLocations() {
      const { data, error } = await supabase.rpc("list_locations");
      if (error) throw new Error(error.message);
      return (data ?? []) as PublicLocation[];
    },

    async getLocationPrices(kind: LocationKind, id: string) {
      const { data, error } = await supabase.rpc("get_location_prices", { p_kind: kind, p_id: id });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Empty price response");
      return normalizePricesResponse(data as LocationPricesResponse);
    },

    async submitLead(body: { lead: LeadPayload } | { retry_lead_id: string }) {
      const { data, error } = await supabase.functions.invoke<SubmitLeadResponse>("submit-lead", { body });
      if (error) throw new Error(error.message);
      // A non-JSON / empty 2xx must not be mistaken for a stored lead.
      if (!data || typeof data.lead_id !== "string") throw new Error("Unexpected submit-lead response");
      return data;
    },
  };
}
