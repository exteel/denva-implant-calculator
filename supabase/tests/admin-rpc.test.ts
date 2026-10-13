// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { ADMIN_ID, USER_ID, addClinic, addPrice, freshFixtureDb, one, published, rows, scalar, withRole } from "./harness";

let db: PGlite;
beforeEach(async () => {
  db = await freshFixtureDb();
});
const admin = <T>(fn: () => Promise<T>) => withRole(db, "authenticated", ADMIN_ID, fn);
const call = <T>(sql: string, params: unknown[] = []) => admin(async () => scalar<T>(db, sql, params));

describe("admin_save_clinic_price", () => {
  it("створює картку ціни з причиною в журналі", async () => {
    const clinic = await addClinic(db, "A", "c1");
    const id = await call<string>("select admin_save_clinic_price(null, $1::jsonb, 'внесено вручну')", [
      JSON.stringify({ clinic_id: clinic, service_code: "IMPL", tier: "classic", price_from: 15000, price_to: 17000, currency: "UAH", offer_name: "Імплант X", included_text: "все включено", status: "approved" }),
    ]);
    const p = await one<{ value: string; status: string; verified_at: string | null; offer_name: string }>(db, "select value::float8 as value, status, verified_at, offer_name from clinic_prices where id=$1", [id]);
    expect(p).toMatchObject({ value: 16000, status: "approved", offer_name: "Імплант X" });
    expect(p.verified_at).not.toBeNull();
    expect(await scalar(db, "select reason from audit_log where table_name='clinic_prices' and action='INSERT'")).toBe("внесено вручну");
    expect(await scalar(db, "select actor from audit_log where table_name='clinic_prices' and action='INSERT'")).toBe(ADMIN_ID);
  });

  it("часткове оновлення зачіпає лише передані поля; зміна ставить комбінацію в чергу", async () => {
    const clinic = await addClinic(db, "A", "c1");
    const pid = await addPrice(db, clinic, "IMPL", "classic", 10000);
    await db.exec("delete from recalc_queue");
    await call("select admin_save_clinic_price($1::uuid, $2::jsonb, 'виправлення')", [pid, JSON.stringify({ price_from: 11000, exclude_reason: null, include_in_aggregate: false })]);
    expect(await one(db, "select price_from::float8 as pf, tier, service_code, include_in_aggregate as inc from clinic_prices where id=$1", [pid])).toEqual({ pf: 11000, tier: "classic", service_code: "IMPL", inc: false });
    expect(await scalar(db, "select count(*)::int from recalc_queue where city_id='c1' and service_code='IMPL' and tier='classic'")).toBe(1);
    expect(await scalar(db, "select reason from audit_log where table_name='clinic_prices' and action='UPDATE'")).toBe("виправлення");
  });

  it("валідація працює (price_from > 0); не-адмін отримує відмову", async () => {
    const clinic = await addClinic(db, "A", "c1");
    await expect(call("select admin_save_clinic_price(null, $1::jsonb)", [JSON.stringify({ clinic_id: clinic, price_from: 0 })])).rejects.toThrow();
    await expect(withRole(db, "authenticated", USER_ID, () => db.query("select admin_save_clinic_price(null, '{}'::jsonb)"))).rejects.toThrow(/потрібна роль адміністратора/);
  });
});

describe("admin_upsert_row / admin_delete_row", () => {
  it("створює і частково оновлює місто, клініку, налаштування, послугу з причиною", async () => {
    await call("select admin_upsert_row('cities', $1::jsonb, 'нове місто')", [JSON.stringify({ id: "c9", name: "Нове", region_id: "r2", aliases: ["new"] })]);
    expect(await one(db, "select name, region_id, aliases, currency, active from cities where id='c9'")).toEqual({ name: "Нове", region_id: "r2", aliases: ["new"], currency: "UAH", active: true });
    // нове місто ставить свої комбінації в чергу
    expect(await scalar(db, "select count(*)::int from recalc_queue where city_id='c9'")).toBe(8);

    await call("select admin_upsert_row('cities', $1::jsonb, 'вимкнено')", [JSON.stringify({ id: "c9", active: false })]);
    expect(await one(db, "select name, active from cities where id='c9'")).toEqual({ name: "Нове", active: false });
    expect(await scalar(db, "select reason from audit_log where table_name='cities' and action='UPDATE'")).toBe("вимкнено");

    const c = await call<{ id: string }>("select admin_upsert_row('clinics', $1::jsonb, 'клініка')", [JSON.stringify({ name: "Кл", city_id: "c1", status: "active" })]);
    expect(c.id).toBeTruthy();

    await call("select admin_upsert_row('settings', $1::jsonb, 'поріг')", [JSON.stringify({ min_clinics: 5 })]);
    expect(await scalar(db, "select min_clinics::int from settings")).toBe(5);
    expect(await scalar(db, "select count(*)::int from settings")).toBe(1);

    await call("select admin_upsert_row('services', $1::jsonb)", [JSON.stringify({ service_code: "NEWSVC", name: "Нова", role: "addon", unit: "за зуб" })]);
    await call("select admin_upsert_row('services', $1::jsonb)", [JSON.stringify({ service_code: "NEWSVC", sort: 7 })]);
    expect(await one(db, "select name, sort from services where service_code='NEWSVC'")).toEqual({ name: "Нова", sort: 7 });
  });

  it("білий список таблиць; видалення з причиною", async () => {
    await expect(call("select admin_upsert_row('audit_log', '{}'::jsonb)")).rejects.toThrow(/недоступна/);
    await expect(call("select admin_upsert_row('admin_users', '{}'::jsonb)")).rejects.toThrow(/недоступна/);
    await expect(call("select admin_delete_row('settings', 'true')")).rejects.toThrow(/недоступна/);
    const clinic = await addClinic(db, "A", "c1");
    await call("select admin_delete_row('clinics', $1, 'дубль')", [clinic]);
    expect(await scalar(db, "select count(*)::int from clinics")).toBe(0);
    expect(await scalar(db, "select reason from audit_log where table_name='clinics' and action='DELETE'")).toBe("дубль");
  });
});

describe("recalculate_city", () => {
  it("перераховує всі комбінації міста одразу й чистить чергу", async () => {
    for (const [i, p] of [17000, 18500, 19500].entries()) await addPrice(db, await addClinic(db, `K${i}`, "c1"), "IMPL", "classic", p);
    await db.exec("update settings set min_clinics = 3; delete from recalc_queue;");
    expect(await call<number>("select recalculate_city('c1')")).toBe(8);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 18500, source_type: "aggregate" });
    expect(await scalar(db, "select count(*)::int from recalc_queue")).toBe(0);
    // кожна комбінація отримала snapshot
    expect(await scalar(db, "select count(distinct service_code || tier)::int from city_aggregates where city_id='c1'")).toBe(8);
    await expect(call("select recalculate_city('nope')")).rejects.toThrow(/Невідоме місто/);
  });
});

describe("import_clinic_prices: повторне використання клініки", () => {
  const payload = (name: string, city = "c1") => JSON.stringify({
    file_name: "f.xlsx",
    clinic: { clinic_id: null, name, city_id: city, contacts: null, valid_from: null, currency: "UAH" },
    rows: [{ row_number: 1, offer_name: "o", brand_material: null, price_from: 100, price_to: null, currency: "UAH", included_text: null, exclusions: null, source: null, service_code: "HEAL", tier: "common" }],
  });

  it("та сама назва (без урахування регістру) у тому ж місті → існуюча клініка", async () => {
    const existing = await addClinic(db, "Дент Плюс", "c1");
    const r = await call<{ clinic_id: string }>("select import_clinic_prices($1::jsonb)", [payload("  дЕНТ плюс ")]);
    expect(r.clinic_id).toBe(existing);
    expect(await scalar(db, "select count(*)::int from clinics")).toBe(1);
  });

  it("інше місто або інша назва → нова чернетка", async () => {
    await addClinic(db, "Дент Плюс", "c1");
    await call("select import_clinic_prices($1::jsonb)", [payload("Дент Плюс", "c2")]);
    await call("select import_clinic_prices($1::jsonb)", [payload("Інша")]);
    expect(await scalar(db, "select count(*)::int from clinics")).toBe(3);
  });

  it("повторний імпорт без clinic_id не створює дубль клініки й ловить дублікати рядків", async () => {
    const first = await call<{ clinic_id: string; accepted: number[] }>("select import_clinic_prices($1::jsonb)", [payload("Нова")]);
    const second = await call<{ clinic_id: string; duplicates: number[] }>("select import_clinic_prices($1::jsonb)", [payload("Нова")]);
    expect(second.clinic_id).toBe(first.clinic_id);
    expect(second.duplicates).toEqual([1]);
    expect(await rows(db, "select 1 from clinics")).toHaveLength(1);
  });
});
