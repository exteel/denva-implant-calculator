// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { ADMIN_ID, applyMigrations, createV2Db, isV2Migration, one, rows, scalar, withRole } from "./harness";

/** Живий проєкт до v3 (міграції 01–07 + демо-seed v2 + адмін + заявка) → міграції v3. */
const V2_ONLY_CODES = ["SCAN_BOTH", "EXTRACTION_SIMPLE", "EXTRACTION_COMPLEX", "AUGMENT", "SINUS", "SEDATION", "SURGICAL_GUIDE"];

let db: PGlite;
const before: Record<string, number> = {};
let realClinicId: string;

beforeAll(async () => {
  db = await createV2Db();
  // стан v2
  expect(await scalar(db, "select count(*)::int from services where active")).toBe(16);
  before.snapshots = await scalar<number>(db, "select count(*)::int from city_aggregates");
  before.history = await scalar<number>(db, "select count(*)::int from published_price_history");
  expect(await scalar(db, "select count(*)::int from published_prices where service_code = 'SCAN_BOTH'")).toBeGreaterThan(0);

  // реальні (не демо) дані, що мають пережити перехід
  realClinicId = await scalar<string>(db, `insert into clinics (name, city_id, status, is_demo) values ('Реальна клініка', 'kyiv', 'active', false) returning id`);
  await db.query(
    `insert into clinic_prices (clinic_id, service_code, tier, price_from, currency, status, verified_at)
     values ($1, 'IMPLANT_INSTALL', 'classic', 21000, 'UAH', 'approved', now())`, [realClinicId]);
  // режими v2: manual, manual_override (значення було в міському орієнтирі), режим для коду, що зміниться
  await db.exec(`
    insert into price_modes (city_id, service_code, tier, mode) values
      ('kyiv', 'IMPLANT_INSTALL', 'minimum', 'manual'),
      ('kyiv', 'CROWN_IMPLANT', 'classic', 'manual_override'),
      ('lviv', 'HEALING_ABUTMENT', 'common', 'auto');`);
  await db.exec("select process_recalc_queue(10000)");
  expect(await scalar(db, "select value::float8 from published_prices where location_id='kyiv' and service_code='CROWN_IMPLANT' and tier='classic'")).toBe(11500);

  await applyMigrations(db, (f) => !isV2Migration(f));
}, 600_000);

describe("міграція живої БД v2 → v3", () => {
  it("адмін і заявки збережені; нові заявки приймають dental_tender", async () => {
    expect(await scalar(db, "select count(*)::int from admin_users")).toBe(1);
    expect(await scalar(db, "select user_id from admin_users")).toBe(ADMIN_ID);
    expect(await one(db, "select intent, phone, telegram_status from leads")).toEqual({ intent: "refine", phone: "+380671234567", telegram_status: "pending" });
    const r = await withRole(db, "service_role", undefined, async () =>
      scalar<{ lead_id: string }>(db, `select submit_lead_record('{"intent":"dental_tender","phone":"0501112233","location":{"kind":"city","id":"kyiv","name":"Київ"}}'::jsonb)`));
    expect(r.lead_id).toBeTruthy();
    expect(await scalar(db, "select count(*)::int from leads")).toBe(2);
    // v2-intent більше не приймається для нових заявок
    await expect(withRole(db, "service_role", undefined, () =>
      db.query(`select submit_lead_record('{"intent":"send_calculation","phone":"0501112244"}'::jsonb)`))).rejects.toThrow(/invalid_intent/);
  });

  it("каталог: активні рівно 29 кодів шаблону; старі коди v2 неактивні, але збережені", async () => {
    expect(await scalar(db, "select count(*)::int from services where active")).toBe(29);
    for (const code of V2_ONLY_CODES) {
      expect(await scalar(db, "select active from services where service_code = $1", [code]), code).toBe(false);
    }
    expect(await scalar(db, "select count(*)::int from services")).toBe(16 + 29 - 9); // 9 кодів збіглися (HEALING_ABUTMENT, MULTIUNIT, ...)
    // збіглися за кодом — оновлені до визначення v3
    expect(await one(db, "select role, tiered, tier_source, additional, is_demo from services where service_code = 'HEALING_ABUTMENT'")).toEqual({
      role: "healing", tiered: true, tier_source: "implant_tier", additional: false, is_demo: false,
    });
    expect(await one(db, "select role, tier_source from services where service_code = 'ARCH_FINAL'")).toEqual({ role: "arch", tier_source: "crown_or_arch_tier" });
    expect(await scalar(db, "select count(*)::int from services where active and category is not null")).toBe(29);
  });

  it("старі демо-орієнтири видалено, нові демо-ціни v3 вставлено", async () => {
    for (const code of V2_ONLY_CODES) {
      expect(await scalar(db, "select count(*)::int from city_manual_prices where service_code = $1", [code]), code).toBe(0);
      expect(await scalar(db, "select count(*)::int from region_manual_prices where service_code = $1", [code]), code).toBe(0);
    }
    expect(await scalar(db, "select count(*)::int from country_manual_prices")).toBe(43);
    expect(await scalar(db, "select count(*)::int from city_manual_prices")).toBe(7 * 43);
    expect(await scalar(db, "select count(*)::int from region_manual_prices")).toBe(23 * 43);
    expect(await scalar(db, "select value::float8 from city_manual_prices where city_id='odesa' and service_code='IMPLANT_INSTALL' and tier='classic'")).toBe(18400);
    expect(await scalar(db, "select count(*)::int from clinics where is_demo")).toBe(6);
  });

  it("опубліковано за новою моделлю; рядків для неактивних кодів немає", async () => {
    expect(await scalar(db, "select count(*)::int from published_prices where location_kind='city'")).toBe(33 * 43);
    expect(await scalar(db, "select count(*)::int from published_prices where location_kind='region'")).toBe(25 * 43);
    for (const code of V2_ONLY_CODES) {
      expect(await scalar(db, "select count(*)::int from published_prices where service_code = $1", [code]), code).toBe(0);
    }
    expect(await scalar(db, "select count(*)::int from recalc_queue")).toBe(0);
    const lviv = await one<{ value: number; source_type: string; local_clinic_count: number }>(db,
      "select value::float8 as value, source_type, local_clinic_count from published_prices where location_id='lviv' and service_code='IMPLANT_INSTALL' and tier='classic'");
    expect(lviv).toMatchObject({ source_type: "hybrid", local_clinic_count: 2 });
    expect(lviv.value).toBeCloseTo((2 * 18250 + 18000) / 3, 6);
    expect(await scalar(db, "select source_type from published_prices where location_id='odesa' and service_code='IMPLANT_INSTALL' and tier='classic'")).toBe("hybrid");
    expect(await scalar(db, "select source_type from published_prices where location_id='uzhhorod' and service_code='IMPLANT_INSTALL' and tier='classic'")).toBe("national_fallback");
  });

  it("реальна (не демо) клініка пережила перехід і входить у вибірку Києва: медіана 17000, 18500, 19500, 21000", async () => {
    expect(await scalar(db, "select name from clinics where id = $1", [realClinicId])).toBe("Реальна клініка");
    expect(await one(db, "select value::float8 as value, source_type, local_clinic_count from published_prices where location_id='kyiv' and service_code='IMPLANT_INSTALL' and tier='classic'"))
      .toEqual({ value: 19000, source_type: "aggregate", local_clinic_count: 4 });
  });

  it("історія зберігається: snapshot-и й опубліковані зміни v2 на місці", async () => {
    expect(await scalar(db, "select count(*)::int from city_aggregates")).toBeGreaterThan(before.snapshots);
    expect(await scalar(db, "select count(*)::int from published_price_history")).toBeGreaterThan(before.history);
    // старі snapshot-и (v2) мають порожні нові колонки, нові — заповнені
    expect(await scalar(db, "select count(*)::int from city_aggregates where formula is null")).toBeGreaterThan(0);
    expect(await scalar(db, "select formula is not null from city_aggregates order by seq desc limit 1")).toBe(true);
    // видалені old-демо клініки та їхні ціни — у журналі
    expect(await scalar(db, "select count(*)::int from audit_log where table_name = 'clinics' and action = 'DELETE'")).toBe(5);
  });

  it("режими: manual → auto; manual_override отримав значення з міського орієнтира й причину; режим зміненого коду видалено", async () => {
    const modes = await rows<{ k: string; mode: string; override_value: number | null; override_reason: string | null }>(db,
      "select city_id || '/' || service_code || '/' || tier as k, mode, override_value::float8 as override_value, override_reason from price_modes order by 1");
    expect(modes).toEqual([
      { k: "kyiv/CROWN_IMPLANT/classic", mode: "manual_override", override_value: 11500, override_reason: "перенесено з v2" },
      { k: "kyiv/IMPLANT_INSTALL/minimum", mode: "auto", override_value: null, override_reason: null },
    ]);
    // override реально діє: опубліковане значення = 11500, джерело manual_override
    expect(await one(db, "select value::float8 as value, source_type from published_prices where location_id='kyiv' and service_code='CROWN_IMPLANT' and tier='classic'"))
      .toEqual({ value: 11500, source_type: "manual_override" });
  });

  it("структура v3: slug = id, seo_status draft (Київ — review), налаштування метод median", async () => {
    expect(await scalar(db, "select count(*)::int from cities where slug <> id")).toBe(0);
    expect(await rows(db, "select id, seo_status from cities where seo_status <> 'draft'")).toEqual([{ id: "kyiv", seo_status: "review" }]);
    expect(await scalar(db, "select aggregation_method from settings")).toBe("median");
    expect(await scalar(db, "select count(*)::int from published_prices where source_type = 'manual'")).toBe(0);
  });

  it("міграція ідемпотентна щодо повторного запуску демо-перерахунку (seed-подібний виклик нічого не ламає)", async () => {
    await db.exec("select enqueue_all_combos(); select process_recalc_queue(100000);");
    expect(await scalar(db, "select count(*)::int from published_prices where location_kind='city'")).toBe(33 * 43);
  });
});
