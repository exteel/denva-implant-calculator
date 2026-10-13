// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addClinic, addPrice, drain, freshFixtureDb, queueKeys, scalar } from "./harness";

let db: PGlite;
beforeEach(async () => {
  db = await freshFixtureDb();
});

describe("Події перерахунку ставлять у чергу лише зачеплені комбінації (ТЗ §3, §9)", () => {
  it("зміна однієї ціни клініки → лише її місто/послуга/tier", async () => {
    const a = await addClinic(db, "A", "c1");
    const pid = await addPrice(db, a, "IMPL", "classic", 10000);
    await addPrice(db, await addClinic(db, "B", "c2"), "IMPL", "classic", 12000);
    await addPrice(db, a, "CROWN", "classic", 7000);
    await drain(db);
    expect(await queueKeys(db)).toEqual([]);

    await db.query("update clinic_prices set price_from = 11000 where id = $1", [pid]);
    expect(await queueKeys(db)).toEqual(["c1/IMPL/classic"]);
  });

  it("додавання і видалення ціни — теж лише своя комбінація", async () => {
    const a = await addClinic(db, "A", "c1");
    await drain(db);
    const pid = await addPrice(db, a, "IMPL", "premium", 30000);
    expect(await queueKeys(db)).toEqual(["c1/IMPL/premium"]);
    await drain(db);
    await db.query("delete from clinic_prices where id = $1", [pid]);
    expect(await queueKeys(db)).toEqual(["c1/IMPL/premium"]);
  });

  it("зміна tier ціни ставить у чергу і старий, і новий рівень (зіставлення service_code/tier)", async () => {
    const a = await addClinic(db, "A", "c1");
    const pid = await addPrice(db, a, "IMPL", "classic", 10000);
    await drain(db);
    await db.query("update clinic_prices set tier = 'premium' where id = $1", [pid]);
    expect(await queueKeys(db)).toEqual(["c1/IMPL/classic", "c1/IMPL/premium"]);
  });

  it("підтвердження / відхилення ціни → тільки її комбінація", async () => {
    const a = await addClinic(db, "A", "c1");
    const pid = await addPrice(db, a, "HEAL", "common", 1800, { status: "pending", verifiedAt: null });
    await drain(db);
    await db.query("update clinic_prices set status = 'approved' where id = $1", [pid]);
    expect(await queueKeys(db)).toEqual(["c1/HEAL/common"]);
  });

  it("зміна статусу клініки → усі комбінації її цін у її місті, більше нічого", async () => {
    const a = await addClinic(db, "A", "c1");
    await addPrice(db, a, "IMPL", "classic", 10000);
    await addPrice(db, a, "CROWN", "minimum", 6000);
    await addPrice(db, await addClinic(db, "B", "c1"), "HEAL", "common", 1800);
    await drain(db);
    await db.query("update clinics set status = 'excluded' where id = $1", [a]);
    expect(await queueKeys(db)).toEqual(["c1/CROWN/minimum", "c1/IMPL/classic"]);
  });

  it("зміна назви клініки нічого не ставить у чергу", async () => {
    const a = await addClinic(db, "A", "c1");
    await addPrice(db, a, "IMPL", "classic", 10000);
    await drain(db);
    await db.query("update clinics set name = 'Нова назва', contacts = 'x' where id = $1", [a]);
    expect(await queueKeys(db)).toEqual([]);
  });

  it("ручний міський орієнтир і режим — лише своя комбінація", async () => {
    await db.exec("insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',1)");
    expect(await queueKeys(db)).toEqual(["c1/IMPL/classic"]);
    await drain(db);
    await db.exec("insert into price_modes (city_id, service_code, tier, mode) values ('c2','CROWN','premium','manual')");
    expect(await queueKeys(db)).toEqual(["c2/CROWN/premium"]);
  });

  it("регіональний орієнтир → усі міста області для цієї комбінації, не чужі області", async () => {
    await db.exec("insert into region_manual_prices (region_id, service_code, tier, value) values ('r1','IMPL','classic',9000)");
    expect(await queueKeys(db)).toEqual(["c1/IMPL/classic", "c2/IMPL/classic"]);
  });

  it("зміна порогу / методу / застарілості → усі комбінації активних міст; решта налаштувань — нічого", async () => {
    await db.exec("update settings set deviation_warning_pct = 40");
    expect(await queueKeys(db)).toEqual([]);
    await db.exec("update settings set aggregation_method = 'arithmetic_mean'");
    // 3 міста × (IMPL×3 + CROWN×3 + HEAL + SCAN) = 3 × 8
    expect(await scalar(db, "select count(*)::int from recalc_queue")).toBe(24);
  });

  it("новий курс EUR → лише комбінації, де є ціни в EUR", async () => {
    await addPrice(db, await addClinic(db, "A", "c1"), "IMPL", "classic", 300, { currency: "EUR" });
    await addPrice(db, await addClinic(db, "B", "c1"), "CROWN", "classic", 7000);
    await drain(db);
    await db.exec("insert into currency_rates (currency, rate_to_uah, rate_date) values ('EUR', 51, '2026-10-12')");
    expect(await queueKeys(db)).toEqual(["c1/IMPL/classic"]);
    await drain(db);
    await db.exec("insert into currency_rates (currency, rate_to_uah, rate_date) values ('USD', 41, '2026-10-12')");
    expect(await queueKeys(db)).toEqual([]);
  });

  it("нове місто ставить у чергу свої комбінації; зміна порогу міста — лише цього міста", async () => {
    await drain(db);
    await db.exec("update cities set min_clinics = 2 where id = 'c1'");
    expect(await scalar(db, "select count(distinct city_id)::int from recalc_queue")).toBe(1);
    await drain(db);
    await db.exec("insert into cities (id, name, region_id) values ('c4','Нове','r2')");
    expect(await queueKeys(db)).toHaveLength(8);
  });

  it("черга дедуплікується, а обробка — ідемпотентна", async () => {
    const a = await addClinic(db, "A", "c1");
    const pid = await addPrice(db, a, "IMPL", "classic", 10000);
    await db.query("update clinic_prices set price_from = 10100 where id = $1", [pid]);
    await db.query("update clinic_prices set price_from = 10200 where id = $1", [pid]);
    expect(await scalar(db, "select count(*)::int from recalc_queue")).toBe(1);
    expect(await drain(db)).toBe(1);
    expect(await drain(db)).toBe(0);
    await db.exec("select recalculate('c1','IMPL','classic')");
    await db.exec("select recalculate('c1','IMPL','classic')");
    expect(await scalar(db, "select count(*)::int from published_prices")).toBe(0); // 1 клініка, джерел немає
  });

  it("process_recalc_queue(max) обмежує партію", async () => {
    await db.exec("update settings set min_clinics = 2");
    expect(await scalar(db, "select process_recalc_queue(5)")).toBe(5);
    expect(await scalar(db, "select count(*)::int from recalc_queue")).toBe(19);
  });
});
