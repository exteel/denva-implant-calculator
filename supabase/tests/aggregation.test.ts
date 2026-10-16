// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { addClinic, addPrice, drain, freshFixtureDb, published, rows, scalar } from "./harness";

let db: PGlite;
beforeEach(async () => {
  db = await freshFixtureDb();
});

interface Snapshot {
  value: number | null;
  clinic_count: number;
  method: string;
  included_ids: string[];
  excluded: { clinic_price_id: string; clinic_name: string; reason: string; value_uah: number | null }[];
}

async function lastSnapshot(city = "c1", service = "IMPL", tier = "classic"): Promise<Snapshot> {
  const r = await rows<Snapshot>(
    db,
    `select value::float8 as value, clinic_count, method, included_ids, excluded
       from city_aggregates where city_id=$1 and service_code=$2 and tier=$3 order by seq desc limit 1`,
    [city, service, tier],
  );
  return r[0];
}

const reasonOf = (s: Snapshot, priceId: string) => s.excluded.find((e) => e.clinic_price_id === priceId)?.reason;

describe("Вибірка агрегату (ТЗ §3.1)", () => {
  it("одна клініка = один голос: дві approved ціни однієї клініки рахуються один раз (береться свіжіша)", async () => {
    const a = await addClinic(db, "A", "c1");
    const b = await addClinic(db, "B", "c1");
    const old = await addPrice(db, a, "IMPL", "classic", 10000, { validFrom: "2026-01-01" });
    const fresh = await addPrice(db, a, "IMPL", "classic", 20000, { validFrom: "2026-09-01" });
    await addPrice(db, b, "IMPL", "classic", 30000);
    await drain(db);
    const s = await lastSnapshot();
    expect(s.clinic_count).toBe(2);
    expect(s.value).toBe(25000); // медіана 20000 і 30000
    expect(s.included_ids).toContain(fresh);
    expect(reasonOf(s, old)).toBe("дублікат клініки");
  });

  it("філії однієї мережі з однаковою ціною = одне джерело", async () => {
    const n1 = await addClinic(db, "Мережа-1", "c1", { network: "net" });
    const n2 = await addClinic(db, "Мережа-2", "c1", { network: "net" });
    const n3 = await addClinic(db, "Мережа-3", "c1", { network: "net" });
    const solo = await addClinic(db, "Окрема", "c1");
    await addPrice(db, n1, "IMPL", "classic", 15000);
    const p2 = await addPrice(db, n2, "IMPL", "classic", 15000);
    const p3 = await addPrice(db, n3, "IMPL", "classic", 15000);
    await addPrice(db, solo, "IMPL", "classic", 20000);
    await drain(db);
    const s = await lastSnapshot();
    expect(s.clinic_count).toBe(2);
    expect(s.value).toBe(17500);
    expect(reasonOf(s, p2)).toBe("філія мережі з тим самим прайсом");
    expect(reasonOf(s, p3)).toBe("філія мережі з тим самим прайсом");
  });

  it("філії однієї мережі з різними цінами рахуються окремо", async () => {
    const n1 = await addClinic(db, "Мережа-1", "c1", { network: "net" });
    const n2 = await addClinic(db, "Мережа-2", "c1", { network: "net" });
    const solo = await addClinic(db, "Окрема", "c1");
    await addPrice(db, n1, "IMPL", "classic", 15000);
    await addPrice(db, n2, "IMPL", "classic", 16000);
    await addPrice(db, solo, "IMPL", "classic", 20000);
    await drain(db);
    const s = await lastSnapshot();
    expect(s.clinic_count).toBe(3);
    expect(s.value).toBe(16000);
  });

  it("однакова ціна без спільної мережі — це різні джерела", async () => {
    for (const n of ["A", "B", "C"]) await addPrice(db, await addClinic(db, n, "c1"), "IMPL", "classic", 15000);
    await drain(db);
    expect((await lastSnapshot()).clinic_count).toBe(3);
  });

  it("виключаються з причинами: неактивна клініка, pending, rejected, stale, стара verified_at, include=false", async () => {
    const ok = await addClinic(db, "OK", "c1");
    const draft = await addClinic(db, "Чернетка", "c1", { status: "draft" });
    const excl = await addClinic(db, "Виключена", "c1", { status: "excluded" });
    const x = await addClinic(db, "X", "c1");
    const okP = await addPrice(db, ok, "IMPL", "classic", 10000);
    const draftP = await addPrice(db, draft, "IMPL", "classic", 11000);
    const exclP = await addPrice(db, excl, "IMPL", "classic", 12000);
    const pend = await addPrice(db, x, "IMPL", "classic", 13000, { status: "pending", validFrom: "2026-01-01" });
    const rej = await addPrice(db, x, "IMPL", "classic", 14000, { status: "rejected", validFrom: "2026-01-02" });
    const stl = await addPrice(db, x, "IMPL", "classic", 15000, { status: "stale", validFrom: "2026-01-03" });
    const oldV = await addPrice(db, x, "IMPL", "classic", 16000, { verifiedAt: "2024-01-01T00:00:00Z", validFrom: "2026-01-04" });
    const noInc = await addPrice(db, x, "IMPL", "classic", 17000, { include: false, validFrom: "2026-01-05" });
    await db.query("update clinic_prices set exclude_reason = 'аномалія' where id = $1", [noInc]);
    await drain(db);
    const s = await lastSnapshot();
    expect(s.clinic_count).toBe(1);
    expect(s.included_ids).toEqual([okP]);
    expect(reasonOf(s, draftP)).toBe("клініка неактивна");
    expect(reasonOf(s, exclP)).toBe("клініка неактивна");
    expect(reasonOf(s, pend)).toBe("ціна не підтверджена");
    expect(reasonOf(s, rej)).toBe("ціна відхилена");
    expect(reasonOf(s, stl)).toBe("застаріла");
    expect(reasonOf(s, oldV)).toBe("застаріла");
    expect(reasonOf(s, noInc)).toBe("виключено адміністратором: аномалія");
  });

  it("неапрувлений новіший запис не заступає підтверджений (голос лишається за approved)", async () => {
    const a = await addClinic(db, "A", "c1");
    const good = await addPrice(db, a, "IMPL", "classic", 10000, { validFrom: "2026-01-01" });
    await addPrice(db, a, "IMPL", "classic", 99999, { status: "pending", validFrom: "2026-10-01" });
    await drain(db);
    const s = await lastSnapshot();
    expect(s.included_ids).toEqual([good]);
    expect(s.value).toBe(10000);
  });

  it("ціни інших міст і інших рівнів/послуг не потрапляють у вибірку", async () => {
    await addPrice(db, await addClinic(db, "A", "c1"), "IMPL", "classic", 10000);
    await addPrice(db, await addClinic(db, "B", "c2"), "IMPL", "classic", 50000);
    await addPrice(db, await addClinic(db, "C", "c1"), "IMPL", "premium", 70000);
    await addPrice(db, await addClinic(db, "D", "c1"), "HEAL", "common", 1800);
    await drain(db);
    const s = await lastSnapshot();
    expect(s.clinic_count).toBe(1);
    expect(s.value).toBe(10000);
  });

  it("порожня вибірка → snapshot з value = null і clinic_count = 0", async () => {
    await db.exec("select compute_aggregate('c1','IMPL','classic')");
    expect(await lastSnapshot()).toMatchObject({ value: null, clinic_count: 0 });
  });
});

describe("Метод і валюта", () => {
  const seed = async () => {
    for (const [i, p] of [10000, 12000, 20000, 30000].entries()) {
      await addPrice(db, await addClinic(db, `K${i}`, "c1"), "IMPL", "classic", p);
    }
    await drain(db);
  };

  it("median за замовчуванням (парна кількість — середнє двох центральних)", async () => {
    await seed();
    expect(await lastSnapshot()).toMatchObject({ value: 16000, method: "median", clinic_count: 4 });
  });

  it("метод агрегації лише median (arithmetic_mean недоступний)", async () => {
    await seed();
    await expect(db.exec("update settings set aggregation_method = 'arithmetic_mean'")).rejects.toThrow();
  });

  it("медіана стійка до викидів", async () => {
    for (const [i, p] of [10000, 11000, 12000, 900000].entries()) {
      await addPrice(db, await addClinic(db, `K${i}`, "c1"), "IMPL", "classic", p);
    }
    await drain(db);
    expect((await lastSnapshot()).value).toBe(11500);
  });

  it("ціна в EUR нормалізується за курсом (діапазон → середина)", async () => {
    const a = await addClinic(db, "A", "c1");
    const b = await addClinic(db, "B", "c1");
    const c = await addClinic(db, "C", "c1");
    await addPrice(db, a, "IMPL", "classic", 300, { currency: "EUR" }); // 300 × 50 = 15000
    await addPrice(db, b, "IMPL", "classic", 400, { priceTo: 600, currency: "EUR" }); // 500 × 50 = 25000
    await addPrice(db, c, "IMPL", "classic", 400, { currency: "USD" }); // 400 × 40 = 16000
    await drain(db);
    expect(await lastSnapshot()).toMatchObject({ value: 16000, clinic_count: 3 });
  });

  it("використовується найсвіжіший курс на дату розрахунку", async () => {
    await db.exec("insert into currency_rates (currency, rate_to_uah, rate_date) values ('EUR', 60, '2026-10-10'), ('EUR', 99, '2999-01-01')");
    await addPrice(db, await addClinic(db, "A", "c1"), "IMPL", "classic", 100, { currency: "EUR" });
    await drain(db);
    expect((await lastSnapshot()).value).toBe(6000); // курс з майбутнього ігнорується
  });

  it("усе нормалізується в UAH, навіть якщо валюта міста інша (ТЗ §4.7)", async () => {
    await db.exec("update cities set currency = 'EUR' where id = 'c2'");
    await addPrice(db, await addClinic(db, "A", "c2"), "IMPL", "classic", 5000, { currency: "UAH" });
    await addPrice(db, await addClinic(db, "B", "c2"), "IMPL", "classic", 100, { currency: "EUR" });
    await drain(db);
    expect(await lastSnapshot("c2")).toMatchObject({ value: 5000, clinic_count: 2 }); // (5000 + 5000) / 2
  });

  it("значення не округлюється до копійок", async () => {
    await db.exec("insert into currency_rates (currency, rate_to_uah, rate_date) values ('EUR', 50.1385, '2026-10-12')");
    await addPrice(db, await addClinic(db, "A", "c1"), "IMPL", "classic", 100.33, { currency: "EUR" });
    await drain(db);
    const t = await scalar<string>(db, "select value::text from city_aggregates where city_id='c1' order by seq desc limit 1");
    expect(Number(t)).toBeCloseTo(100.33 * 50.1385, 9);
    expect(t.split(".")[1].length).toBeGreaterThan(2);
  });
});

describe("Snapshot-и незмінні, помилки не ламають публікацію", () => {
  it("UPDATE / DELETE / TRUNCATE snapshot-ів заборонені", async () => {
    await db.exec("select compute_aggregate('c1','IMPL','classic')");
    await expect(db.exec("update city_aggregates set clinic_count = 99")).rejects.toThrow(/лише для додавання/);
    await expect(db.exec("delete from city_aggregates")).rejects.toThrow(/лише для додавання/);
    await expect(db.exec("truncate city_aggregates")).rejects.toThrow(/лише для додавання/);
  });

  it("кожен перерахунок додає новий snapshot, старі лишаються", async () => {
    await db.exec("select recalculate('c1','IMPL','classic'); select recalculate('c1','IMPL','classic');");
    expect(await scalar(db, "select count(*)::int from city_aggregates where city_id='c1' and service_code='IMPL' and tier='classic'")).toBe(2);
  });

  it("історія published_price_history і audit_log теж лише додаються", async () => {
    await db.exec("insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',1000)");
    await drain(db);
    await expect(db.exec("delete from published_price_history")).rejects.toThrow();
    await expect(db.exec("update audit_log set reason = 'x'")).rejects.toThrow();
  });

  it("поки перерахунок не вдався, діє попередня опублікована ціна (немає курсу EUR)", async () => {
    await db.exec("insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)");
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 10000 });
    const snapsBefore = await scalar<number>(db, "select count(*)::int from city_aggregates where city_id='c1' and service_code='IMPL' and tier='classic'");
    await db.exec("delete from currency_rates where currency = 'EUR'");
    await addPrice(db, await addClinic(db, "A", "c1"), "IMPL", "classic", 300, { currency: "EUR" });
    expect(await drain(db)).toBe(0);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 10000, source_type: "manual_baseline" });
    expect(await scalar(db, "select count(*)::int from city_aggregates where city_id='c1' and service_code='IMPL' and tier='classic'")).toBe(snapsBefore);
    const q = await rows<{ attempts: number; last_error: string }>(db, "select attempts, last_error from recalc_queue where city_id='c1' and service_code='IMPL'");
    expect(q).toHaveLength(1);
    expect(q[0].attempts).toBe(1);
    expect(q[0].last_error).toMatch(/Немає курсу EUR/);

    // з'явився курс → INSERT у currency_rates ставить комбінацію в чергу, і вона проходить
    await db.exec("insert into currency_rates (currency, rate_to_uah, rate_date) values ('EUR', 50, '2026-10-12')");
    expect(await drain(db)).toBe(1);
    expect(await scalar(db, "select count(*)::int from recalc_queue")).toBe(0);
    // 1 клініка (15000) + baseline міста 10000 → ⅓ · 15000 + ⅔ · 10000
    const snap = await lastSnapshot();
    expect(snap.clinic_count).toBe(1);
    expect(snap.value).toBeCloseTo(11666.6666667, 5);
  });

  it("збій однієї комбінації не блокує інші в черзі", async () => {
    await db.exec("delete from currency_rates where currency = 'EUR'");
    await addPrice(db, await addClinic(db, "A", "c1"), "IMPL", "classic", 300, { currency: "EUR" });
    await db.exec("insert into city_manual_prices (city_id, service_code, tier, value) values ('c2','HEAL','common',1800)");
    expect(await drain(db)).toBe(1);
    expect(await published(db, "city", "c2", "HEAL", "common")).toMatchObject({ value: 1800 });
  });
});

describe("Деактивація і виключення зберігають історію (ТЗ §9)", () => {
  it("деактивація клініки перепублікує без її ціни, але не видаляє snapshot-и й історію", async () => {
    const ids: string[] = [];
    for (const [i, p] of [17000, 18500, 19500].entries()) {
      const c = await addClinic(db, `K${i}`, "c1");
      ids.push(c);
      await addPrice(db, c, "IMPL", "classic", p);
    }
    await db.exec("insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)");
    await drain(db);
    expect(await published(db, "city", "c1", "IMPL", "classic")).toMatchObject({ value: 18500, source_type: "aggregate" });
    const snapsBefore = await scalar<number>(db, "select count(*)::int from city_aggregates");
    const histBefore = await scalar<number>(db, "select count(*)::int from published_price_history");

    await db.query("update clinics set status = 'excluded' where id = $1", [ids[1]]);
    await drain(db);

    // залишилось 2 клініки (17000, 19500; медіана 18250) → гібрид ⅔ · 18250 + ⅓ · 10000
    const pubNow = await rows<{ value: number; source_type: string }>(db, "select value::float8 as value, source_type from published_prices where location_id='c1' and service_code='IMPL'");
    expect(pubNow[0].source_type).toBe("hybrid");
    expect(pubNow[0].value).toBeCloseTo((2 * 18250 + 10000) / 3, 6);
    expect(await scalar(db, "select count(*)::int from city_aggregates")).toBeGreaterThan(snapsBefore);
    expect(await scalar(db, "select count(*)::int from published_price_history")).toBeGreaterThan(histBefore);
    const s = await lastSnapshot();
    expect(s.clinic_count).toBe(2);
    expect(s.excluded.map((e) => e.reason)).toContain("клініка неактивна");
    // ціна клініки, історичні snapshot-и і ціни — на місці
    expect(await scalar(db, "select count(*)::int from clinic_prices")).toBe(3);
    expect(await scalar(db, "select count(*)::int from city_aggregates where clinic_count = 3")).toBeGreaterThanOrEqual(1);
  });

  it("перенесення клініки в інше місто перераховує старе й нове", async () => {
    const a = await addClinic(db, "A", "c1");
    await addPrice(db, a, "IMPL", "classic", 10000);
    await drain(db);
    await db.query("update clinics set city_id = 'c2' where id = $1", [a]);
    expect(await scalar(db, "select string_agg(city_id, ',' order by city_id) from recalc_queue")).toBe("c1,c2");
    await drain(db);
    expect(await lastSnapshot("c1")).toMatchObject({ clinic_count: 0 });
    expect(await lastSnapshot("c2")).toMatchObject({ clinic_count: 1, value: 10000 });
  });

  it("mark_stale_prices() переводить прострочені approved у stale і ставить комбінацію в чергу", async () => {
    const a = await addClinic(db, "A", "c1");
    const p = await addPrice(db, a, "IMPL", "classic", 10000, { verifiedAt: "2020-01-01T00:00:00Z" });
    await addPrice(db, await addClinic(db, "B", "c1"), "IMPL", "classic", 12000);
    await drain(db);
    expect(await scalar(db, "select mark_stale_prices()")).toBe(1);
    expect(await scalar(db, "select status from clinic_prices where id=$1", [p])).toBe("stale");
    expect(await scalar(db, "select count(*)::int from recalc_queue")).toBe(1);
  });
});
