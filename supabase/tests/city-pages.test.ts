// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { CityPageData, ListLocationsResponse } from "../../src/lib/contracts";
import { ADMIN_ID, addClinic, addPrice, drain, freshFixtureDb, rows, scalar, withRole } from "./harness";

let db: PGlite;
beforeEach(async () => {
  db = await freshFixtureDb();
});
const anon = <T>(fn: () => Promise<T>) => withRole(db, "anon", undefined, fn);
const admin = <T>(fn: () => Promise<T>) => withRole(db, "authenticated", ADMIN_ID, fn);
const pages = () => anon(async () => (await rows<{ r: CityPageData[] }>(db, "select get_city_pages() as r"))[0].r);

async function seedCity(city: string, status: string) {
  await db.query(
    `update cities set seo_status = $2, intro = 'Вступ ' || name, faq = '[{"q":"Питання?","a":"Відповідь."}]'::jsonb,
            local_notes = 'Нотатки', reviewer_name = 'Д-р Рецензент', reviewer_url = 'https://example.org/dr',
            reviewed_at = '2026-10-10T08:00:00Z' where id = $1`, [city, status]);
}

describe("get_city_pages (ТЗ §11.3)", () => {
  it("не повертає неактивні міста, навіть якщо статус ≠ draft", async () => {
    await seedCity("c1", "published");
    await seedCity("c2", "published");
    await db.query(`update cities set active = false where id = 'c2'`);
    const res = await pages();
    expect(res.map((p) => p.location.id)).toEqual(["c1"]);
  });

  it("повертає лише міста зі статусом ≠ draft, у формі CityPageData", async () => {
    await seedCity("c1", "review");
    await seedCity("c2", "published");
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000), ('c3','IMPL','classic',9000)`);
    await drain(db);
    const res = await pages();
    expect(res.map((p) => p.location.id)).toEqual(["c1", "c2"]);   // c3 — draft
    const c1 = res[0];
    expect(Object.keys(c1).sort()).toEqual(["content", "eur_rate", "location", "prices", "seo_status", "services", "updated_at"]);
    expect(c1.location).toEqual({ kind: "city", id: "c1", slug: "c1", name: "Місто 1", region_id: "r1", region_name: "Область 1", aliases: ["c-one"] });
    expect(c1.seo_status).toBe("review");
    expect({ ...c1.content, reviewed_at: new Date(c1.content.reviewed_at!).toISOString() }).toEqual({
      intro: "Вступ Місто 1", faq: [{ q: "Питання?", a: "Відповідь." }], local_notes: "Нотатки",
      reviewer_name: "Д-р Рецензент", reviewer_url: "https://example.org/dr", reviewed_at: "2026-10-10T08:00:00.000Z",
    });
    expect(c1.prices.map((p) => `${p.service_code}/${p.tier}`)).toEqual(["IMPL/classic"]);
    expect(c1.prices[0]).toMatchObject({ value: 10000, source_type: "manual_baseline", source_scope: "city", currency: "UAH" });
    expect(c1.services.map((s) => s.service_code)).toEqual(["IMPL", "CROWN", "HEAL", "SCAN"]);
    expect(c1.eur_rate).toEqual({ rate: 50, date: "2026-10-09" });
    expect(typeof c1.updated_at).toBe("string");
    expect(res[1].prices).toEqual([]);                              // c2 ще без цін
  });

  it("draft-міста повністю відсутні; без статусів — порожній масив; доступно anon", async () => {
    expect(await pages()).toEqual([]);
    await seedCity("c3", "draft");
    expect(await pages()).toEqual([]);
    await seedCity("c3", "stale");
    expect((await pages()).map((p) => [p.location.id, p.seo_status])).toEqual([["c3", "stale"]]);
    await seedCity("c3", "removed");
    expect((await pages()).map((p) => p.seo_status)).toEqual(["removed"]);
  });

  it("не розкриває даних клінік (назви, мережі, прайси, snapshot-и, причини виключення)", async () => {
    await seedCity("c1", "published");
    for (const [i, p] of [17000, 18500, 19500].entries()) {
      await addPrice(db, await addClinic(db, `Секретна клініка ${i}`, "c1", { network: "secret-net" }), "IMPL", "classic", p);
    }
    await db.exec("update clinics set address = 'вул. Таємна, 1', contact_person = 'Таємний Іван' where name like 'Секретна%'");
    await drain(db);
    const text = JSON.stringify(await pages());
    expect(text).toContain('"local_clinic_count":3');
    for (const secret of ["Секретна", "secret-net", "Таємн", "clinic_id", "clinic_name", "price_from", "included_ids", "excluded", "override_reason"]) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it("updated_at = остання суттєва зміна: ціни або контенту; технічні перерахунки його не міняють", async () => {
    await seedCity("c1", "published");
    await db.exec(`insert into city_manual_prices (city_id, service_code, tier, value) values ('c1','IMPL','classic',10000)`);
    await drain(db);
    const t0 = (await pages())[0].updated_at;
    await db.exec("select pg_sleep(0.05)");
    await db.exec("select recalculate('c1','IMPL','classic'), recalculate('c1','IMPL','classic')");
    expect((await pages())[0].updated_at).toBe(t0);                // значення не змінились → lastmod той самий

    await db.exec(`update city_manual_prices set value = 10500`);
    await drain(db);
    const t1 = (await pages())[0].updated_at;
    expect(new Date(t1).getTime()).toBeGreaterThan(new Date(t0).getTime());

    await db.exec("select pg_sleep(0.05)");
    await db.exec(`update cities set intro = 'Новий вступ' where id = 'c1'`);
    const t2 = (await pages())[0].updated_at;
    expect(new Date(t2).getTime()).toBeGreaterThan(new Date(t1).getTime());

    await db.exec("select pg_sleep(0.05)");
    await db.exec(`update cities set aliases = '{x}' where id = 'c1'`);   // не видимий контент
    expect((await pages())[0].updated_at).toBe(t2);
  });

  it("реальні права: anon викликає, але не читає cities напряму", async () => {
    await seedCity("c1", "published");
    await expect(anon(() => db.query("select intro from cities"))).rejects.toThrow(/permission denied/);
    expect(await pages()).toHaveLength(1);
  });
});

describe("Міста: slug і контент сторінки", () => {
  it("slug за замовчуванням = id; формат і унікальність", async () => {
    await db.exec(`insert into cities (id, name, region_id) values ('new-city', 'Нове', 'r1')`);
    expect(await scalar(db, "select slug from cities where id='new-city'")).toBe("new-city");
    await db.exec(`insert into cities (id, name, region_id, slug) values ('c9', 'Дев''яте', 'r1', 'dev-yate')`);
    expect(await scalar(db, "select slug from cities where id='c9'")).toBe("dev-yate");
    await expect(db.exec(`insert into cities (id, name, region_id, slug) values ('c10', 'X', 'r1', 'dev-yate')`)).rejects.toThrow();
    await expect(db.exec(`insert into cities (id, name, region_id, slug) values ('c11', 'X', 'r1', 'Bad Slug!')`)).rejects.toThrow();
  });

  it("seo_status за замовчуванням draft; допустимі лише п'ять станів; faq — масив", async () => {
    expect(await scalar(db, "select seo_status from cities where id='c1'")).toBe("draft");
    await expect(db.exec(`update cities set seo_status = 'live' where id='c1'`)).rejects.toThrow();
    await expect(db.exec(`update cities set faq = '{"q":"x"}'::jsonb where id='c1'`)).rejects.toThrow();
    for (const st of ["review", "published", "stale", "removed", "draft"]) await db.query("update cities set seo_status = $1 where id='c1'", [st]);
  });

  it("list_locations віддає slug; get_location_prices теж", async () => {
    await db.exec(`update cities set slug = 'misto-odyn' where id = 'c1'`);
    const list = await anon(async () => (await rows<{ r: ListLocationsResponse }>(db, "select list_locations() as r"))[0].r);
    expect(list.find((l) => l.id === "c1")).toMatchObject({ slug: "misto-odyn" });
    expect(list.find((l) => l.kind === "region" && l.id === "r1")).toMatchObject({ slug: "r1" });
    const loc = await anon(async () => (await rows<{ r: { location: { slug: string } } }>(db, "select get_location_prices('city','c1') as r"))[0].r.location);
    expect(loc.slug).toBe("misto-odyn");
  });

  it("адмін змінює контент міста через admin_upsert_row з причиною (журнал)", async () => {
    await admin(() => db.query(
      "select admin_upsert_row('cities', $1::jsonb, 'контент перевірено')",
      [JSON.stringify({ id: "c1", seo_status: "published", intro: "Вступ", faq: [{ q: "Q", a: "A" }], reviewer_name: "Д-р", slug: "slug-c1", content_is_demo: false })]));
    expect(await scalar(db, "select seo_status from cities where id='c1'")).toBe("published");
    expect(await scalar(db, "select slug from cities where id='c1'")).toBe("slug-c1");
    expect(await scalar(db, "select reason from audit_log where table_name='cities' and action='UPDATE' order by id desc limit 1")).toBe("контент перевірено");
  });
});
