-- DENVA AI v2 · 01 · Схема даних (ТЗ §2.1, docs/ARCHITECTURE_v2.md §2)
--
-- Усі таблиці лежать у схемі public. Права доступу (RLS + GRANT) — в останній
-- міграції (…000006_rls_grants.sql); тут лише структура.

-- ───────────────────────── Довідники ─────────────────────────

create table public.regions (
  id          text primary key,
  name        text not null,
  active      boolean not null default true,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
comment on table public.regions is 'Області: джерело регіонального fallback (ТЗ §2.3 п.4).';

create table public.cities (
  id          text primary key,
  name        text not null,
  region_id   text not null references public.regions (id),
  country_id  text not null default 'UA',
  currency    text not null default 'UAH' check (currency in ('UAH', 'EUR', 'USD')),
  active      boolean not null default true,
  aliases     text[] not null default '{}',
  -- null → глобальний поріг із settings.min_clinics
  min_clinics integer check (min_clinics is null or min_clinics >= 1),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index cities_region_idx on public.cities (region_id);

create table public.services (
  service_code  text primary key check (service_code ~ '^[A-Z][A-Z0-9_]*$'),
  name          text not null,
  role          text not null check (role in (
                  'implant', 'healing', 'scan', 'superstructure', 'crown',
                  'temporary', 'multiunit', 'arch_temp', 'arch_final', 'addon')),
  unit          text not null,
  tiered        boolean not null default false,
  included_text text,
  active        boolean not null default true,
  sort          integer not null default 100,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  -- ТЗ §3.2 / architecture §2: рівні мають лише implant, crown, arch_final
  constraint services_tiered_roles check (not tiered or role in ('implant', 'crown', 'arch_final'))
);

-- ───────────────────────── Клініки та їхні прайси ─────────────────────────

create table public.clinics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city_id     text not null references public.cities (id),
  network_id  text,
  status      text not null default 'draft' check (status in ('draft', 'active', 'excluded')),
  verified_at timestamptz,
  contacts    text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index clinics_city_idx on public.clinics (city_id);
create index clinics_network_idx on public.clinics (network_id) where network_id is not null;

create table public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  file_name   text,
  clinic_id   uuid references public.clinics (id) on delete set null,
  row_count   integer not null default 0,
  report      jsonb,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.clinic_prices (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references public.clinics (id) on delete cascade,
  -- Рядки імпорту можуть бути ще не зіставлені (ТЗ §7.4 «Стандартний код і рівень — DENVA»):
  -- service_code / tier порожні лише поки статус не approved.
  service_code         text references public.services (service_code),
  tier                 text check (tier in ('common', 'minimum', 'classic', 'premium')),
  price_from           numeric(14, 2) not null check (price_from > 0),
  price_to             numeric(14, 2),
  -- ТЗ §7.4: технічне значення = середина діапазону (для фіксованої ціни = price_from)
  value                numeric generated always as (round((price_from + coalesce(price_to, price_from)) / 2, 3)) stored,
  currency             text not null default 'UAH' check (currency in ('UAH', 'EUR', 'USD')),
  offer_name           text,
  brand_material       text,
  included_text        text,
  exclusions           text,
  valid_from           date not null default current_date,
  verified_at          timestamptz,
  status               text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'stale')),
  include_in_aggregate boolean not null default true,
  exclude_reason       text,
  source_url           text,
  document_path        text,
  import_batch_id      uuid references public.import_batches (id) on delete set null,
  is_demo              boolean not null default false,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid,
  constraint clinic_prices_range check (price_to is null or price_to >= price_from),
  constraint clinic_prices_approved_mapped check (status <> 'approved' or (service_code is not null and tier is not null))
);
create index clinic_prices_clinic_idx on public.clinic_prices (clinic_id);
create index clinic_prices_combo_idx on public.clinic_prices (service_code, tier);
create index clinic_prices_batch_idx on public.clinic_prices (import_batch_id) where import_batch_id is not null;

-- ───────────────────────── Ручні орієнтири і режими ─────────────────────────

create table public.city_manual_prices (
  id           uuid primary key default gen_random_uuid(),
  city_id      text not null references public.cities (id),
  service_code text not null references public.services (service_code),
  tier         text not null check (tier in ('common', 'minimum', 'classic', 'premium')),
  -- значення в валюті міста; value_from/value_to — необов'язковий діапазон «price або range»
  value        numeric(14, 2) not null check (value > 0),
  value_from   numeric(14, 2),
  value_to     numeric(14, 2),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  unique (city_id, service_code, tier),
  constraint city_manual_range check (value_from is null or value_to is null or value_to >= value_from)
);

create table public.region_manual_prices (
  id           uuid primary key default gen_random_uuid(),
  region_id    text not null references public.regions (id),
  service_code text not null references public.services (service_code),
  tier         text not null check (tier in ('common', 'minimum', 'classic', 'premium')),
  value        numeric(14, 2) not null check (value > 0),
  value_from   numeric(14, 2),
  value_to     numeric(14, 2),
  currency     text not null default 'UAH' check (currency in ('UAH', 'EUR', 'USD')),
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  unique (region_id, service_code, tier),
  constraint region_manual_range check (value_from is null or value_to is null or value_to >= value_from)
);

-- Відсутній рядок = режим auto.
create table public.price_modes (
  city_id      text not null references public.cities (id),
  service_code text not null references public.services (service_code),
  tier         text not null check (tier in ('common', 'minimum', 'classic', 'premium')),
  mode         text not null default 'auto' check (mode in ('auto', 'manual', 'manual_override')),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  primary key (city_id, service_code, tier)
);

-- ───────────────────────── Налаштування та курси ─────────────────────────

create table public.settings (
  id                    boolean primary key default true check (id),   -- рівно один рядок
  min_clinics           integer not null default 3 check (min_clinics >= 1),
  aggregation_method    text not null default 'median' check (aggregation_method in ('median', 'arithmetic_mean')),
  stale_after_months    integer not null default 12 check (stale_after_months >= 1),
  deviation_warning_pct numeric not null default 30 check (deviation_warning_pct > 0),
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);
insert into public.settings (id) values (true);

create table public.currency_rates (
  id          uuid primary key default gen_random_uuid(),
  currency    text not null check (currency in ('EUR', 'USD')),
  rate_to_uah numeric(14, 6) not null check (rate_to_uah > 0),
  rate_date   date not null,
  source      text not null default 'nbu',
  created_at  timestamptz not null default now(),
  unique (currency, rate_date)
);

-- ───────────────────────── Агрегати та публікація ─────────────────────────

-- Snapshot-и лише додаються (тригер у …000003). seq — монотонний порядок усередині транзакції.
create table public.city_aggregates (
  id            uuid primary key default gen_random_uuid(),
  seq           bigint generated always as identity,
  city_id       text not null references public.cities (id),
  service_code  text not null references public.services (service_code),
  tier          text not null check (tier in ('common', 'minimum', 'classic', 'premium')),
  value         numeric(14, 2),
  clinic_count  integer not null check (clinic_count >= 0),
  method        text not null check (method in ('median', 'arithmetic_mean')),
  included_ids  uuid[] not null default '{}',
  -- [{clinic_price_id, clinic_id, clinic_name, value_uah, valid_from}] — форма AggregateDetail.included
  included      jsonb not null default '[]'::jsonb,
  -- [{clinic_price_id, clinic_id, clinic_name, value_uah, reason}] — форма AggregateDetail.excluded
  excluded      jsonb not null default '[]'::jsonb,
  is_demo       boolean not null default false,
  calculated_at timestamptz not null default clock_timestamp()
);
create index city_aggregates_latest_idx on public.city_aggregates (city_id, service_code, tier, seq desc);

create table public.published_prices (
  location_kind      text not null check (location_kind in ('city', 'region')),
  location_id        text not null,
  service_code       text not null references public.services (service_code),
  tier               text not null check (tier in ('common', 'minimum', 'classic', 'premium')),
  value              numeric(14, 2) not null check (value > 0),
  currency           text not null,
  source_type        text not null check (source_type in ('aggregate', 'manual', 'manual_override', 'regional_fallback')),
  source_id          uuid,
  clinic_count       integer,
  aggregation_method text,
  calculated_at      timestamptz,
  published_at       timestamptz not null default now(),
  is_demo            boolean not null default false,
  primary key (location_kind, location_id, service_code, tier),
  -- ТЗ §7.3: не публікувати агрегат без clinic_count, calculated_at і aggregation_method
  constraint published_aggregate_complete check (
    source_type <> 'aggregate'
    or (clinic_count is not null and calculated_at is not null and aggregation_method is not null))
);

-- Кожна зміна опублікованого значення (також зникнення рядка) дописується сюди.
create table public.published_price_history (
  id                 bigint generated always as identity primary key,
  location_kind      text not null,
  location_id        text not null,
  service_code       text not null,
  tier               text not null,
  change_type        text not null check (change_type in ('set', 'removed')),
  value              numeric(14, 2),
  previous_value     numeric(14, 2),
  currency           text,
  source_type        text,
  source_id          uuid,
  clinic_count       integer,
  aggregation_method text,
  calculated_at      timestamptz,
  is_demo            boolean,
  published_at       timestamptz not null default now()
);
create index published_price_history_key_idx
  on public.published_price_history (location_kind, location_id, service_code, tier, id desc);

-- ───────────────────────── Черга перерахунку, журнал, заявки, адміни ─────────────────────────

create table public.recalc_queue (
  city_id      text not null references public.cities (id),
  service_code text not null references public.services (service_code),
  tier         text not null,
  enqueued_at  timestamptz not null default now(),
  attempts     integer not null default 0,
  last_error   text,
  primary key (city_id, service_code, tier)
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor      uuid,
  table_name text not null,
  record_pk  text,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data   jsonb,
  new_data   jsonb,
  reason     text,
  at         timestamptz not null default now()
);
create index audit_log_record_idx on public.audit_log (table_name, record_pk, at desc);
create index audit_log_at_idx on public.audit_log (at desc);

create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  payload         jsonb not null,
  phone           text not null,
  phone_digits    text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  location_kind   text,
  location_id     text,
  intent          text not null check (intent in ('refine', 'send_calculation')),
  telegram_status text not null default 'pending' check (telegram_status in ('pending', 'sent', 'failed')),
  telegram_error  text,
  attempts        integer not null default 0,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index leads_phone_idx on public.leads (phone_digits, created_at desc);
create index leads_created_idx on public.leads (created_at desc);

create table public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Допоміжний довідник рівнів ─────────────────────────

-- Для кожної активної послуги — рівні, які мають сенс: tiered → minimum/classic/premium, інакше common.
create view public.service_tiers with (security_invoker = true) as
  select s.service_code, t.tier
  from public.services s
  cross join (values ('minimum'), ('classic'), ('premium')) as t (tier)
  where s.active and s.tiered
  union all
  select s.service_code, 'common'
  from public.services s
  where s.active and not s.tiered;
