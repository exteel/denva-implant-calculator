import { describe, expect, it } from "vitest";
import { calculateQuote, createPriceBook } from "@/engine/v3";
import { SERVICE_CODES, type JawInput, type PublicPrice } from "@/lib/contracts";
import { FIXTURE_EMPTY_CITY_ID, fixtureDataSource } from "./fixture";
import { getFixtureCityPages } from "./fixture-city-pages";

const get = (prices: PublicPrice[], code: string, tier: string) => prices.find((p) => p.service_code === code && p.tier === tier);
const city = (id: string) => fixtureDataSource.getLocationPrices("city", id);
const region = (id: string) => fixtureDataSource.getLocationPrices("region", id);

const input = (patch: Partial<JawInput> = {}): JawInput => ({
  jaw: "upper",
  tooth_count: 1,
  location: null,
  status: "removed",
  installed_implant_count: null,
  scenario: null,
  implant_tier: "classic",
  crown_or_arch_tier: "classic",
  include_temporary: false,
  ...patch,
});

describe("fixture = Appendix A of ARCHITECTURE_v3", () => {
  it("serves cities and regions with slugs equal to ids", async () => {
    const locations = await fixtureDataSource.listLocations();
    expect(locations.some((l) => l.kind === "city" && l.id === "kyiv")).toBe(true);
    expect(locations.some((l) => l.kind === "region" && l.id === "vinnytska")).toBe(true);
    expect(locations.every((l) => l.slug === l.id)).toBe(true);
  });

  it("the catalog covers every canonical code with tier sources and additional flags", async () => {
    const { services } = await city("lviv");
    expect(services.map((s) => s.service_code).sort()).toEqual(Object.values(SERVICE_CODES).sort());
    const by = Object.fromEntries(services.map((s) => [s.service_code, s]));
    expect(by.IMPLANT_INSTALL).toMatchObject({ tiered: true, tier_source: "implant_tier", additional: false, role: "implant" });
    expect(by.MULTIUNIT.tier_source).toBe("implant_tier");
    expect(by.ABUTMENT_FINAL.tier_source).toBe("implant_tier");
    expect(by.CROWN_IMPLANT.tier_source).toBe("crown_or_arch_tier");
    expect(by.ARCH_FINAL.tier_source).toBe("crown_or_arch_tier");
    expect(by.SCAN_JAW_STAGE).toMatchObject({ tiered: false, tier_source: "common", additional: false });
    expect(by.CT_ONE_JAW.additional).toBe(true);
    expect(by.REMOVAL_SIMPLE.additional).toBe(true);
    expect(by.SINUS_LIFT.additional).toBe(true);
    expect(by.TEMP_CROWN_UNIT.additional).toBe(false);
  });

  it("every service has prices at its tiers", async () => {
    const { services, prices } = await city("lviv");
    for (const s of services) {
      const tiers = prices.filter((p) => p.service_code === s.service_code).map((p) => p.tier).sort();
      expect(tiers, s.service_code).toEqual(s.tiered ? ["classic", "minimum", "premium"] : ["common"]);
    }
  });

  it("Lviv: city baseline ×1.0 (manual_baseline), implant classic = hybrid of 2 clinics", async () => {
    const { prices } = await city("lviv");
    expect(get(prices, "HEALING_ABUTMENT", "classic")).toMatchObject({ value: 1800, source_type: "manual_baseline", source_scope: "city", local_clinic_count: 0, baseline_scope: "city" });
    expect(get(prices, "ARCH_FINAL", "premium")?.value).toBe(210000);
    const implant = get(prices, "IMPLANT_INSTALL", "classic");
    expect(implant).toMatchObject({ source_type: "hybrid", source_scope: "city", local_clinic_count: 2, baseline_scope: "city", blend_weights: { local: 2 / 3, baseline: 1 / 3 } });
    expect(implant?.value).toBeCloseTo((2 * 18250 + 18000) / 3, 8);
    expect(implant?.calculated_at).not.toBeNull();
    expect(prices.every((p) => p.is_demo && p.currency === "UAH")).toBe(true);
  });

  it("Kyiv ×1.15 with the aggregate implant (18500, n=3); Odesa hybrid n=1", async () => {
    const kyiv = await city("kyiv");
    expect(get(kyiv.prices, "IMPLANT_INSTALL", "classic")).toMatchObject({ value: 18500, source_type: "aggregate", local_clinic_count: 3, baseline_scope: null, blend_weights: null });
    expect(get(kyiv.prices, "IMPLANT_INSTALL", "minimum")?.value).toBe(13800); // 12 000 × 1.15
    expect(get(kyiv.prices, "SCAN_JAW_STAGE", "common")?.value).toBe(1400); // 1 380 → 1 400
    const odesa = await city("odesa");
    const implant = get(odesa.prices, "IMPLANT_INSTALL", "classic");
    expect(implant).toMatchObject({ source_type: "hybrid", local_clinic_count: 1, blend_weights: { local: 1 / 3, baseline: 2 / 3 } });
    expect(implant?.value).toBeCloseTo(18600, 8);
  });

  it("other baselines: dnipro ×0.97, chernivtsi ×0.9, kharkiv ×0.95", async () => {
    expect(get((await city("dnipro")).prices, "IMPLANT_INSTALL", "classic")?.value).toBe(17500);
    expect(get((await city("chernivtsi")).prices, "IMPLANT_INSTALL", "classic")?.value).toBe(16200);
    expect(get((await city("kharkiv")).prices, "IMPLANT_INSTALL", "classic")?.value).toBe(17100);
  });

  it("other cities → their oblast baseline (regional_fallback)", async () => {
    const vinnytsia = await city("vinnytsia");
    expect(vinnytsia.prices.every((p) => p.source_type === "regional_fallback" && p.source_scope === "region" && p.baseline_scope === "region")).toBe(true);
    expect(get(vinnytsia.prices, "IMPLANT_INSTALL", "classic")?.value).toBe(16600); // 18 000 × 0.92
    expect(get((await city("zhytomyr")).prices, "IMPLANT_INSTALL", "classic")?.value).toBe(15800); // × 0.88
    expect(get((await city("odesa")).prices, "SCAN_JAW_STAGE", "common")?.value).toBe(1200);
  });

  it("zakarpatska and volynska have no oblast prices → national_fallback at the raw baseline", async () => {
    for (const id of ["uzhhorod", "mukachevo", "lutsk"]) {
      const { prices } = await city(id);
      expect(prices.every((p) => p.source_type === "national_fallback" && p.source_scope === "country" && p.baseline_scope === "country"), id).toBe(true);
      expect(get(prices, "IMPLANT_INSTALL", "classic")?.value).toBe(18000);
      expect(get(prices, "HEMOSTATIC_SPONGE", "common")?.value).toBe(250);
    }
    expect((await region("zakarpatska")).prices.every((p) => p.source_type === "national_fallback")).toBe(true);
    expect((await region("volynska")).prices.every((p) => p.source_scope === "country")).toBe(true);
  });

  it("regions serve the oblast baseline; the empty city has no prices", async () => {
    expect(get((await region("lvivska")).prices, "IMPLANT_INSTALL", "classic")).toMatchObject({ value: 17100, source_type: "regional_fallback" });
    expect((await city(FIXTURE_EMPTY_CITY_ID)).prices).toEqual([]);
  });

  it("feeds the engine end to end (Lviv single tooth, classic)", async () => {
    const book = createPriceBook(await city("lviv"));
    const q = calculateQuote(input(), null, book);
    expect(q.overallTotal?.low).toBeCloseTo((2 * 18250 + 18000) / 3 + 1800 + 1200 + 5500 + 10000, 6);
    expect(q.priceMeta).toMatchObject({ source_scope: "city", baseline_scope: "city", local_clinic_count: 2, is_demo: true });
  });

  it("national fallback → the engine reports country scope and zero clinics", async () => {
    const q = calculateQuote(input(), null, createPriceBook(await city("uzhhorod")));
    expect(q.priceMeta).toMatchObject({ source_scope: "country", local_clinic_count: 0 });
    expect(q.overallTotal?.low).toBe(18000 + 1800 + 1200 + 5500 + 10000);
  });

  it("the empty city yields missing codes and no total", async () => {
    const q = calculateQuote(input(), null, createPriceBook(await city(FIXTURE_EMPTY_CITY_ID)));
    expect(q.overallTotal).toBeNull();
    expect(q.upperJawCalculation?.missing_codes.length).toBeGreaterThan(0);
  });

  it("lead hooks: 0000 → telegram failed then retry sent; 1111 → network error", async () => {
    const lead = (phone: string) => ({
      lead: {
        intent: "refine" as const,
        phone,
        location: { kind: "city" as const, id: "lviv", name: "Львів" },
        answers: {},
        scenario_label: "",
        upperJawInput: null,
        lowerJawInput: null,
        upperJawCalculation: null,
        lowerJawCalculation: null,
        overallTotal: null,
        price_source: "",
        page_url: "",
        utm: {},
        created_at: "",
      },
    });
    const failed = await fixtureDataSource.submitLead(lead("+380 50 000 0000"));
    expect(failed.telegram).toBe("failed");
    expect(await fixtureDataSource.submitLead({ retry_lead_id: failed.lead_id })).toEqual({ lead_id: failed.lead_id, telegram: "sent" });
    await expect(fixtureDataSource.submitLead(lead("+380 50 111 1111"))).rejects.toThrow();
    expect((await fixtureDataSource.submitLead(lead("+380 50 123 4567"))).telegram).toBe("sent");
  });
});

describe("getFixtureCityPages", () => {
  it("returns only the non-draft city: Kyiv in review with demo content", () => {
    const pages = getFixtureCityPages();
    expect(pages).toHaveLength(1);
    const kyiv = pages[0];
    expect(kyiv.location).toMatchObject({ kind: "city", id: "kyiv", slug: "kyiv" });
    expect(kyiv.seo_status).toBe("review");
    expect(kyiv.content.faq).toHaveLength(2);
    expect(kyiv.content.reviewer_name).toBe("Ім’я рецензента");
    expect(kyiv.content.intro).toContain("Демо");
    expect(get(kyiv.prices, "IMPLANT_INSTALL", "classic")?.value).toBe(18500);
    expect(kyiv.services.length).toBe(Object.values(SERVICE_CODES).length);
    expect(kyiv.eur_rate).toEqual({ rate: 50.1385, date: "2026-10-09" });
  });
});
