// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { LocationPricesResponse } from "../../src/lib/contracts";
import { freshSeededDb, one, published, rows, scalar, withRole } from "./harness";

const BASE: Record<string, number> = {
  HEALING_ABUTMENT: 1800, SCAN_BOTH: 1500, SUPERSTRUCTURE_SET: 5500, TEMP_CROWN_UNIT: 2500, MULTIUNIT: 6500,
  ARCH_TEMP: 38000, EXTRACTION_SIMPLE: 1100, EXTRACTION_COMPLEX: 2500, AUGMENT: 12000, SINUS: 18000,
  SOFT_TISSUE: 7500, SEDATION: 4000, SURGICAL_GUIDE: 4500,
};
const TIERED: Record<string, [number, number, number]> = {
  IMPLANT_INSTALL: [12000, 18000, 28000], CROWN_IMPLANT: [7000, 10000, 15000], ARCH_FINAL: [85000, 130000, 210000],
};
// ті самі множники й те саме JS-округлення, що й у dev-фікстурі калькулятора (src/lib/data/fixture.ts)
const CITY_MULT: Record<string, number> = { kyiv: 1.15, lviv: 1.0, odesa: 1.02, dnipro: 0.97, kharkiv: 0.95, "ivano-frankivsk": 0.93, chernivtsi: 0.9 };
const round100 = (price: number, mult: number) => Math.round((price * mult) / 100) * 100;

let db: PGlite;
beforeAll(async () => {
  db = await freshSeededDb();
}, 120_000);

describe("seed.sql (демо-дані)", () => {
  it("25 областей (24 + м. Київ) і 33 міста, усе is_demo", async () => {
    expect(await scalar(db, "select count(*)::int from regions")).toBe(25);
    expect(await scalar(db, "select count(*)::int from cities")).toBe(33);
    expect(await scalar(db, "select count(*)::int from regions where not is_demo")).toBe(0);
    expect(await scalar(db, "select count(*)::int from cities where not is_demo")).toBe(0);
    const kyiv = await one<{ region_id: string; aliases: string[] }>(db, "select region_id, aliases from cities where id = 'kyiv'");
    expect(kyiv.region_id).toBe("kyiv-city");
    expect(kyiv.aliases).toEqual(["kyiv", "kiev", "kijev", "Киев"]);
    expect(await scalar(db, "select region_id from cities where id = 'kryvyi-rih'")).toBe("dnipropetrovska");
  });

  it("16 послуг; tiered лише IMPLANT_INSTALL, CROWN_IMPLANT, ARCH_FINAL", async () => {
    expect(await scalar(db, "select count(*)::int from services")).toBe(16);
    const t = await rows<{ service_code: string }>(db, "select service_code from services where tiered order by 1");
    expect(t.map((x) => x.service_code)).toEqual(["ARCH_FINAL", "CROWN_IMPLANT", "IMPLANT_INSTALL"]);
    expect(await scalar(db, "select unit from services where service_code = 'SINUS'")).toBe("за сторону");
    expect(await scalar(db, "select included_text from services where service_code = 'IMPLANT_INSTALL'")).toBe("Імплант і його встановлення, місцева анестезія");
    expect(await scalar(db, "select count(*)::int from services where not is_demo")).toBe(0);
  });

  it("курси НБУ", async () => {
    expect(await scalar(db, "select rate_to_uah::float8 from currency_rates where currency='EUR' and rate_date='2026-10-09'")).toBe(50.1385);
    expect(await scalar(db, "select rate_to_uah::float8 from currency_rates where currency='USD' and rate_date='2026-10-09'")).toBe(41.25);
  });

  it("міські орієнтири: база × коефіцієнт, округлення до 100", async () => {
    const expected = new Map<string, number>();
    for (const [city, pct] of Object.entries(CITY_MULT)) {
      for (const [svc, price] of Object.entries(BASE)) expected.set(`${city}/${svc}/common`, round100(price, pct));
      for (const [svc, prices] of Object.entries(TIERED)) {
        ["minimum", "classic", "premium"].forEach((tier, i) => expected.set(`${city}/${svc}/${tier}`, round100(prices[i], pct)));
      }
    }
    const got = await rows<{ k: string; value: number }>(db,
      "select city_id || '/' || service_code || '/' || tier as k, value::float8 as value from city_manual_prices");
    expect(got).toHaveLength(7 * 22);
    expect(new Map(got.map((g) => [g.k, g.value]))).toEqual(expected);
    expect(expected.get("lviv/IMPLANT_INSTALL/classic")).toBe(18000);
    expect(expected.get("kyiv/IMPLANT_INSTALL/classic")).toBe(20700);
    expect(expected.get("kyiv/CROWN_IMPLANT/minimum")).toBe(8000); // 7000 × 1.15 у float = 8049.999… → 8000
  });

  it("регіональні орієнтири є для КОЖНОЇ області й рівня; база × коефіцієнт макрорегіону", async () => {
    expect(await scalar(db, "select count(*)::int from region_manual_prices")).toBe(25 * 22);
    expect(await scalar(db, "select count(distinct region_id)::int from region_manual_prices")).toBe(25);
    const v = (region: string, svc: string, tier: string) =>
      scalar<number>(db, "select value::float8 from region_manual_prices where region_id=$1 and service_code=$2 and tier=$3", [region, svc, tier]);
    expect(await v("kyiv-city", "IMPLANT_INSTALL", "classic")).toBe(round100(18000, 1.15));
    expect(await v("lvivska", "IMPLANT_INSTALL", "classic")).toBe(round100(18000, 0.95));
    expect(await v("vinnytska", "CROWN_IMPLANT", "premium")).toBe(round100(15000, 0.92));
    expect(await v("sumska", "ARCH_FINAL", "minimum")).toBe(round100(85000, 0.88));
    expect(await v("odeska", "SEDATION", "common")).toBe(4000);
    expect(await v("kharkivska", "SCAN_BOTH", "common")).toBe(round100(1500, 0.95));
  });

  it("Київ: 3 демо-клініки → IMPLANT_INSTALL/classic публікується як aggregate 18500 (n = 3)", async () => {
    expect(await published(db, "city", "kyiv", "IMPLANT_INSTALL", "classic")).toMatchObject({
      value: 18500, source_type: "aggregate", clinic_count: 3, currency: "UAH",
    });
    expect(await scalar(db, "select is_demo from published_prices where location_id='kyiv' and service_code='IMPLANT_INSTALL' and tier='classic'")).toBe(true);
    expect(await scalar(db, "select count(*)::int from clinics where is_demo")).toBe(5);
    expect(await scalar(db, "select count(*)::int from clinic_prices where not is_demo")).toBe(0);
  });

  it("Львів: 2 клініки недостатньо → ручний орієнтир", async () => {
    expect(await published(db, "city", "lviv", "IMPLANT_INSTALL", "classic")).toMatchObject({ value: 18000, source_type: "manual", clinic_count: null });
    expect(await scalar(db, "select clinic_count::int from city_aggregates where city_id='lviv' and service_code='IMPLANT_INSTALL' and tier='classic' order by seq desc limit 1")).toBe(2);
  });

  it("місто без ручних цін (Вінниця) → regional_fallback; ручні міста → manual", async () => {
    expect(await published(db, "city", "vinnytsia", "IMPLANT_INSTALL", "classic")).toMatchObject({
      value: round100(18000, 0.92), source_type: "regional_fallback",
    });
    expect(await published(db, "city", "chernivtsi", "CROWN_IMPLANT", "minimum")).toMatchObject({ value: round100(7000, 0.9), source_type: "manual" });
  });

  it("усі 33 міста × 22 комбінації опубліковано; рядки областей — теж", async () => {
    expect(await scalar(db, "select count(*)::int from published_prices where location_kind='city'")).toBe(33 * 22);
    expect(await scalar(db, "select count(*)::int from published_prices where location_kind='region'")).toBe(25 * 22);
    expect(await scalar(db, "select count(*)::int from published_prices where not is_demo")).toBe(0);
    expect(await scalar(db, "select count(*)::int from recalc_queue")).toBe(0);
  });

  it("get_location_prices для anon на seed: форма контракту, демо-прапор, курс EUR", async () => {
    const res = await withRole(db, "anon", undefined, async () =>
      (await one<{ r: LocationPricesResponse }>(db, "select get_location_prices('city','kyiv') as r")).r);
    expect(res.services).toHaveLength(16);
    expect(res.prices).toHaveLength(22);
    expect(res.eur_rate).toEqual({ rate: 50.1385, date: "2026-10-09" });
    const impl = res.prices.find((p) => p.service_code === "IMPLANT_INSTALL" && p.tier === "classic");
    expect(impl).toMatchObject({ value: 18500, source_type: "aggregate", clinic_count: 3, is_demo: true });
    expect(JSON.stringify(res)).not.toContain("Демо-клініка");
    const region = await withRole(db, "anon", undefined, async () =>
      (await one<{ r: LocationPricesResponse }>(db, "select get_location_prices('region','odeska') as r")).r);
    expect(region.prices).toHaveLength(22);
    expect(region.prices.every((p) => p.source_type === "regional_fallback")).toBe(true);
  });
});
