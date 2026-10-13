// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addClinic, addPrice, drain, freshFixtureDb, published, rows, scalar } from "./harness";

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

describe("Пріоритет публікації (ТЗ §2.3)", () => {
  it("ручний міський орієнтир публікується як manual", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)`);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({
      value: 10000, source_type: "manual", clinic_count: null, currency: "UAH",
    });
  });

  it("місто без ручного значення бере регіональний fallback; інший регіон — нічого", async () => {
    await db.exec(`insert into region_manual_prices (region_id, service_code, tier, value) values ('r1','IMPL','classic',9000)`);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 9000, source_type: "regional_fallback" });
    expect(await published(db, "city", "c2", "IMPL", "classic")).toMatchObject({ value: 9000, source_type: "regional_fallback" });
    expect(await published(db, "city", "c3", "IMPL", "classic")).toBeNull();
  });

  it("ручне міське значення має перевагу над регіональним", async () => {
    await db.exec(`
      insert into region_manual_prices (region_id, service_code, tier, value) values ('r1','IMPL','classic',9000);
      insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',11000);`);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 11000, source_type: "manual" });
    expect(await published(db, "city", "c2", "IMPL", "classic")).toMatchObject({ value: 9000, source_type: "regional_fallback" });
  });

  it("рядок рівня області публікується одразу з region_manual_prices", async () => {
    await db.exec(`insert into region_manual_prices (region_id, service_code, tier, value) values ('r1','IMPL','classic',9000)`);
    // без process_recalc_queue
    expect(await published(db, "region", "r1", "IMPL", "classic")).toMatchObject({ value: 9000, source_type: "regional_fallback" });
    await db.exec(`update region_manual_prices set value = 9500 where region_id = 'r1'`);
    expect(await published(db, "region", "r1", "IMPL", "classic")).toMatchObject({ value: 9500 });
    await db.exec(`delete from region_manual_prices where region_id = 'r1'`);
    expect(await published(db, "region", "r1", "IMPL", "classic")).toBeNull();
  });

  it("немає жодного джерела → рядка немає (суму не вигадуємо)", async () => {
    await drain(db);
    expect(await scalar(db, "select count(*)::int from published_prices")).toBe(0);
  });

  it("агрегат публікується при >= 3 клінік (медіана)", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)`);
    await clinicsWithPrices("c1", [17000, 18500, 19500]);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({
      value: 18500, source_type: "aggregate", clinic_count: 3,
    });
    const row = await rows<{ aggregation_method: string; calculated_at: string | null }>(
      db, "select aggregation_method, calculated_at from published_prices where location_id = 'c1'");
    expect(row[0].aggregation_method).toBe("median");
    expect(row[0].calculated_at).not.toBeNull();
  });

  it("при < 3 клінік лишається ручне значення", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)`);
    await clinicsWithPrices("c1", [17000, 18500]);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 10000, source_type: "manual" });
    // але snapshot із 2 клініками існує — адміністратор його бачить
    expect(await scalar(db, "select clinic_count::int from city_aggregates where city_id='c1' order by seq desc limit 1")).toBe(2);
  });

  it("при < 3 клінік без ручного значення — регіональний fallback", async () => {
    await db.exec(`insert into region_manual_prices (region_id, service_code, tier, value) values ('r1','IMPL','classic',9000)`);
    await clinicsWithPrices("c1", [17000, 18500]);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 9000, source_type: "regional_fallback" });
  });

  it("поріг міста min_clinics перекриває глобальний", async () => {
    await db.exec(`update cities set min_clinics = 2 where id = 'c1'`);
    await clinicsWithPrices("c1", [17000, 18500]);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 17750, source_type: "aggregate", clinic_count: 2 });
  });

  it("глобальний поріг із settings: зміна ставить усе в чергу й перепублікує", async () => {
    await clinicsWithPrices("c1", [17000, 18500]);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toBeNull();
    await db.exec(`update settings set min_clinics = 2`);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ source_type: "aggregate" });
  });

  it("manual_override: ручне значення перемагає навіть при достатньому агрегаті", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)`);
    await clinicsWithPrices("c1", [17000, 18500, 19500]);
    await db.exec(`insert into price_modes (city_id, service_code, tier, mode) values ('c1','IMPL','classic','manual_override')`);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 10000, source_type: "manual_override" });
    // агрегат при цьому рахується
    expect(await scalar(db, "select value::float8 from city_aggregates where city_id='c1' order by seq desc limit 1")).toBe(18500);
  });

  it("режим manual ігнорує агрегат", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)`);
    await clinicsWithPrices("c1", [17000, 18500, 19500]);
    await db.exec(`insert into price_modes (city_id, service_code, tier, mode) values ('c1','IMPL','classic','manual')`);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 10000, source_type: "manual" });
  });

  it("режим manual без ручного значення → регіональний fallback, не агрегат", async () => {
    await db.exec(`insert into region_manual_prices (region_id, service_code, tier, value) values ('r1','IMPL','classic',9000)`);
    await clinicsWithPrices("c1", [17000, 18500, 19500]);
    await db.exec(`insert into price_modes (city_id, service_code, tier, mode) values ('c1','IMPL','classic','manual')`);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 9000, source_type: "regional_fallback" });
  });

  it("повернення в режим auto знову публікує агрегат", async () => {
    await clinicsWithPrices("c1", [17000, 18500, 19500]);
    await db.exec(`insert into price_modes (city_id, service_code, tier, mode) values ('c1','IMPL','classic','manual')`);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toBeNull();
    await db.exec(`update price_modes set mode = 'auto'`);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ source_type: "aggregate", value: 18500 });
  });

  it("публікація не пише нічого, якщо значення не змінилось (історія без шуму)", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)`);
    await drain(db);
    await db.exec(`select recalculate('c1','IMPL','classic'); select recalculate('c1','IMPL','classic');`);
    expect(await scalar(db, "select count(*)::int from published_price_history where location_id='c1'")).toBe(1);
  });

  it("історія публікації: set → set → removed", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)`);
    await drain(db);
    await db.exec(`update city_manual_prices set value = 12000`);
    await drain(db);
    await db.exec(`delete from city_manual_prices`);
    await drain(db);
    const h = await rows<{ change_type: string; value: string | null; previous_value: string | null }>(
      db, "select change_type, value::float8 as value, previous_value::float8 as previous_value from published_price_history where location_id='c1' order by id");
    expect(h).toEqual([
      { change_type: "set", value: 10000, previous_value: null },
      { change_type: "set", value: 12000, previous_value: 10000 },
      { change_type: "removed", value: null, previous_value: 12000 },
    ]);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toBeNull();
  });

  it("ручне значення, змінене людиною, перестає бути демо", async () => {
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value, is_demo) values ('c1','IMPL','classic',10000,true)`);
    await drain(db);
    expect(await scalar(db, "select is_demo from published_prices where location_id='c1'")).toBe(true);
    await db.exec(`update city_manual_prices set value = 10500`);
    await drain(db);
    expect(await scalar(db, "select is_demo from published_prices where location_id='c1'")).toBe(false);
  });

  it("регіональний fallback в EUR конвертується у валюту міста", async () => {
    await db.exec(`insert into region_manual_prices (region_id, service_code, tier, value, currency) values ('r1','HEAL','common',40,'EUR')`);
    await drain(db);
    expect(await published(db, "city", "c1", "HEAL", "common")).toMatchObject({ value: 2000, currency: "UAH" });
  });
});

describe("Валідація рівнів", () => {
  it("нерівнева послуга приймає лише common; рівнева — лише minimum/classic/premium", async () => {
    await expect(db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','HEAL','classic',1)`)).rejects.toThrow();
    await expect(db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','common',1)`)).rejects.toThrow();
    // для нерівневої послуги порожній tier стає common
    await db.exec(`insert into price_modes (city_id, service_code, tier, mode) values ('c1','HEAL','common','auto')`);
  });

  it("ціна клініки: price_from > 0, price_to >= price_from", async () => {
    const id = await addClinic(db, "К", "c1");
    await expect(addPrice(db, id, "IMPL", "classic", 0)).rejects.toThrow();
    await expect(addPrice(db, id, "IMPL", "classic", 100, { priceTo: 50 })).rejects.toThrow();
  });

  it("value = середина діапазону", async () => {
    const id = await addClinic(db, "К", "c1");
    const pid = await addPrice(db, id, "IMPL", "classic", 10000, { priceTo: 14000 });
    expect(await scalar(db, "select value::float8 from clinic_prices where id = $1", [pid])).toBe(12000);
    const pid2 = await addPrice(db, id, "IMPL", "minimum", 8000);
    expect(await scalar(db, "select value::float8 from clinic_prices where id = $1", [pid2])).toBe(8000);
  });

  it("схвалена ціна мусить бути зіставлена (service_code і tier)", async () => {
    const id = await addClinic(db, "К", "c1");
    await expect(db.query(`insert into clinic_prices (clinic_id, price_from, status) values ($1, 100, 'approved')`, [id])).rejects.toThrow();
    await db.query(`insert into clinic_prices (clinic_id, price_from, status) values ($1, 100, 'pending')`, [id]);
  });

  it("підтвердження ціни фіксує verified_at", async () => {
    const id = await addClinic(db, "К", "c1");
    const pid = await addPrice(db, id, "IMPL", "classic", 100, { status: "pending", verifiedAt: null });
    expect(await scalar(db, "select verified_at from clinic_prices where id=$1", [pid])).toBeNull();
    await db.query("update clinic_prices set status = 'approved' where id = $1", [pid]);
    expect(await scalar(db, "select verified_at is not null from clinic_prices where id=$1", [pid])).toBe(true);
  });
});
