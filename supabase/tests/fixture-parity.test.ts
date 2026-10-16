// @vitest-environment node
/**
 * Parity: seed.sql (backend demo data) ↔ src/lib/data/fixture.ts (calculator fixture).
 * Both reproduce Appendix A of docs/ARCHITECTURE_v3.md; every city/region × service × tier must agree.
 * Intentional fixture-only difference: FIXTURE_EMPTY_CITY_ID (kramatorsk) has no prices in the fixture
 * (the «даних поки недостатньо» path), while the seed publishes its oblast baseline.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { CityPageData, LocationPricesResponse, PublicLocation, PublicPrice } from "../../src/lib/contracts";
import { FIXTURE_EMPTY_CITY_ID, FIXTURE_LOCATIONS, FIXTURE_SERVICES, fixturePricesResponse, getFixtureCityPages } from "../../src/lib/data/fixture";
import { normalizeCityPage } from "../../src/lib/seo/data";
import { normalizePricesResponse } from "../../src/lib/data/supabase-source";
import { freshSeededDb, one, withRole } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await freshSeededDb();
}, 300_000);

const backend = (kind: string, id: string) =>
  withRole(db, "anon", undefined, async () =>
    normalizePricesResponse((await one<{ r: LocationPricesResponse }>(db, "select get_location_prices($1, $2) as r", [kind, id])).r));

const key = (p: PublicPrice) => `${p.service_code}/${p.tier}`;
const shape = (p: PublicPrice) => ({
  service_code: p.service_code, tier: p.tier, currency: p.currency, source_type: p.source_type, source_scope: p.source_scope,
  local_clinic_count: p.local_clinic_count, baseline_scope: p.baseline_scope, is_demo: p.is_demo,
  has_calculated_at: p.calculated_at !== null,
});

describe("fixture ↔ seed parity", () => {
  it("локації: ті самі міста й області з тими самими полями", async () => {
    const sql = await withRole(db, "anon", undefined, async () =>
      (await one<{ r: PublicLocation[] }>(db, "select list_locations() as r")).r);
    const byKey = (l: PublicLocation[]) => new Map(l.map((x) => [`${x.kind}:${x.id}`, x]));
    expect(byKey(sql)).toEqual(byKey(FIXTURE_LOCATIONS));
  });

  it("каталог послуг ідентичний", async () => {
    const res = await backend("city", "kyiv");
    expect(res.services).toEqual(FIXTURE_SERVICES);
  });

  it("кожна локація × послуга × рівень: value, source_type, source_scope, local_clinic_count, baseline_scope, blend_weights", async () => {
    const mismatches: string[] = [];
    for (const loc of FIXTURE_LOCATIONS) {
      const fx = fixturePricesResponse(loc.kind, loc.id);
      const be = await backend(loc.kind, loc.id);
      expect(be.location, `${loc.kind}:${loc.id}`).toEqual(fx.location);
      expect(be.eur_rate).toEqual(fx.eur_rate);
      if (loc.kind === "city" && loc.id === FIXTURE_EMPTY_CITY_ID) {
        expect(fx.prices).toEqual([]);
        expect(be.prices).toHaveLength(43);
        continue;
      }
      const beMap = new Map(be.prices.map((p) => [key(p), p]));
      expect([...beMap.keys()].sort(), `${loc.id} keys`).toEqual(fx.prices.map(key).sort());
      for (const f of fx.prices) {
        const b = beMap.get(key(f))!;
        const where = `${loc.kind}:${loc.id}/${key(f)}`;
        if (JSON.stringify(shape(b)) !== JSON.stringify(shape(f))) mismatches.push(`${where} ${JSON.stringify(shape(b))} ≠ ${JSON.stringify(shape(f))}`);
        if (Math.abs(b.value - f.value) > 1e-6) mismatches.push(`${where} value ${b.value} ≠ ${f.value}`);
        const bw = b.blend_weights, fw = f.blend_weights;
        if ((bw === null) !== (fw === null) || (bw && fw && (Math.abs(bw.local - fw.local) > 1e-12 || Math.abs(bw.baseline - fw.baseline) > 1e-12))) {
          mismatches.push(`${where} weights ${JSON.stringify(bw)} ≠ ${JSON.stringify(fw)}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("get_city_pages (через SEO-нормалізацію) = getFixtureCityPages: ті самі міста, статус, контент, ціни", async () => {
    const raw = await withRole(db, "anon", undefined, async () => (await one<{ r: CityPageData[] }>(db, "select get_city_pages() as r")).r);
    const sql = raw.map((p) => normalizeCityPage(p)!);
    const fx = getFixtureCityPages().map((p) => normalizeCityPage(p)!);
    expect(sql.map((p) => [p.location, p.seo_status])).toEqual(fx.map((p) => [p.location, p.seo_status]));
    for (const [i, page] of sql.entries()) {
      const { reviewed_at: a, ...restSql } = page.content;
      const { reviewed_at: b, ...restFx } = fx[i].content;
      expect(restSql).toEqual(restFx);
      expect(new Date(a!).toISOString()).toBe(new Date(b!).toISOString());
      expect(page.services).toEqual(fx[i].services);
      expect(page.eur_rate).toEqual(fx[i].eur_rate);
      const sorted = (list: PublicPrice[]) => [...list].sort((x, y) => key(x).localeCompare(key(y))).map((p) => ({ ...shape(p), value: Math.round(p.value * 1e6) / 1e6 }));
      expect(sorted(page.prices)).toEqual(sorted(fx[i].prices));
    }
  });
});
