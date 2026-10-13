import { describe, expect, it } from "vitest";
import { fixtureDataSource } from "./fixture";
import { calculate, createPriceBook, presetTiers, DEFAULT_PARAMS } from "@/engine/v2";

describe("fixture data source", () => {
  it("serves cities and regions", async () => {
    const locations = await fixtureDataSource.listLocations();
    expect(locations.some((l) => l.kind === "city" && l.id === "kyiv")).toBe(true);
    expect(locations.some((l) => l.kind === "region" && l.id === "vinnytska")).toBe(true);
  });

  it("matches the canonical demo values", async () => {
    const lviv = await fixtureDataSource.getLocationPrices("city", "lviv");
    const get = (code: string, tier: string) => lviv.prices.find((p) => p.service_code === code && p.tier === tier)?.value;
    expect(get("HEALING_ABUTMENT", "common")).toBe(1800);
    expect(get("ARCH_TEMP", "common")).toBe(38000);
    expect(get("IMPLANT_INSTALL", "premium")).toBe(28000);
    expect(get("ARCH_FINAL", "minimum")).toBe(85000);
    expect(lviv.prices.every((p) => p.is_demo && p.source_type === "manual")).toBe(true);
    expect(lviv.eur_rate).toEqual({ rate: 50.1385, date: "2026-10-09" });
  });

  it("Kyiv ×1.15 with one aggregate line; Chernivtsi ×0.9; Vinnytsia regional; Uzhhorod empty", async () => {
    const kyiv = await fixtureDataSource.getLocationPrices("city", "kyiv");
    const implant = kyiv.prices.find((p) => p.service_code === "IMPLANT_INSTALL" && p.tier === "classic");
    expect(implant).toMatchObject({ value: 18500, source_type: "aggregate", clinic_count: 3 });
    expect(kyiv.prices.find((p) => p.service_code === "SCAN_BOTH")?.value).toBe(1700);

    const chernivtsi = await fixtureDataSource.getLocationPrices("city", "chernivtsi");
    expect(chernivtsi.prices.find((p) => p.service_code === "IMPLANT_INSTALL" && p.tier === "classic")?.value).toBe(16200);

    const vinnytsia = await fixtureDataSource.getLocationPrices("city", "vinnytsia");
    expect(vinnytsia.prices.every((p) => p.source_type === "regional_fallback")).toBe(true);
    expect((await fixtureDataSource.getLocationPrices("region", "vinnytska")).prices.length).toBeGreaterThan(0);

    expect((await fixtureDataSource.getLocationPrices("city", "uzhhorod")).prices).toEqual([]);
  });

  it("mirrors supabase/seed.sql: city/region multipliers, float rounding, Kyiv region", async () => {
    const value = async (kind: "city" | "region", id: string, code: string, tier: string) =>
      (await fixtureDataSource.getLocationPrices(kind, id)).prices.find((p) => p.service_code === code && p.tier === tier);
    // 7000 × 1.15 = 8049.999… and 85000 × 1.15 = 97749.999… in float8 / JS doubles
    expect((await value("city", "kyiv", "CROWN_IMPLANT", "minimum"))?.value).toBe(8000);
    expect((await value("city", "kyiv", "ARCH_FINAL", "minimum"))?.value).toBe(97700);
    expect(await value("city", "odesa", "IMPLANT_INSTALL", "classic")).toMatchObject({ value: 18400, source_type: "manual" });
    expect(await value("city", "kharkiv", "CROWN_IMPLANT", "classic")).toMatchObject({ value: 9500, source_type: "manual" });
    expect(await value("city", "zhytomyr", "IMPLANT_INSTALL", "classic")).toMatchObject({ value: 15800, source_type: "regional_fallback" });
    expect(await value("region", "odeska", "IMPLANT_INSTALL", "classic")).toMatchObject({ value: 18000, source_type: "regional_fallback" });
    expect((await value("region", "kyiv-city", "SCAN_BOTH", "common"))?.value).toBe(1700);
    const locations = await fixtureDataSource.listLocations();
    expect(locations.find((l) => l.kind === "city" && l.id === "kyiv")).toMatchObject({ region_id: "kyiv-city", region_name: "м. Київ" });
    expect(locations.filter((l) => l.kind === "region")).toHaveLength(25);
    expect(locations.filter((l) => l.kind === "city")).toHaveLength(33);
  });

  it("feeds the engine end to end", async () => {
    const book = createPriceBook(await fixtureDataSource.getLocationPrices("city", "lviv"));
    expect(calculate(book, DEFAULT_PARAMS, presetTiers("classic")).main?.low).toBe(36800);
  });

  it("lead hooks: 0000 → telegram failed then retry sent; 1111 → network error", async () => {
    const lead = (phone: string) => ({
      lead: {
        intent: "refine" as const,
        phone,
        location: { kind: "city" as const, id: "lviv", name: "Львів" },
        scenario: {},
        scenario_label: "",
        answers: {},
        implant_tier: "classic" as const,
        crown_or_arch_tier: "classic" as const,
        total_uah: 1,
        price_source: "",
        page_url: "",
        utm: {},
        created_at: "",
      },
    });
    const failed = await fixtureDataSource.submitLead(lead("+380 50 000 0000"));
    expect(failed.telegram).toBe("failed");
    expect(await fixtureDataSource.submitLead({ retry_lead_id: failed.lead_id })).toEqual({
      lead_id: failed.lead_id,
      telegram: "sent",
    });
    await expect(fixtureDataSource.submitLead(lead("+380 50 111 1111"))).rejects.toThrow();
    expect((await fixtureDataSource.submitLead(lead("+380 50 123 4567"))).telegram).toBe("sent");
  });
});
