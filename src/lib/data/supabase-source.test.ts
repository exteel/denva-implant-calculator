import { describe, expect, it } from "vitest";
import type { LocationPricesResponse } from "@/lib/contracts";
import { normalizePricesResponse } from "./supabase-source";

describe("normalizePricesResponse", () => {
  it("coerces numeric strings from PostgREST into numbers", () => {
    const raw = {
      location: { kind: "city", id: "lviv", slug: "lviv", name: "Львів", region_id: "lvivska", region_name: "Львівська область", aliases: [] },
      currency: "UAH",
      eur_rate: { rate: "50.138500", date: "2026-10-09" },
      services: [{ service_code: "SCAN_JAW_STAGE", name: "Сканування", category: "Цифровий етап", role: "scan", unit: "за етап", tiered: false, tier_source: "common", additional: false, included_text: null, sort: "30" }],
      prices: [
        { service_code: "IMPLANT_INSTALL", tier: "classic", value: "18166.67", currency: "UAH", source_type: "hybrid", source_scope: "city", local_clinic_count: "2", baseline_scope: "city", blend_weights: { local: "0.6667", baseline: "0.3333" }, calculated_at: "2026-10-08T03:00:00Z", published_at: "2026-10-09T08:00:00Z", is_demo: true },
        { service_code: "SCAN_JAW_STAGE", tier: "common", value: 1200, currency: "UAH", source_type: "national_fallback", source_scope: "country", local_clinic_count: 0, published_at: "2026-10-09T08:00:00Z", is_demo: true },
      ],
    } as unknown as LocationPricesResponse;
    const out = normalizePricesResponse(raw);
    expect(out.eur_rate).toEqual({ rate: 50.1385, date: "2026-10-09" });
    expect(out.services[0].sort).toBe(30);
    expect(out.prices[0]).toMatchObject({ value: 18166.67, local_clinic_count: 2, blend_weights: { local: 0.6667, baseline: 0.3333 } });
    expect(out.prices[1]).toMatchObject({ value: 1200, local_clinic_count: 0, baseline_scope: null, blend_weights: null, calculated_at: null });
    expect(normalizePricesResponse({ ...raw, eur_rate: null }).eur_rate).toBeNull();
  });
});
