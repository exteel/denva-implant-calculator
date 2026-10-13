import { describe, expect, it } from "vitest";
import type { LocationPricesResponse } from "@/lib/contracts";
import { normalizePricesResponse } from "./supabase-source";

describe("normalizePricesResponse", () => {
  it("coerces numeric strings from PostgREST into numbers", () => {
    const raw = {
      location: { kind: "city", id: "lviv", name: "Львів", region_id: "lvivska", region_name: "Львівська область", aliases: [] },
      currency: "UAH",
      eur_rate: { rate: "50.138500", date: "2026-10-09" },
      services: [{ service_code: "SCAN_BOTH", name: "Сканування", role: "scan", unit: "за етап", tiered: false, included_text: null, sort: "30" }],
      prices: [
        { service_code: "SCAN_BOTH", tier: "common", value: "1500.00", currency: "UAH", source_type: "aggregate", clinic_count: "3", calculated_at: "2026-10-08T03:00:00Z", published_at: "2026-10-09T08:00:00Z", is_demo: true },
        { service_code: "SCAN_BOTH", tier: "common", value: 1500, currency: "UAH", source_type: "manual", clinic_count: null, calculated_at: null, published_at: "2026-10-09T08:00:00Z", is_demo: true },
      ],
    } as unknown as LocationPricesResponse;
    const out = normalizePricesResponse(raw);
    expect(out.eur_rate).toEqual({ rate: 50.1385, date: "2026-10-09" });
    expect(out.services[0].sort).toBe(30);
    expect(out.prices[0]).toMatchObject({ value: 1500, clinic_count: 3 });
    expect(out.prices[1]).toMatchObject({ value: 1500, clinic_count: null });
    expect(normalizePricesResponse({ ...raw, eur_rate: null }).eur_rate).toBeNull();
  });
});
