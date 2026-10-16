// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { CityPageData, LocationPricesResponse } from "../../src/lib/contracts";
import { freshSeededDb, one, rows, scalar, withRole } from "./harness";

// Додаток А docs/ARCHITECTURE_v3.md — канонічні демо-ціни (UAH)
const TIERED: Record<string, [number, number, number]> = {
  IMPLANT_INSTALL: [12000, 18000, 28000], HEALING_ABUTMENT: [1500, 1800, 2500], SUPERSTRUCTURE_SET: [4500, 5500, 8000],
  ABUTMENT_FINAL: [3000, 4000, 6000], MULTIUNIT: [5000, 6500, 9000], CROWN_IMPLANT: [7000, 10000, 15000],
  ARCH_FINAL: [85000, 130000, 210000],
};
const COMMON: Record<string, number> = {
  SCAN_JAW_STAGE: 1200, REPEAT_SCAN_JAW: 1000, TEMP_CROWN_UNIT: 2500, ARCH_TEMP: 38000, IMPLANT_CONSULT: 600, CT_ONE_JAW: 900,
  CT_BOTH_JAWS: 1400, REMOVAL_SIMPLE: 1100, REMOVAL_COMPLEX: 2500, REMOVAL_WISDOM_SIMPLE: 1800, REMOVAL_WISDOM_COMPLEX: 3500,
  REMOVAL_RESORCIN: 2200, REMOVAL_IMPACTED: 4500, ANESTHESIA_AREA: 400, SUTURE_AREA: 300, HEMOSTATIC_SPONGE: 250,
  AUGMENT_SEGMENT: 12000, SINUS_LIFT: 18000, SOFT_TISSUE: 7500, SEDATION_30_MIN: 2500, SURGICAL_GUIDE_STANDARD: 4500,
  CEMENT_RESTORATION_REMOVAL: 500,
};
const CITY_MULT: Record<string, number> = { kyiv: 1.15, lviv: 1.0, odesa: 1.02, dnipro: 0.97, kharkiv: 0.95, "ivano-frankivsk": 0.93, chernivtsi: 0.9 };
// той самий JS-спосіб округлення, що й у fixture калькулятора
const round100 = (price: number, mult: number) => Math.round((price * mult) / 100) * 100;

const allBase = (): Array<[string, string, number]> => [
  ...Object.entries(TIERED).flatMap(([c, v]) => (["minimum", "classic", "premium"] as const).map((t, i): [string, string, number] => [c, t, v[i]])),
  ...Object.entries(COMMON).map(([c, v]): [string, string, number] => [c, "common", v]),
];

let db: PGlite;
beforeAll(async () => {
  db = await freshSeededDb();
}, 300_000);

async function pub(kind: string, id: string, svc: string, tier: string) {
  return (await rows<{ value: number; source_type: string; source_scope: string; local_clinic_count: number; baseline_scope: string | null;
    blend_weights: { local: number; baseline: number } | null; is_demo: boolean }>(db,
    `select value::float8 as value, source_type, source_scope, local_clinic_count, baseline_scope, blend_weights, is_demo
       from published_prices where location_kind=$1 and location_id=$2 and service_code=$3 and tier=$4`, [kind, id, svc, tier]))[0];
}

describe("seed.sql v3", () => {
  it("25 областей і 33 міста; каталог — рівно 29 кодів шаблону", async () => {
    expect(await scalar(db, "select count(*)::int from regions")).toBe(25);
    expect(await scalar(db, "select count(*)::int from cities")).toBe(33);
    expect(await scalar(db, "select count(*)::int from services")).toBe(29);
    expect(await scalar(db, "select count(*)::int from services where active")).toBe(29);
    expect(await scalar(db, "select count(*)::int from services where not additional")).toBe(11);
    const kyiv = await one<{ region_id: string; slug: string }>(db, "select region_id, slug from cities where id = 'kyiv'");
    expect(kyiv).toEqual({ region_id: "kyiv-city", slug: "kyiv" });
  });

  it("баз України — 43 комбінації зі значеннями Додатка А", async () => {
    const got = await rows<{ k: string; value: number }>(db, "select service_code || '/' || tier as k, value::float8 as value from country_manual_prices");
    expect(got).toHaveLength(43);
    expect(new Map(got.map((g) => [g.k, g.value]))).toEqual(new Map(allBase().map(([c, t, v]) => [`${c}/${t}`, v])));
  });

  it("міські baseline (7 міст): база × коефіцієнт, округлення до 100 (JS)", async () => {
    const got = await rows<{ k: string; value: number }>(db, "select city_id || '/' || service_code || '/' || tier as k, value::float8 as value from city_manual_prices");
    expect(got).toHaveLength(7 * 43);
    const expected = new Map<string, number>();
    for (const [city, m] of Object.entries(CITY_MULT)) for (const [c, t, v] of allBase()) expected.set(`${city}/${c}/${t}`, round100(v, m));
    expect(new Map(got.map((g) => [g.k, g.value]))).toEqual(expected);
    expect(expected.get("lviv/IMPLANT_INSTALL/classic")).toBe(18000);
    expect(expected.get("odesa/IMPLANT_INSTALL/classic")).toBe(18400);
  });

  it("обласні baseline: усі області, крім Закарпатської і Волинської; база × макро-коефіцієнт", async () => {
    expect(await scalar(db, "select count(distinct region_id)::int from region_manual_prices")).toBe(23);
    expect(await scalar(db, "select count(*)::int from region_manual_prices")).toBe(23 * 43);
    expect(await scalar(db, "select count(*)::int from region_manual_prices where region_id in ('zakarpatska','volynska')")).toBe(0);
    const v = (r: string, c: string, t: string) => scalar<number>(db, "select value::float8 from region_manual_prices where region_id=$1 and service_code=$2 and tier=$3", [r, c, t]);
    expect(await v("kyiv-city", "IMPLANT_INSTALL", "classic")).toBe(round100(18000, 1.15));
    expect(await v("lvivska", "MULTIUNIT", "premium")).toBe(round100(9000, 0.95));
    expect(await v("vinnytska", "CROWN_IMPLANT", "premium")).toBe(round100(15000, 0.92));
    expect(await v("sumska", "ARCH_FINAL", "minimum")).toBe(round100(85000, 0.88));
    expect(await v("odeska", "SEDATION_30_MIN", "common")).toBe(2500);
    expect(await v("kharkivska", "CT_ONE_JAW", "common")).toBe(round100(900, 0.95));
  });

  it("Київ: 3 демо-клініки → aggregate 18500 (n = 3, без baseline у PublicPrice)", async () => {
    expect(await pub("city", "kyiv", "IMPLANT_INSTALL", "classic")).toEqual({
      value: 18500, source_type: "aggregate", source_scope: "city", local_clinic_count: 3, baseline_scope: null, blend_weights: null, is_demo: true,
    });
  });

  it("Львів: 2 клініки → hybrid ⅔ · 18250 + ⅓ · 18000", async () => {
    const p = await pub("city", "lviv", "IMPLANT_INSTALL", "classic");
    expect(p).toMatchObject({ source_type: "hybrid", source_scope: "city", local_clinic_count: 2, baseline_scope: "city" });
    expect(p.value).toBeCloseTo((2 * 18250 + 18000) / 3, 6);
    expect(p.blend_weights!.local).toBeCloseTo(2 / 3, 12);
  });

  it("Одеса: 1 клініка → hybrid ⅓ · 19000 + ⅔ · 18400", async () => {
    const p = await pub("city", "odesa", "IMPLANT_INSTALL", "classic");
    expect(p).toMatchObject({ source_type: "hybrid", local_clinic_count: 1, baseline_scope: "city" });
    expect(p.value).toBeCloseTo((19000 + 2 * 18400) / 3, 6);
    expect(p.blend_weights!.local).toBeCloseTo(1 / 3, 12);
  });

  it("baseline за пріоритетом: місто → область → Україна", async () => {
    expect(await pub("city", "chernivtsi", "CROWN_IMPLANT", "minimum")).toMatchObject({
      value: round100(7000, 0.9), source_type: "manual_baseline", source_scope: "city", baseline_scope: "city", local_clinic_count: 0,
    });
    expect(await pub("city", "vinnytsia", "IMPLANT_INSTALL", "classic")).toMatchObject({
      value: round100(18000, 0.92), source_type: "regional_fallback", source_scope: "region", baseline_scope: "region",
    });
    for (const city of ["uzhhorod", "mukachevo", "lutsk"]) {
      expect(await pub("city", city, "IMPLANT_INSTALL", "classic"), city).toMatchObject({
        value: 18000, source_type: "national_fallback", source_scope: "country", baseline_scope: "country",
      });
    }
  });

  it("опубліковано всі 33 міста × 43 комбінації і 25 областей × 43; черга порожня", async () => {
    expect(await scalar(db, "select count(*)::int from published_prices where location_kind='city'")).toBe(33 * 43);
    expect(await scalar(db, "select count(*)::int from published_prices where location_kind='region'")).toBe(25 * 43);
    expect(await scalar(db, "select count(*)::int from published_prices where not is_demo")).toBe(0);
    expect(await scalar(db, "select count(*)::int from recalc_queue")).toBe(0);
    // області без власного baseline → baseline України
    expect(await pub("region", "zakarpatska", "ARCH_FINAL", "classic")).toMatchObject({ value: 130000, source_type: "national_fallback", source_scope: "country" });
    expect(await pub("region", "lvivska", "ARCH_FINAL", "classic")).toMatchObject({ value: round100(130000, 0.95), source_type: "regional_fallback", source_scope: "region" });
  });

  it("SEO: усі міста draft, крім Києва (review) із демо-контентом", async () => {
    const st = await rows<{ id: string; seo_status: string }>(db, "select id, seo_status from cities where seo_status <> 'draft'");
    expect(st).toEqual([{ id: "kyiv", seo_status: "review" }]);
    const k = await one<{ intro: string; faq: unknown[]; reviewer_name: string; content_is_demo: boolean }>(db,
      "select intro, faq, reviewer_name, content_is_demo from cities where id='kyiv'");
    expect(k.intro.length).toBeGreaterThan(20);
    expect(k.faq).toHaveLength(2);
    expect(k.reviewer_name).toBe("Ім’я рецензента");
    expect(k.content_is_demo).toBe(true);
  });

  it("get_location_prices для anon: контракт v3 (43 ціни, 29 послуг, курс EUR), без назв клінік", async () => {
    const res = await withRole(db, "anon", undefined, async () =>
      (await one<{ r: LocationPricesResponse }>(db, "select get_location_prices('city','odesa') as r")).r);
    expect(res.services).toHaveLength(29);
    expect(res.prices).toHaveLength(43);
    expect(res.currency).toBe("UAH");
    expect(res.eur_rate).toEqual({ rate: 50.1385, date: "2026-10-09" });
    expect(JSON.stringify(res)).not.toContain("Демо-клініка");
    const svc = res.services.find((s) => s.service_code === "ABUTMENT_FINAL")!;
    expect(svc).toMatchObject({ role: "final_abutment", tiered: true, tier_source: "implant_tier", additional: false, sort: 80 });
    expect(res.services.find((s) => s.service_code === "ARCH_FINAL")).toMatchObject({ role: "arch", tier_source: "crown_or_arch_tier" });
    expect(res.services.find((s) => s.service_code === "SEDATION_30_MIN")).toMatchObject({ role: "addon", additional: true, tier_source: "common" });
    const region = await withRole(db, "anon", undefined, async () =>
      (await one<{ r: LocationPricesResponse }>(db, "select get_location_prices('region','odeska') as r")).r);
    expect(region.prices).toHaveLength(43);
    expect(region.prices.every((p) => p.source_type === "regional_fallback" && p.source_scope === "region")).toBe(true);
  });

  it("get_city_pages: лише міста зі статусом ≠ draft, без даних клінік", async () => {
    const pages = await withRole(db, "anon", undefined, async () =>
      (await one<{ r: CityPageData[] }>(db, "select get_city_pages() as r")).r);
    expect(pages).toHaveLength(1);
    const kyiv = pages[0];
    expect(kyiv.location).toMatchObject({ kind: "city", id: "kyiv", slug: "kyiv", region_id: "kyiv-city" });
    expect(kyiv.seo_status).toBe("review");
    expect(kyiv.prices).toHaveLength(43);
    expect(kyiv.services).toHaveLength(29);
    expect(kyiv.content.reviewer_name).toBe("Ім’я рецензента");
    expect(kyiv.content.faq).toHaveLength(2);
    expect(JSON.stringify(pages)).not.toMatch(/Демо-клініка|clinic_id|network/);
  });
});
