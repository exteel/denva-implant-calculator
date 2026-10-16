import type {
  LeadPayload,
  LocationKind,
  LocationPricesResponse,
  PublicLocation,
  SubmitLeadResponse,
} from "@/lib/contracts";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { normalizeEurRate, normalizePrice, normalizeService } from "./normalize";
import { DataUnavailableError, type CalculatorDataSource } from "./types";

export function normalizePricesResponse(raw: LocationPricesResponse): LocationPricesResponse {
  return {
    ...raw,
    eur_rate: normalizeEurRate(raw.eur_rate),
    services: (raw.services ?? []).map(normalizeService),
    prices: (raw.prices ?? []).map(normalizePrice),
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
