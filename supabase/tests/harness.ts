/**
 * PGlite harness: Postgres у процесі, без Docker.
 * Емулює те, що дає Supabase (схема auth, auth.uid(), ролі anon/authenticated/service_role),
 * після чого застосовує ВСІ міграції з supabase/migrations по черзі (а за потреби — seed.sql).
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vi } from "vitest";

// Файли тестів працюють паралельно, кожен будує свій шаблон БД (міграції ≈2 с) — даємо запас на навантаження.
vi.setConfig({ hookTimeout: 180_000, testTimeout: 180_000 });

const SUPABASE_DIR = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, "migrations");

export const ADMIN_ID = "00000000-0000-4000-8000-0000000000a1";
export const USER_ID = "00000000-0000-4000-8000-0000000000b2";

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (id uuid primary key, email text);
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Нова БД: заглушки Supabase + усі міграції (+ seed, якщо потрібно). */
export async function createDb(opts: { seed?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    } catch (e) {
      throw new Error(`Міграція ${file} не застосувалась: ${(e as Error).message}`);
    }
  }
  await db.exec(
    `insert into auth.users (id, email) values ('${ADMIN_ID}', 'admin@example.com'), ('${USER_ID}', 'user@example.com');
     insert into public.admin_users (user_id, email) values ('${ADMIN_ID}', 'admin@example.com');`,
  );
  if (opts.seed) {
    await db.exec(readFileSync(path.join(SUPABASE_DIR, "seed.sql"), "utf8"));
  }
  return db;
}

/** Переключає сесію на роль Supabase (RLS застосовується). sub — «користувач» для auth.uid(). */
export async function asRole(db: PGlite, role: "anon" | "authenticated" | "service_role", sub?: string) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${sub ?? ""}', false)`);
  await db.exec(`set role ${role}`);
}

export async function asAdmin(db: PGlite) {
  await asRole(db, "authenticated", ADMIN_ID);
}

export async function asSuperuser(db: PGlite) {
  await db.exec("reset role");
}

/** Виконати fn від імені ролі й гарантовано повернутись у superuser. */
export async function withRole<T>(
  db: PGlite,
  role: "anon" | "authenticated" | "service_role",
  sub: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  await asRole(db, role, sub);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

export async function rows<T = Record<string, unknown>>(db: PGlite, sql: string, params?: unknown[]): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

export async function one<T = Record<string, unknown>>(db: PGlite, sql: string, params?: unknown[]): Promise<T> {
  const r = await rows<T>(db, sql, params);
  if (r.length !== 1) throw new Error(`Очікувався 1 рядок, отримано ${r.length}: ${sql}`);
  return r[0];
}

export async function scalar<T = unknown>(db: PGlite, sql: string, params?: unknown[]): Promise<T> {
  const r = await one<Record<string, T>>(db, sql, params);
  return Object.values(r)[0];
}

// ───────────────────────── Мінімальна фікстура для тестів ─────────────────────────

/** Дві області, три міста, чотири послуги; без клінік і цін. */
export const FIXTURE_SQL = `
  insert into regions (id, name) values ('r1', 'Область 1'), ('r2', 'Область 2');
  insert into cities (id, name, region_id, aliases) values
    ('c1', 'Місто 1', 'r1', '{c-one}'),
    ('c2', 'Місто 2', 'r1', '{}'),
    ('c3', 'Місто 3', 'r2', '{}');
  insert into services (service_code, name, role, unit, tiered, sort) values
    ('IMPL', 'Імплант', 'implant', 'за імплант', true, 10),
    ('CROWN', 'Коронка', 'crown', 'за коронку', true, 20),
    ('HEAL', 'Формувач', 'healing', 'за імплант', false, 30),
    ('SCAN', 'Сканування', 'scan', 'за етап', false, 40);
  insert into currency_rates (currency, rate_to_uah, rate_date) values ('EUR', 50, '2026-10-09'), ('USD', 40, '2026-10-09');
`;

export async function createFixtureDb(): Promise<PGlite> {
  const db = await createDb();
  await db.exec(FIXTURE_SQL);
  await db.exec("select public.process_recalc_queue(10000)");
  return db;
}

let fixtureTemplate: Promise<PGlite> | undefined;
let seededTemplate: Promise<PGlite> | undefined;

/** Свіжа копія БД із мінімальною фікстурою (шаблон будується один раз на файл тестів). */
export async function freshFixtureDb(): Promise<PGlite> {
  fixtureTemplate ??= createFixtureDb();
  return (await fixtureTemplate).clone() as unknown as PGlite;
}

/** Свіжа копія БД з повним seed.sql. */
export async function freshSeededDb(): Promise<PGlite> {
  seededTemplate ??= createDb({ seed: true });
  return (await seededTemplate).clone() as unknown as PGlite;
}

/** Додає клініку (active за замовчуванням) і повертає її id. */
export async function addClinic(
  db: PGlite,
  name: string,
  cityId: string,
  opts: { network?: string | null; status?: string } = {},
): Promise<string> {
  const r = await one<{ id: string }>(
    db,
    `insert into clinics (name, city_id, network_id, status) values ($1, $2, $3, $4) returning id`,
    [name, cityId, opts.network ?? null, opts.status ?? "active"],
  );
  return r.id;
}

/** Додає ціну клініки (approved, перевірена зараз) і повертає її id. */
export async function addPrice(
  db: PGlite,
  clinicId: string,
  service: string,
  tier: string,
  priceFrom: number,
  opts: {
    priceTo?: number | null;
    currency?: string;
    status?: string;
    include?: boolean;
    verifiedAt?: string | null; // SQL-вираз або ISO-рядок; "now" за замовчуванням
    validFrom?: string;
  } = {},
): Promise<string> {
  const verified = opts.verifiedAt === undefined ? "now()" : opts.verifiedAt === null ? "null" : `'${opts.verifiedAt}'::timestamptz`;
  const r = await one<{ id: string }>(
    db,
    `insert into clinic_prices (clinic_id, service_code, tier, price_from, price_to, currency, status,
                                include_in_aggregate, verified_at, valid_from)
     values ($1, $2, $3, $4, $5, $6, $7, $8, ${verified}, $9) returning id`,
    [
      clinicId,
      service,
      tier,
      priceFrom,
      opts.priceTo ?? null,
      opts.currency ?? "UAH",
      opts.status ?? "approved",
      opts.include ?? true,
      opts.validFrom ?? new Date().toISOString().slice(0, 10),
    ],
  );
  return r.id;
}

export async function drain(db: PGlite): Promise<number> {
  return scalar<number>(db, "select public.process_recalc_queue(10000)");
}

export async function published(db: PGlite, kind: string, id: string, service: string, tier: string) {
  const r = await rows<{ value: string; source_type: string; clinic_count: number | null; currency: string }>(
    db,
    `select value::float8 as value, source_type, clinic_count, currency from published_prices
      where location_kind = $1 and location_id = $2 and service_code = $3 and tier = $4`,
    [kind, id, service, tier],
  );
  return r[0] ?? null;
}

export async function queueKeys(db: PGlite): Promise<string[]> {
  const r = await rows<{ k: string }>(
    db,
    `select city_id || '/' || service_code || '/' || tier as k from recalc_queue order by 1`,
  );
  return r.map((x) => x.k);
}
