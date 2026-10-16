// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type {
  AdminPriceMatrixRow,
  AggregateDetail,
  ImportPayload,
  ImportReport,
  ListLocationsResponse,
  LocationPricesResponse,
} from "../../src/lib/contracts";
import {
  ADMIN_ID, USER_ID, addClinic, addPrice, drain, freshFixtureDb, one, published, rows, scalar, withRole,
} from "./harness";

let db: PGlite;
beforeEach(async () => {
  db = await freshFixtureDb();
});

const anon = <T>(fn: () => Promise<T>) => withRole(db, "anon", undefined, fn);
const admin = <T>(fn: () => Promise<T>) => withRole(db, "authenticated", ADMIN_ID, fn);

describe("Публічне читання (anon)", () => {
  beforeEach(async () => {
    await db.exec(`
      insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000);
      insert into region_manual_prices (region_id, service_code, tier, value) values ('r1','HEAL','common',1800);
      update services set included_text = 'Імплант і анестезія' where service_code = 'IMPL';`);
    for (const [i, p] of [17000, 18500, 19500].entries()) {
      await addPrice(db, await addClinic(db, `Секретна клініка ${i}`, "c1", { network: "secret-net" }), "CROWN", "classic", p);
    }
    await drain(db);
  });

  it("list_locations: активні міста та області у формі PublicLocation", async () => {
    await db.exec("update cities set active = false where id = 'c3'");
    const res = await anon(async () => (await one<{ list_locations: ListLocationsResponse }>(db, "select list_locations()")).list_locations);
    const cities = res.filter((l) => l.kind === "city");
    const regions = res.filter((l) => l.kind === "region");
    expect(cities.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect(regions.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
    expect(cities.find((c) => c.id === "c1")).toEqual({
      kind: "city", id: "c1", slug: "c1", name: "Місто 1", region_id: "r1", region_name: "Область 1", aliases: ["c-one"],
    });
    expect(regions[0]).toEqual({ kind: "region", id: expect.any(String), slug: expect.any(String), name: expect.any(String), region_id: null, region_name: null, aliases: [] });
  });

  it("get_location_prices (місто): форма LocationPricesResponse, лише опубліковане", async () => {
    const res = await anon(async () =>
      (await one<{ r: LocationPricesResponse }>(db, "select get_location_prices('city','c1') as r")).r);
    expect(Object.keys(res).sort()).toEqual(["currency", "eur_rate", "location", "prices", "services"]);
    expect(res.location).toMatchObject({ kind: "city", id: "c1", region_id: "r1" });
    expect(res.currency).toBe("UAH");
    expect(res.eur_rate).toEqual({ rate: 50, date: "2026-10-09" });
    expect(res.services.map((s) => s.service_code)).toEqual(["IMPL", "CROWN", "HEAL", "SCAN"]);
    expect(res.services[0]).toEqual({
      service_code: "IMPL", name: "Імплант", category: "Імплантація", role: "implant", unit: "за імплант", tiered: true,
      tier_source: "implant_tier", additional: false, included_text: "Імплант і анестезія", sort: 10,
    });
    const byKey = Object.fromEntries(res.prices.map((p) => [`${p.service_code}/${p.tier}`, p]));
    expect(byKey["IMPL/classic"]).toEqual({
      service_code: "IMPL", tier: "classic", value: 10000, currency: "UAH", source_type: "manual_baseline", source_scope: "city",
      local_clinic_count: 0, baseline_scope: "city", blend_weights: null, calculated_at: null,
      published_at: expect.any(String), is_demo: false,
    });
    expect(byKey["CROWN/classic"]).toMatchObject({
      value: 18500, source_type: "aggregate", source_scope: "city", local_clinic_count: 3, baseline_scope: null, blend_weights: null,
    });
    expect(typeof byKey["CROWN/classic"].calculated_at).toBe("string");
    expect(typeof byKey["CROWN/classic"].published_at).toBe("string");
    expect(byKey["HEAL/common"]).toMatchObject({ value: 1800, source_type: "regional_fallback", source_scope: "region", baseline_scope: "region" });
    expect(res.prices).toHaveLength(3);
  });

  it("get_location_prices НЕ містить даних клінік", async () => {
    const res = await anon(async () =>
      (await one<{ r: unknown }>(db, "select get_location_prices('city','c1') as r")).r);
    const text = JSON.stringify(res);
    expect(text).not.toContain("Секретна");
    expect(text).not.toContain("secret-net");
    expect(text).not.toMatch(/clinic_id|clinic_name|network|price_from|included_ids|excluded|override_reason/);
  });

  it("get_location_prices (область) повертає лише рядки цієї області", async () => {
    const res = await anon(async () =>
      (await one<{ r: LocationPricesResponse }>(db, "select get_location_prices('region','r1') as r")).r);
    expect(res.location.kind).toBe("region");
    expect(res.location).toMatchObject({ slug: "r1", region_id: null });
    expect(res.prices.map((p) => `${p.service_code}/${p.tier}/${p.source_type}/${p.source_scope}`)).toEqual(["HEAL/common/regional_fallback/region"]);
  });

  it("невідома або неактивна локація → помилка; ціни неактивних послуг не повертаються", async () => {
    await expect(anon(() => db.query("select get_location_prices('city','nope')"))).rejects.toThrow(/не знайдено/);
    await expect(anon(() => db.query("select get_location_prices('planet','c1')"))).rejects.toThrow();
    await db.exec("update services set active = false where service_code = 'IMPL'");
    const res = await anon(async () =>
      (await one<{ r: LocationPricesResponse }>(db, "select get_location_prices('city','c1') as r")).r);
    expect(res.services.map((s) => s.service_code)).not.toContain("IMPL");
    expect(res.prices.map((p) => p.service_code)).not.toContain("IMPL");
  });

  it("eur_rate = null, якщо курсу немає", async () => {
    await db.exec("delete from currency_rates");
    const res = await anon(async () =>
      (await one<{ r: LocationPricesResponse }>(db, "select get_location_prices('city','c1') as r")).r);
    expect(res.eur_rate).toBeNull();
  });
});

describe("RLS і права", () => {
  it("anon не має прямого доступу до жодної таблиці й вигляду", async () => {
    const tables = [
      "regions", "cities", "services", "clinics", "clinic_prices", "city_manual_prices", "region_manual_prices",
      "price_modes", "settings", "currency_rates", "city_aggregates", "published_prices", "published_price_history",
      "recalc_queue", "audit_log", "leads", "admin_users", "import_batches", "admin_price_matrix", "admin_clinic_prices",
      "country_manual_prices",
    ];
    for (const t of tables) {
      await expect(anon(() => db.query(`select * from ${t}`)), t).rejects.toThrow(/permission denied/);
    }
  });

  it("anon не може викликати внутрішні та адмін-функції", async () => {
    for (const fn of [
      "recalculate('c1','IMPL','classic')", "compute_aggregate('c1','IMPL','classic')", "process_recalc_queue()",
      "submit_lead_record('{}'::jsonb)", "admin_aggregate_detail('c1','IMPL','classic')", "mark_stale_prices()",
      "publish_price('c1','IMPL','classic')", "recalculate_city('c1')", "import_clinic_prices('{}'::jsonb)",
      "admin_set_country_manual_price('UA','IMPL','classic',1)",
    ]) {
      await expect(anon(() => db.query(`select ${fn}`)), fn).rejects.toThrow(/permission denied/);
    }
  });

  it("залогінений не-адмін нічого не бачить і не змінює", async () => {
    await db.exec("insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',1000)");
    await drain(db);
    await withRole(db, "authenticated", USER_ID, async () => {
      expect(await scalar(db, "select count(*)::int from city_manual_prices")).toBe(0);
      expect(await scalar(db, "select count(*)::int from published_prices")).toBe(0);
      expect(await scalar(db, "select count(*)::int from audit_log")).toBe(0);
      await expect(db.exec("insert into clinics (name, city_id) values ('x','c1')")).rejects.toThrow(/row-level security/);
      await expect(db.query("select recalculate_now('c1','IMPL','classic')")).rejects.toThrow(/потрібна роль адміністратора/);
      await expect(db.query("select import_clinic_prices('{}'::jsonb)")).rejects.toThrow(/потрібна роль адміністратора/);
      await expect(db.query("select admin_aggregate_detail('c1','IMPL','classic')")).rejects.toThrow(/потрібна роль адміністратора/);
    });
  });

  it("адмін має CRUD на адмін-таблицях, читає snapshot-и, але не змінює їх і published_prices", async () => {
    await admin(async () => {
      await db.exec("insert into clinics (name, city_id) values ('Нова','c1')");
      await db.exec("insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',1000)");
      await db.exec("update cities set name = 'Місто один' where id = 'c1'");
      expect(await scalar(db, "select count(*)::int from clinics")).toBe(1);
      expect(await scalar(db, "select count(*)::int from admin_price_matrix")).toBe(24);
    });
    await drain(db);
    await admin(async () => {
      expect(await scalar(db, "select count(*)::int from city_aggregates")).toBeGreaterThan(0);
      expect(await scalar(db, "select count(*)::int from published_prices")).toBe(1);
      await expect(db.exec("insert into city_aggregates (city_id, service_code, tier, clinic_count, method) values ('c1','IMPL','classic',0,'median')")).rejects.toThrow(/permission denied/);
      await expect(db.exec("update city_aggregates set clinic_count = 1")).rejects.toThrow(/permission denied/);
      await expect(db.exec("delete from city_aggregates")).rejects.toThrow(/permission denied/);
      await expect(db.exec("update published_prices set value = 1")).rejects.toThrow(/permission denied/);
      await expect(db.exec("update audit_log set reason = 'x'")).rejects.toThrow(/permission denied/);
      await expect(db.exec("insert into leads (payload, phone, intent) values ('{}', '1', 'refine')")).rejects.toThrow(/permission denied/);
      await expect(db.exec("delete from settings")).rejects.toThrow(/permission denied/);
    });
  });
});

describe("admin_price_matrix", () => {
  it("рядків = активні міста × застосовні рівні (tiered → 3, інакше common)", async () => {
    const all = await admin(() => rows<AdminPriceMatrixRow>(db, "select * from admin_price_matrix"));
    expect(all).toHaveLength(3 * (3 + 3 + 1 + 1));
    await db.exec("update cities set active = false where id = 'c3'; update services set active = false where service_code = 'SCAN';");
    const fewer = await admin(() => rows<AdminPriceMatrixRow>(db, "select * from admin_price_matrix"));
    expect(fewer).toHaveLength(2 * (3 + 3 + 1));
    const tiers = new Set(fewer.filter((r) => r.service_code === "HEAL").map((r) => r.tier));
    expect([...tiers]).toEqual(["common"]);
  });

  it("містить baselines міста/області/України, локальну вибірку, ваги й опубліковане значення", async () => {
    await db.exec(`
      insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',18000);
      insert into region_manual_prices (region_id, service_code, tier, value) values ('r1','IMPL','classic',17000);
      insert into country_manual_prices (service_code, tier, value) values ('IMPL','classic',16000);`);
    for (const p of [17500, 19000]) await addPrice(db, await addClinic(db, `K${p}`, "c1"), "IMPL", "classic", p);
    await drain(db);
    // to_jsonb: як PostgREST, numeric → JSON-число
    const row = (await admin(() => rows<{ r: AdminPriceMatrixRow }>(db,
      "select to_jsonb(m) as r from admin_price_matrix m where city_id='c1' and service_code='IMPL' and tier='classic'")))[0].r;
    expect(row).toMatchObject({
      city_name: "Місто 1", service_name: "Імплант", mode: "auto", override_value: null,
      city_baseline: 18000, region_baseline: 17000, country_baseline: 16000,
      local_clinic_count: 2, local_median: 18250, baseline_value: 18000, baseline_scope: "city",
      published_source_type: "hybrid",
    });
    expect(row.published_value).toBeCloseTo((2 * 18250 + 18000) / 3, 6);
    expect(row.blend_weights!.local).toBeCloseTo(2 / 3, 12);
    expect(row.published_at).not.toBeNull();
    expect(Object.keys(row).sort()).toEqual([
      "baseline_scope", "baseline_value", "blend_weights", "city_baseline", "city_id", "city_name", "country_baseline",
      "local_clinic_count", "local_median", "mode", "override_value", "published_at", "published_source_type",
      "published_value", "region_baseline", "service_code", "service_name", "tier",
    ]);
  });

  it("режим override і порожній рядок без snapshot-а", async () => {
    await admin(() => db.exec("select admin_set_price_mode('c1','IMPL','classic','manual_override', 21000, 'аномалія')"));
    await drain(db);
    const rowsAll = await admin(() => rows<{ r: AdminPriceMatrixRow }>(db,
      "select to_jsonb(m) as r from admin_price_matrix m where city_id='c1' and service_code in ('IMPL','HEAL') and tier in ('classic','common')"));
    const byCode = Object.fromEntries(rowsAll.map((x) => [x.r.service_code, x.r]));
    expect(byCode.IMPL).toMatchObject({ mode: "manual_override", override_value: 21000, published_value: 21000, published_source_type: "manual_override" });
    expect(byCode.HEAL).toMatchObject({ mode: "auto", local_clinic_count: 0, local_median: null, published_value: null, blend_weights: null });
  });
});

describe("admin_aggregate_detail", () => {
  it("повертає snapshot, включені та виключені з причинами", async () => {
    const a = await addClinic(db, "Альфа", "c1");
    const b = await addClinic(db, "Бета", "c1", { status: "draft" });
    await addPrice(db, a, "IMPL", "classic", 10000);
    await addPrice(db, b, "IMPL", "classic", 20000);
    await drain(db);
    const d = await admin(async () => (await one<{ d: AggregateDetail }>(db, "select admin_aggregate_detail('c1','IMPL','classic') as d")).d);
    expect(d.snapshot).toMatchObject({
      value: 10000, local_clinic_count: 1, local_median: 10000, baseline_value: null, baseline_scope: null,
      blend_weights: { local: 1, baseline: 0 },
    });
    expect(d.snapshot!.formula).toMatch(/базового орієнтира немає/);
    expect(d.included).toHaveLength(1);
    expect(d.included[0]).toMatchObject({ clinic_name: "Альфа", value_uah: 10000 });
    expect(d.excluded).toHaveLength(1);
    expect(d.excluded[0]).toMatchObject({ clinic_name: "Бета", reason: "клініка неактивна", value_uah: 20000 });
  });

  it("без snapshot-а — snapshot: null", async () => {
    const d = await admin(async () => (await one<{ d: AggregateDetail }>(db, "select admin_aggregate_detail('c1','HEAL','common') as d")).d);
    expect(d).toEqual({ snapshot: null, included: [], excluded: [] });
  });
});

describe("Контроль якості: admin_clinic_prices", () => {
  it("відхилення від агрегату у % і попередження понад поріг", async () => {
    const ids: string[] = [];
    for (const p of [10000, 10000, 10000, 20000]) {
      ids.push(await addPrice(db, await addClinic(db, `K${ids.length}`, "c1"), "IMPL", "classic", p));
    }
    await drain(db); // медіана = 10000
    const r = await admin(() => rows<{ clinic_price_id: string; deviation_pct: string; warning: boolean; clinic_name: string; city_name: string }>(db,
      "select clinic_price_id, deviation_pct::float8 as deviation_pct, warning, clinic_name, city_name from admin_clinic_prices order by value"));
    expect(r.map((x) => [x.deviation_pct, x.warning])).toEqual([[0, false], [0, false], [0, false], [100, true]]);
    expect(r[3]).toMatchObject({ clinic_name: "K3", city_name: "Місто 1" });
    await db.exec("update settings set deviation_warning_pct = 150");
    const r2 = await admin(() => rows<{ warning: boolean }>(db, "select warning from admin_clinic_prices where deviation_pct = 100"));
    expect(r2[0].warning).toBe(false);
  });

  it("працює, навіть якщо курсу для ціни немає (відхилення null)", async () => {
    await db.exec("delete from currency_rates where currency='EUR'");
    await addPrice(db, await addClinic(db, "A", "c1"), "IMPL", "classic", 300, { currency: "EUR" });
    const r = await admin(() => rows<{ deviation_pct: string | null; warning: boolean }>(db, "select deviation_pct, warning from admin_clinic_prices"));
    expect(r).toEqual([{ deviation_pct: null, warning: false }]);
  });
});

describe("import_clinic_prices (ТЗ §7.4, §8; шаблон v3)", () => {
  const row = (n: number, over: Record<string, unknown> = {}) => ({
    row_number: n, service_code: "IMPL", category: "Імплантація", service_name: `Позиція ${n}`, unit: "за імплант", tier: "classic",
    price_from: 18000, price_to: null, currency: "UAH", included_text: null, exclusions: null, valid_from: null, note: null, ...over,
  });
  const payload = (rowsArr: unknown[], clinic: Partial<ImportPayload["clinic"]> = {}): ImportPayload => ({
    file_name: "clinic.xlsx",
    clinic: {
      clinic_id: null, name: "Імпортна клініка", city_id: "c1", region: "Область 1", address: "вул. Тестова, 1",
      contact_person: "Іван", contacts: "+380", valid_from: "2026-10-01", dental_tender: true,
      public_profile_consent: false, data_confirmed: true, ...clinic,
    },
    rows: rowsArr as ImportPayload["rows"],
  });
  const run = (p: ImportPayload) => admin(async () => (await one<{ r: ImportReport }>(db, "select import_clinic_prices($1::jsonb) as r", [JSON.stringify(p)])).r);

  it("створює чернетку клініки й повертає протокол: прийняті, помилки, дублікати, невідомі коди, порожні", async () => {
    const report = await run(payload([
      row(16),
      row(17, { tier: "premium", price_from: 28000, price_to: 32000 }),
      row(18, { price_from: 0 }),
      row(19, { price_from: 5000, price_to: 4000 }),
      row(20, { currency: "RUB" }),
      row(21, { service_code: "NOPE" }),
      row(22),                                          // дублікат рядка 16 у файлі
      row(23, { service_code: null, tier: null }),      // ще не зіставлено — на модерацію
      row(24, { service_code: "HEAL", tier: "common", price_from: 1800, currency: "EUR" }),
      row(25, { tier: "bogus" }),
      row(26, { service_code: "HEAL", tier: "classic" }),
      row(27, { price_from: "abc" }),
      row(28, { price_from: null }),                    // порожній рядок шаблону
      row(29, { price_from: null, price_to: 5000 }),    // без «Ціна від» — теж порожній
      row(30, { price_from: "" }),
      row(31, { valid_from: "2026-13-45" }),
    ]));
    expect(report.accepted).toEqual([16, 17, 23, 24]);
    expect(report.pending_moderation).toEqual([16, 17, 23, 24]);
    expect(report.duplicates).toEqual([22]);
    expect(report.unknown_service_code).toEqual([21]);
    expect(report.skipped_empty).toEqual([28, 29, 30]);
    expect(report.errors.map((e) => e.row_number)).toEqual([18, 19, 20, 25, 26, 27, 31]);
    expect(report.errors.find((e) => e.row_number === 18)?.message).toMatch(/більше нуля/);
    expect(report.errors.find((e) => e.row_number === 20)?.message).toMatch(/валюта/);

    const clinic = await one<Record<string, unknown>>(db,
      `select name, status, city_id, region, address, contact_person, contacts, dental_tender, public_profile_consent, data_confirmed
         from clinics where id = $1`, [report.clinic_id]);
    expect(clinic).toEqual({
      name: "Імпортна клініка", status: "draft", city_id: "c1", region: "Область 1", address: "вул. Тестова, 1",
      contact_person: "Іван", contacts: "+380", dental_tender: true, public_profile_consent: false, data_confirmed: true,
    });
    const prices = await rows<{ status: string; import_batch_id: string; verified_at: string | null }>(
      db, "select status, import_batch_id, verified_at from clinic_prices where clinic_id = $1", [report.clinic_id]);
    expect(prices).toHaveLength(4);
    expect(new Set(prices.map((p) => p.status))).toEqual(new Set(["pending"]));
    expect(new Set(prices.map((p) => p.import_batch_id))).toEqual(new Set([report.batch_id]));
    expect(await scalar(db, "select report -> 'skipped_empty' from import_batches where id = $1", [report.batch_id])).toEqual([28, 29, 30]);
    expect(await scalar(db, "select value::float8 from clinic_prices where offer_name = 'Позиція 17'")).toBe(30000);
    expect(await scalar(db, "select count(*)::int from clinic_prices where offer_name in ('Позиція 28', 'Позиція 29')")).toBe(0);
  });

  it("дата чинності й примітка з рядка переносяться; валюта береться з рядка", async () => {
    const report = await run(payload([row(16, { valid_from: "2026-09-15", note: "https://clinic.example/price", currency: "USD", price_from: 450 })]));
    const p = await one<{ valid_from: string; source_url: string; currency: string }>(db,
      "select valid_from::text as valid_from, source_url, currency from clinic_prices where clinic_id = $1", [report.clinic_id]);
    expect(p).toEqual({ valid_from: "2026-09-15", source_url: "https://clinic.example/price", currency: "USD" });
  });

  it("повторний імпорт того самого файлу → усе дублікати (існуючі pending/approved), клініка та сама", async () => {
    const first = await run(payload([row(16), row(17, { tier: "minimum" })]));
    expect(first.accepted).toEqual([16, 17]);
    const second = await run(payload([row(16), row(17, { tier: "minimum" })]));   // без clinic_id: пошук за містом і назвою
    expect(second.accepted).toEqual([]);
    expect(second.duplicates).toEqual([16, 17]);
    expect(second.clinic_id).toBe(first.clinic_id);
    expect(await scalar(db, "select count(*)::int from clinics")).toBe(1);
  });

  it("повторний імпорт не знімає згоду/прапорці, а лише вмикає їх", async () => {
    const first = await run(payload([row(16)], { public_profile_consent: true }));
    await run(payload([row(17, { tier: "minimum" })], { public_profile_consent: false, dental_tender: false }));
    expect(await one(db, "select dental_tender, public_profile_consent from clinics where id = $1", [first.clinic_id])).toEqual({ dental_tender: true, public_profile_consent: true });
  });

  it("відхилена ціна не вважається дублікатом", async () => {
    const first = await run(payload([row(16)]));
    await db.exec("update clinic_prices set status = 'rejected'");
    const second = await run(payload([row(16)], { clinic_id: first.clinic_id }));
    expect(second.accepted).toEqual([16]);
  });

  it("імпортовані рядки не впливають на агрегати й опубліковані ціни до підтвердження", async () => {
    await db.exec("insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)");
    const report = await run(payload([row(16, { price_from: 99999 })]));
    // навіть якщо клініку активувати, ціна лишається pending
    await db.query("update clinics set status = 'active' where id = $1", [report.clinic_id]);
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 10000, source_type: "manual_baseline", local_clinic_count: 0 });
    const snap = await one<{ clinic_count: number; excluded: { reason: string }[] }>(db,
      "select clinic_count, excluded from city_aggregates where city_id='c1' and service_code='IMPL' and tier='classic' order by seq desc limit 1");
    expect(snap.clinic_count).toBe(0);
    expect(snap.excluded.map((e) => e.reason)).toEqual(["ціна не підтверджена"]);

    // після підтвердження модератором — 1 клініка → гібрид ⅓ · 99999 + ⅔ · 10000
    await admin(() => db.query("select admin_set_clinic_price_status(array(select id from clinic_prices), 'approved', 'перевірено')"));
    await drain(db);
    const p = await one<{ value: number; source_type: string; local_clinic_count: number }>(db,
      "select value::float8 as value, source_type, local_clinic_count from published_prices where location_id='c1' and service_code='IMPL'");
    expect(p.source_type).toBe("hybrid");
    expect(p.local_clinic_count).toBe(1);
    expect(p.value).toBeCloseTo((99999 + 2 * 10000) / 3, 6);
  });

  it("помилки рівня файлу: невідоме місто / клініка", async () => {
    await expect(run(payload([row(16)], { city_id: "nope" }))).rejects.toThrow(/Місто nope не знайдено/);
    await expect(run(payload([row(16)], { clinic_id: "00000000-0000-4000-8000-000000000999" }))).rejects.toThrow(/Клініку/);
  });
});

describe("Журнал змін (audit_log)", () => {
  it("фіксує автора, старе/нове значення і причину", async () => {
    await admin(async () => {
      await db.exec("select admin_set_city_manual_price('c1','IMPL','classic', 10000, null, null, 'початкове значення')");
      await db.exec("select admin_set_city_manual_price('c1','IMPL','classic', 12000, null, null, 'інфляція')");
      await db.exec("select admin_set_city_manual_price('c1','IMPL','classic', null, null, null, 'прибрано')");
    });
    const log = await rows<{ action: string; actor: string; reason: string; old_value: string | null; new_value: string | null }>(db,
      `select action, actor, reason, (old_data->>'value') as old_value, (new_data->>'value') as new_value
         from audit_log where table_name = 'city_manual_prices' order by id`);
    expect(log.map((l) => [l.action, l.reason, l.old_value, l.new_value])).toEqual([
      ["INSERT", "початкове значення", null, "10000.00"],
      ["UPDATE", "інфляція", "10000.00", "12000.00"],
      ["DELETE", "прибрано", "12000.00", null],
    ]);
    expect(new Set(log.map((l) => l.actor))).toEqual(new Set([ADMIN_ID]));
  });

  it("логує зміни налаштувань, клінік і ціни без причини (reason = null)", async () => {
    await admin(async () => {
      await db.exec("update settings set min_clinics = 4");
      await db.exec("insert into clinics (name, city_id) values ('Нова','c1')");
    });
    expect(await scalar(db, "select count(*)::int from audit_log where table_name = 'settings' and action = 'UPDATE'")).toBe(1);
    expect(await scalar(db, "select reason from audit_log where table_name = 'clinics'")).toBeNull();
    // зміна, що нічого не міняє, не пишеться
    await db.exec("update settings set min_clinics = 4");
    expect(await scalar(db, "select count(*)::int from audit_log where table_name = 'settings'")).toBe(1);
  });

  it("admin_set_clinic_price_status змінює статуси пачкою з причиною", async () => {
    const a = await addClinic(db, "A", "c1");
    const p1 = await addPrice(db, a, "IMPL", "classic", 1000, { status: "pending", verifiedAt: null });
    const p2 = await addPrice(db, a, "IMPL", "premium", 2000, { status: "pending", verifiedAt: null });
    const n = await admin(async () => scalar<number>(db, "select admin_set_clinic_price_status($1::uuid[], 'rejected', 'не наш рівень')", [`{${p1},${p2}}`]));
    expect(n).toBe(2);
    expect(await scalar(db, "select count(*)::int from audit_log where table_name='clinic_prices' and reason='не наш рівень'")).toBe(2);
  });
});

describe("Заявки (leads)", () => {
  const lead = (phone: string, intent = "refine") => JSON.stringify({ intent, phone, location: { kind: "city", id: "c1", name: "Місто 1" } });
  const submit = (phone: string, intent?: string) =>
    withRole(db, "service_role", undefined, async () =>
      (await one<{ r: { lead_id: string } }>(db, "select submit_lead_record($1::jsonb) as r", [lead(phone, intent)])).r);

  it("зберігає заявку; service_role може, anon і authenticated — ні", async () => {
    const r = await submit("+380 (67) 123-45-67");
    const l = await one<{ phone: string; phone_digits: string; telegram_status: string; location_id: string; intent: string; attempts: number }>(
      db, "select phone, phone_digits, telegram_status, location_id, intent, attempts from leads where id = $1", [r.lead_id]);
    expect(l).toEqual({ phone: "+380 (67) 123-45-67", phone_digits: "380671234567", telegram_status: "pending", location_id: "c1", intent: "refine", attempts: 0 });
    await expect(anon(() => db.query("select submit_lead_record('{}'::jsonb)"))).rejects.toThrow(/permission denied/);
    await expect(admin(() => db.query("select submit_lead_record('{}'::jsonb)"))).rejects.toThrow(/permission denied/);
  });

  it("валідація телефону та intent", async () => {
    await expect(submit("12345")).rejects.toThrow(/invalid_phone/);
    await expect(submit("0671234567", "buy")).rejects.toThrow(/invalid_intent/);
  });

  it("ліміт: не більше 5 заявок на телефон за годину (формат номера не обходить ліміт)", async () => {
    for (let i = 0; i < 5; i++) await submit(i % 2 ? "0671234567" : "067-123-45-67");
    await expect(submit("(067) 123 45 67")).rejects.toThrow(/rate_limited/);
    await submit("0509998877"); // інший номер — ок
    await db.exec("update leads set created_at = now() - interval '2 hours' where phone_digits = '0671234567' or phone_digits = '0671234567'");
    await submit("0671234567");
  });

  it("update_lead_telegram_status: sent / failed, лічильник спроб; адмін бачить і оновлює статус", async () => {
    const r = await submit("0671234567");
    await withRole(db, "service_role", undefined, async () => {
      await db.query("select update_lead_telegram_status($1, 'failed', 'boom')", [r.lead_id]);
      await db.query("select update_lead_telegram_status($1, 'sent')", [r.lead_id]);
    });
    expect(await one(db, "select telegram_status, telegram_error, attempts, sent_at is not null as sent from leads")).toEqual({
      telegram_status: "sent", telegram_error: null, attempts: 2, sent: true,
    });
    await admin(async () => {
      expect(await scalar(db, "select count(*)::int from leads")).toBe(1);
      await db.exec("update leads set telegram_status = 'pending'");
    });
  });
});

describe("Розклад", () => {
  it("міграція pg_cron безпечна без розширення (PGlite)", async () => {
    expect(await scalar(db, "select count(*)::int from pg_available_extensions where name = 'pg_cron'")).toBe(0);
  });
});
