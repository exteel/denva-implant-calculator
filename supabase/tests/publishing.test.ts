// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addClinic, addPrice, drain, freshFixtureDb, rows, scalar } from "./harness";

let db: PGlite;
beforeEach(async () => {
  db = await freshFixtureDb();
});

async function clinicsWithPrices(city: string, prices: number[], tier = "classic", service = "IMPL") {
  for (const [i, p] of prices.entries()) {
    const id = await addClinic(db, `Клініка ${city}-${i}`, city);
    await addPrice(db, id, service, tier, p);
  }
}

interface Pub {
  value: number;
  source_type: string;
  source_scope: string;
  local_clinic_count: number;
  baseline_scope: string | null;
  blend_weights: { local: number; baseline: number } | null;
  calculated_at: string | null;
  is_demo: boolean;
}
async function pub(kind: string, id: string, service = "IMPL", tier = "classic"): Promise<Pub | null> {
  const r = await rows<Pub>(
    db,
    `select value::float8 as value, source_type, source_scope, local_clinic_count, baseline_scope, blend_weights,
            calculated_at, is_demo
       from published_prices where location_kind=$1 and location_id=$2 and service_code=$3 and tier=$4`,
    [kind, id, service, tier],
  );
  return r[0] ?? null;
}

const cityBaseline = (v: number, city = "c1") =>
  db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('${city}','IMPL','classic',${v})`);
const regionBaseline = (v: number, region = "r1") =>
  db.exec(`insert into region_manual_prices (region_id, service_code, tier, value) values ('${region}','IMPL','classic',${v})`);
const countryBaseline = (v: number) =>
  db.exec(`insert into country_manual_prices (country_id, service_code, tier, value) values ('UA','IMPL','classic',${v})`);

describe("n = 0: базовий орієнтир місто → область → Україна (ТЗ §2.3)", () => {
  it("baseline міста → manual_baseline", async () => {
    await cityBaseline(10000);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({
      value: 10000, source_type: "manual_baseline", source_scope: "city", local_clinic_count: 0,
      baseline_scope: "city", blend_weights: null, calculated_at: null,
    });
  });

  it("baseline області → regional_fallback; інший регіон без даних — рядка немає", async () => {
    await regionBaseline(9000);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ value: 9000, source_type: "regional_fallback", source_scope: "region", baseline_scope: "region" });
    expect(await pub("city", "c2")).toMatchObject({ value: 9000, source_type: "regional_fallback" });
    expect(await pub("city", "c3")).toBeNull();
  });

  it("baseline України → national_fallback (місто без міського й обласного)", async () => {
    await countryBaseline(8000);
    await drain(db);
    for (const c of ["c1", "c2", "c3"]) {
      expect(await pub("city", c)).toMatchObject({ value: 8000, source_type: "national_fallback", source_scope: "country", baseline_scope: "country" });
    }
  });

  it("пріоритет baseline: місто > область > Україна, і повертається назад при видаленні", async () => {
    await countryBaseline(8000);
    await regionBaseline(9000);
    await cityBaseline(10000);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ value: 10000, source_type: "manual_baseline" });
    expect(await pub("city", "c2")).toMatchObject({ value: 9000, source_type: "regional_fallback" });
    expect(await pub("city", "c3")).toMatchObject({ value: 8000, source_type: "national_fallback" });
    await db.exec("delete from city_manual_prices");
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ value: 9000, source_type: "regional_fallback" });
    await db.exec("delete from region_manual_prices");
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ value: 8000, source_type: "national_fallback" });
    await db.exec("delete from country_manual_prices");
    await drain(db);
    expect(await pub("city", "c1")).toBeNull();
  });

  it("немає жодного джерела → рядка немає (суму не вигадуємо)", async () => {
    await drain(db);
    expect(await scalar(db, "select count(*)::int from published_prices")).toBe(0);
  });

  it("baseline в EUR конвертується в UAH на дату snapshot", async () => {
    await db.exec(`insert into region_manual_prices (region_id, service_code, tier, value, currency) values ('r1','HEAL','common',40,'EUR')`);
    await drain(db);
    expect(await pub("city", "c1", "HEAL", "common")).toMatchObject({ value: 2000 });
  });
});

describe("n = 1, 2: гібрид (ваги, baseline, scope)", () => {
  it("1 клініка: ⅓ локальної + ⅔ baseline міста; ваги й scope у PublicPrice", async () => {
    await cityBaseline(18000);
    await clinicsWithPrices("c1", [19500]);
    await drain(db);
    const p = (await pub("city", "c1"))!;
    expect(p.source_type).toBe("hybrid");
    expect(p.value).toBeCloseTo((19500 + 2 * 18000) / 3, 6);
    expect(p).toMatchObject({ source_scope: "city", local_clinic_count: 1, baseline_scope: "city" });
    expect(p.blend_weights!.local).toBeCloseTo(1 / 3, 12);
    expect(p.blend_weights!.baseline).toBeCloseTo(2 / 3, 12);
    expect(p.calculated_at).not.toBeNull();
  });

  it("2 клініки: ⅔ медіани + ⅓ baseline", async () => {
    await cityBaseline(18000);
    await clinicsWithPrices("c1", [17500, 19000]);
    await drain(db);
    const p = (await pub("city", "c1"))!;
    expect(p.source_type).toBe("hybrid");
    expect(p.value).toBeCloseTo((2 * 18250 + 18000) / 3, 6);
    expect(p).toMatchObject({ local_clinic_count: 2, baseline_scope: "city" });
    expect(p.blend_weights!.local).toBeCloseTo(2 / 3, 12);
    expect(p.blend_weights!.baseline).toBeCloseTo(1 / 3, 12);
  });

  it("baseline гібрида береться за пріоритетом: область, якщо немає міського; Україна, якщо немає обох", async () => {
    await regionBaseline(9000);
    await countryBaseline(8000);
    await clinicsWithPrices("c1", [12000]);
    await clinicsWithPrices("c3", [12000]);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ source_type: "hybrid", baseline_scope: "region" });
    expect((await pub("city", "c1"))!.value).toBeCloseTo((12000 + 2 * 9000) / 3, 6);
    expect(await pub("city", "c3")).toMatchObject({ source_type: "hybrid", baseline_scope: "country" });
    expect((await pub("city", "c3"))!.value).toBeCloseTo((12000 + 2 * 8000) / 3, 6);
  });

  it("гібрид без жодного baseline = медіана локальних, вага baseline 0", async () => {
    await clinicsWithPrices("c1", [17000, 19000]);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({
      value: 18000, source_type: "hybrid", baseline_scope: null, blend_weights: { local: 1, baseline: 0 },
    });
    await db.exec("delete from clinic_prices where clinic_id in (select id from clinics where name = 'Клініка c1-0')");
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ value: 19000, source_type: "hybrid" });
  });

  it("значення не округлюються (numeric)", async () => {
    await cityBaseline(10001);
    await clinicsWithPrices("c1", [10000]);
    await drain(db);
    const txt = await scalar<string>(db, "select value::text from published_prices where location_id='c1' and service_code='IMPL'");
    expect(Number(txt)).toBeCloseTo(10000.666666666667, 9);
    expect(txt.split(".")[1].length).toBeGreaterThan(4);
  });

  it("n = 1 і n = 2 ↔ n = 3: перехід на чисту медіану", async () => {
    await cityBaseline(18000);
    await clinicsWithPrices("c1", [17000, 18500]);
    await drain(db);
    expect((await pub("city", "c1"))!.source_type).toBe("hybrid");
    await clinicsWithPrices("c1", [19500]);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({
      value: 18500, source_type: "aggregate", source_scope: "city", local_clinic_count: 3, baseline_scope: null, blend_weights: null,
    });
    const r = await rows<{ aggregation_method: string; calculated_at: string | null }>(
      db, "select aggregation_method, calculated_at from published_prices where location_id = 'c1' and service_code = 'IMPL'");
    expect(r[0].aggregation_method).toBe("median");
    expect(r[0].calculated_at).not.toBeNull();
  });

  it("n >= 4: медіана (парна кількість — середнє двох центральних), baseline ігнорується", async () => {
    await cityBaseline(1000);
    await clinicsWithPrices("c1", [10000, 12000, 20000, 30000]);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ value: 16000, source_type: "aggregate", local_clinic_count: 4 });
  });

  it("поріг міста min_clinics: ставить вагу n/T", async () => {
    await cityBaseline(18000);
    await db.exec(`update cities set min_clinics = 2 where id = 'c1'`);
    await clinicsWithPrices("c1", [19000]);
    await drain(db);
    const p = (await pub("city", "c1"))!;
    expect(p.value).toBeCloseTo((19000 + 18000) / 2, 6);
    expect(p.blend_weights).toEqual({ local: 0.5, baseline: 0.5 });
    await clinicsWithPrices("c1", [17000]);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ source_type: "aggregate", local_clinic_count: 2, value: 18000 });
  });

  it("глобальний поріг із settings перепублікує все", async () => {
    await clinicsWithPrices("c1", [17000, 18500]);
    await drain(db);
    expect((await pub("city", "c1"))!.source_type).toBe("hybrid");
    await db.exec(`update settings set min_clinics = 2`);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ source_type: "aggregate", value: 17750 });
  });
});

describe("manual_override (з причиною)", () => {
  async function setOverride(value: number, reason: string | null) {
    await db.query(
      `insert into price_modes (city_id, service_code, tier, mode, override_value, override_reason)
       values ('c1','IMPL','classic','manual_override',$1,$2)
       on conflict (city_id, service_code, tier) do update
         set mode = excluded.mode, override_value = excluded.override_value, override_reason = excluded.override_reason`,
      [value, reason],
    );
  }
  it("перемагає навіть чисту медіану; агрегат при цьому рахується", async () => {
    await cityBaseline(10000);
    await clinicsWithPrices("c1", [17000, 18500, 19500]);
    await setOverride(21000, "редакційне рішення");
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({
      value: 21000, source_type: "manual_override", source_scope: "city", local_clinic_count: 3, baseline_scope: null, blend_weights: null,
    });
    expect(await scalar(db, "select value::float8 from city_aggregates where city_id='c1' order by seq desc limit 1")).toBe(18500);
  });

  it("потребує значення і непорожньої причини", async () => {
    await expect(setOverride(21000, null)).rejects.toThrow();
    await expect(setOverride(21000, "  ")).rejects.toThrow();
    await expect(db.exec(`insert into price_modes (city_id, service_code, tier, mode) values ('c1','IMPL','classic','manual_override')`)).rejects.toThrow();
    await expect(db.exec(`insert into price_modes (city_id, service_code, tier, mode) values ('c1','IMPL','classic','manual')`)).rejects.toThrow();
  });

  it("повернення в auto знову публікує розрахункове значення", async () => {
    await clinicsWithPrices("c1", [17000, 18500, 19500]);
    await setOverride(21000, "тест");
    await drain(db);
    await db.exec(`update price_modes set mode = 'auto', override_value = null, override_reason = null`);
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ source_type: "aggregate", value: 18500 });
  });

  it("працює і без локальних даних та baseline", async () => {
    await setOverride(5000, "перше значення");
    await drain(db);
    expect(await pub("city", "c1")).toMatchObject({ value: 5000, source_type: "manual_override", local_clinic_count: 0 });
  });
});

describe("Рядки рівня області (пацієнт обирає область)", () => {
  it("baseline області → одразу публікується; видалення → baseline України → нічого", async () => {
    await regionBaseline(9000);
    expect(await pub("region", "r1")).toMatchObject({ value: 9000, source_type: "regional_fallback", source_scope: "region", local_clinic_count: 0 });
    await countryBaseline(8000);
    expect(await pub("region", "r2")).toMatchObject({ value: 8000, source_type: "national_fallback", source_scope: "country", baseline_scope: "country" });
    expect(await pub("region", "r1")).toMatchObject({ value: 9000 });
    await db.exec(`update region_manual_prices set value = 9500 where region_id = 'r1'`);
    expect(await pub("region", "r1")).toMatchObject({ value: 9500 });
    await db.exec(`delete from region_manual_prices where region_id = 'r1'`);
    expect(await pub("region", "r1")).toMatchObject({ value: 8000, source_type: "national_fallback" });
    await db.exec(`delete from country_manual_prices`);
    expect(await pub("region", "r1")).toBeNull();
    expect(await pub("region", "r2")).toBeNull();
  });

  it("нова область одразу отримує рядки з baseline України", async () => {
    await countryBaseline(8000);
    await db.exec(`insert into regions (id, name) values ('r9', 'Нова')`);
    expect(await pub("region", "r9")).toMatchObject({ value: 8000, source_type: "national_fallback" });
  });
});

describe("Історія публікації та демо-прапори", () => {
  it("публікація не пише нічого, якщо значення не змінилось", async () => {
    await cityBaseline(10000);
    await drain(db);
    await db.exec(`select recalculate('c1','IMPL','classic'); select recalculate('c1','IMPL','classic');`);
    expect(await scalar(db, "select count(*)::int from published_price_history where location_id='c1'")).toBe(1);
  });

  it("історія: set → set → removed", async () => {
    await cityBaseline(10000);
    await drain(db);
    await db.exec(`update city_manual_prices set value = 12000`);
    await drain(db);
    await db.exec(`delete from city_manual_prices`);
    await drain(db);
    const h = await rows<{ change_type: string; value: number | null; previous_value: number | null; source_type: string | null }>(
      db, "select change_type, value::float8 as value, previous_value::float8 as previous_value, source_type from published_price_history where location_id='c1' order by id");
    expect(h).toEqual([
      { change_type: "set", value: 10000, previous_value: null, source_type: "manual_baseline" },
      { change_type: "set", value: 12000, previous_value: 10000, source_type: "manual_baseline" },
      { change_type: "removed", value: null, previous_value: 12000, source_type: "manual_baseline" },
    ]);
  });

  it("демо-baseline → демо-ціна; змінений людиною — вже не демо", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value, is_demo) values ('c1','IMPL','classic',10000,true)`);
    await drain(db);
    expect((await pub("city", "c1"))!.is_demo).toBe(true);
    await db.exec(`update city_manual_prices set value = 10500`);
    await drain(db);
    expect((await pub("city", "c1"))!.is_demo).toBe(false);
  });

  it("гібрид демо, якщо демо хоч одне з джерел", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value, is_demo) values ('c1','IMPL','classic',10000,true)`);
    await clinicsWithPrices("c1", [12000]);
    await drain(db);
    expect((await pub("city", "c1"))!.is_demo).toBe(true);
  });
});

describe("Валідація рівнів", () => {
  it("нерівнева послуга приймає лише common; рівнева — лише minimum/classic/premium", async () => {
    await expect(db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','HEAL','classic',1)`)).rejects.toThrow();
    await expect(db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','common',1)`)).rejects.toThrow();
    await expect(db.exec(`insert into country_manual_prices (service_code, tier, value) values ('IMPL','common',1)`)).rejects.toThrow();
    await db.exec(`insert into country_manual_prices (service_code, tier, value) values ('HEAL','common',1500)`);
    expect(await scalar(db, "select country_id from country_manual_prices")).toBe("UA");
  });

  it("ціна клініки: price_from > 0, price_to >= price_from; value = середина діапазону", async () => {
    const id = await addClinic(db, "К", "c1");
    await expect(addPrice(db, id, "IMPL", "classic", 0)).rejects.toThrow();
    await expect(addPrice(db, id, "IMPL", "classic", 100, { priceTo: 50 })).rejects.toThrow();
    const pid = await addPrice(db, id, "IMPL", "classic", 10000, { priceTo: 14000 });
    expect(await scalar(db, "select value::float8 from clinic_prices where id = $1", [pid])).toBe(12000);
  });

  it("схвалена ціна мусить бути зіставлена; підтвердження фіксує verified_at", async () => {
    const id = await addClinic(db, "К", "c1");
    await expect(db.query(`insert into clinic_prices (clinic_id, price_from, status) values ($1, 100, 'approved')`, [id])).rejects.toThrow();
    const pid = await addPrice(db, id, "IMPL", "classic", 100, { status: "pending", verifiedAt: null });
    expect(await scalar(db, "select verified_at from clinic_prices where id=$1", [pid])).toBeNull();
    await db.query("update clinic_prices set status = 'approved' where id = $1", [pid]);
    expect(await scalar(db, "select verified_at is not null from clinic_prices where id=$1", [pid])).toBe(true);
  });

  it("рівневість узгоджена з tier_source; метод агрегації — лише median", async () => {
    await expect(db.exec(`insert into services (service_code, name, role, unit, tiered, tier_source) values ('BAD','x','addon','за зуб',true,'common')`)).rejects.toThrow();
    await expect(db.exec(`insert into services (service_code, name, role, unit, tiered, tier_source) values ('BAD2','x','addon','за зуб',false,'implant_tier')`)).rejects.toThrow();
    await expect(db.exec(`update settings set aggregation_method = 'arithmetic_mean'`)).rejects.toThrow();
  });
});
