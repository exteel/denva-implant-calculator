-- DENVA AI v2 · 04 · API: публічні RPC, адмін-вигляди й RPC, імпорт, заявки
-- Форми відповідей — рівно за src/lib/contracts.ts.

-- ───────────────────────── Публічне читання (anon) ─────────────────────────

-- ListLocationsResponse: активні міста + області.
create or replace function public.list_locations()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x.loc order by x.kind_rank, x.name), '[]'::jsonb)
  from (
    select 0 as kind_rank, c.name,
           jsonb_build_object(
             'kind', 'city', 'id', c.id, 'name', c.name,
             'region_id', c.region_id, 'region_name', r.name,
             'aliases', to_jsonb(c.aliases)) as loc
    from public.cities c
    join public.regions r on r.id = c.region_id
    where c.active
    union all
    select 1, r.name,
           jsonb_build_object(
             'kind', 'region', 'id', r.id, 'name', r.name,
             'region_id', null, 'region_name', null, 'aliases', '[]'::jsonb)
    from public.regions r
    where r.active
  ) x;
$$;

-- LocationPricesResponse: лише ОПУБЛІКОВАНІ значення обраної локації; жодних даних клінік.
create or replace function public.get_location_prices(p_kind text, p_id text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_location jsonb;
  v_currency text;
  v_eur      jsonb;
begin
  if p_kind = 'city' then
    select jsonb_build_object(
             'kind', 'city', 'id', c.id, 'name', c.name,
             'region_id', c.region_id, 'region_name', r.name, 'aliases', to_jsonb(c.aliases)),
           c.currency
      into v_location, v_currency
      from public.cities c
      join public.regions r on r.id = c.region_id
     where c.id = p_id and c.active;
  elsif p_kind = 'region' then
    select jsonb_build_object(
             'kind', 'region', 'id', r.id, 'name', r.name,
             'region_id', null, 'region_name', null, 'aliases', '[]'::jsonb),
           'UAH'
      into v_location, v_currency
      from public.regions r
     where r.id = p_id and r.active;
  else
    raise exception 'Невідомий вид локації: % (очікується city або region)', p_kind using errcode = '22023';
  end if;

  if v_location is null then
    raise exception 'Локацію не знайдено: % %', p_kind, p_id using errcode = 'P0002';
  end if;

  select jsonb_build_object('rate', r.rate_to_uah, 'date', r.rate_date)
    into v_eur
    from public.currency_rates r
   where r.currency = 'EUR' and r.rate_date <= current_date
   order by r.rate_date desc
   limit 1;

  return jsonb_build_object(
    'location', v_location,
    'currency', v_currency,
    'eur_rate', v_eur,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'service_code', s.service_code, 'name', s.name, 'role', s.role, 'unit', s.unit,
               'tiered', s.tiered, 'included_text', s.included_text, 'sort', s.sort)
             order by s.sort, s.service_code)
      from public.services s where s.active), '[]'::jsonb),
    'prices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'service_code', pp.service_code, 'tier', pp.tier, 'value', pp.value,
               'currency', pp.currency, 'source_type', pp.source_type,
               'clinic_count', pp.clinic_count, 'calculated_at', pp.calculated_at,
               'published_at', pp.published_at, 'is_demo', pp.is_demo)
             order by s.sort, pp.service_code, pp.tier)
      from public.published_prices pp
      join public.services s on s.service_code = pp.service_code and s.active
      where pp.location_kind = p_kind and pp.location_id = p_id), '[]'::jsonb)
  );
end;
$$;

-- ───────────────────────── Адмін-вигляди ─────────────────────────

-- AdminPriceMatrixRow: місто × послуга × застосовний рівень (лише активні).
create view public.admin_price_matrix with (security_invoker = true) as
select
  c.id                     as city_id,
  c.name                   as city_name,
  s.service_code           as service_code,
  s.name                   as service_name,
  st.tier                  as tier,
  coalesce(pm.mode, 'auto') as mode,
  cmp.value                as manual_value,
  rmp.value                as region_value,
  agg.value                as aggregate_value,
  agg.clinic_count         as aggregate_clinic_count,
  agg.calculated_at        as aggregate_calculated_at,
  agg.method               as aggregate_method,
  pp.value                 as published_value,
  pp.source_type           as published_source_type,
  pp.published_at          as published_at,
  coalesce(c.min_clinics, (select min_clinics from public.settings)) as min_clinics
from public.cities c
cross join public.services s
join public.service_tiers st on st.service_code = s.service_code
left join public.price_modes pm
       on pm.city_id = c.id and pm.service_code = s.service_code and pm.tier = st.tier
left join public.city_manual_prices cmp
       on cmp.city_id = c.id and cmp.service_code = s.service_code and cmp.tier = st.tier
left join public.region_manual_prices rmp
       on rmp.region_id = c.region_id and rmp.service_code = s.service_code and rmp.tier = st.tier
left join lateral (
  select a.value, a.clinic_count, a.calculated_at, a.method
  from public.city_aggregates a
  where a.city_id = c.id and a.service_code = s.service_code and a.tier = st.tier
  order by a.seq desc
  limit 1
) agg on true
left join public.published_prices pp
       on pp.location_kind = 'city' and pp.location_id = c.id
      and pp.service_code = s.service_code and pp.tier = st.tier
where c.active and s.active;

-- ТЗ §7.3: відхилення ціни клініки від чинного агрегату міста.
-- deviation_pct = (ціна клініки в валюті міста − агрегат) / агрегат × 100; warning — понад поріг із settings.
create view public.admin_clinic_prices with (security_invoker = true) as
select
  cp.id                 as clinic_price_id,
  cp.clinic_id,
  cl.name               as clinic_name,
  cl.city_id,
  ci.name               as city_name,
  cl.network_id,
  cl.status             as clinic_status,
  cp.service_code,
  s.name                as service_name,
  cp.tier,
  cp.price_from,
  cp.price_to,
  cp.value,
  cp.currency,
  n.norm                as value_city_currency,
  agg.value             as aggregate_value,
  agg.clinic_count      as aggregate_clinic_count,
  case when agg.value > 0 and n.norm is not null
       then round((n.norm - agg.value) / agg.value * 100, 1) end as deviation_pct,
  coalesce(abs((n.norm - agg.value) / nullif(agg.value, 0) * 100) > st.deviation_warning_pct, false) as warning,
  cp.status,
  cp.include_in_aggregate,
  cp.exclude_reason,
  cp.valid_from,
  cp.verified_at,
  cp.offer_name,
  cp.brand_material,
  cp.included_text,
  cp.exclusions,
  cp.source_url,
  cp.document_path,
  cp.import_batch_id,
  cp.is_demo,
  cp.created_at,
  cp.updated_at
from public.clinic_prices cp
join public.clinics cl on cl.id = cp.clinic_id
join public.cities ci on ci.id = cl.city_id
left join public.services s on s.service_code = cp.service_code
cross join public.settings st
cross join lateral (
  select public.try_normalize_to_currency(cp.value, cp.currency, ci.currency) as norm
) n
left join lateral (
  select a.value, a.clinic_count
  from public.city_aggregates a
  where a.city_id = cl.city_id and a.service_code = cp.service_code and a.tier = cp.tier
  order by a.seq desc
  limit 1
) agg on true;

-- AggregateDetail: останній snapshot + що увійшло / що виключено і чому.
create or replace function public.admin_aggregate_detail(p_city_id text, p_service_code text, p_tier text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_a public.city_aggregates%rowtype;
begin
  perform public.assert_admin();
  select * into v_a from public.city_aggregates
   where city_id = p_city_id and service_code = p_service_code and tier = p_tier
   order by seq desc limit 1;
  if not found then
    return jsonb_build_object('snapshot', null, 'included', '[]'::jsonb, 'excluded', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'snapshot', jsonb_build_object(
      'id', v_a.id, 'value', v_a.value, 'clinic_count', v_a.clinic_count,
      'method', v_a.method, 'calculated_at', v_a.calculated_at),
    'included', v_a.included,
    'excluded', v_a.excluded);
end;
$$;

-- ───────────────────────── Імпорт прайсу клініки (ТЗ §7.4, §8) ─────────────────────────

-- ImportPayload → ImportReport. Усі прийняті рядки створюються зі статусом pending («На перевірці»),
-- тож до підтвердження модератором не впливають на агрегати і калькулятор (ТЗ §9).
create or replace function public.import_clinic_prices(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_clinic     jsonb := p_payload -> 'clinic';
  v_clinic_id  uuid;
  v_city_id    text;
  v_batch_id   uuid;
  v_valid_from date;
  v_def_cur    text;
  v_row        jsonb;
  v_idx        integer;
  v_n          integer;
  v_from       numeric;
  v_to         numeric;
  v_value      numeric;
  v_cur        text;
  v_code       text;
  v_tier       text;
  v_tiered     boolean;
  v_offer      text;
  v_key        text;
  v_keys       text[] := '{}';
  v_msg        text;
  v_dup        boolean;
  v_accepted   integer[] := '{}';
  v_dups       integer[] := '{}';
  v_unknown    integer[] := '{}';
  v_errors     jsonb := '[]'::jsonb;
  v_report     jsonb;
  v_total      integer;
begin
  perform public.assert_admin();
  if v_clinic is null or jsonb_typeof(p_payload -> 'rows') is distinct from 'array' then
    raise exception 'Некоректний payload імпорту: потрібні clinic та rows' using errcode = '22023';
  end if;

  v_def_cur := upper(coalesce(nullif(btrim(v_clinic ->> 'currency'), ''), 'UAH'));
  v_valid_from := coalesce(nullif(btrim(v_clinic ->> 'valid_from'), '')::date, current_date);

  if nullif(btrim(v_clinic ->> 'clinic_id'), '') is not null then
    v_clinic_id := (v_clinic ->> 'clinic_id')::uuid;
    if not exists (select 1 from public.clinics where id = v_clinic_id) then
      raise exception 'Клініку % не знайдено', v_clinic_id using errcode = 'P0002';
    end if;
  else
    v_city_id := v_clinic ->> 'city_id';
    if not exists (select 1 from public.cities where id = v_city_id) then
      raise exception 'Місто % не знайдено', v_city_id using errcode = 'P0002';
    end if;
    if nullif(btrim(v_clinic ->> 'name'), '') is null then
      raise exception 'Не вказано назву клініки' using errcode = '22023';
    end if;
    -- та сама клініка (місто + назва без урахування регістру) використовується повторно
    select id into v_clinic_id from public.clinics
     where city_id = v_city_id and lower(btrim(name)) = lower(btrim(v_clinic ->> 'name'))
     order by created_at limit 1;
    if v_clinic_id is null then
      insert into public.clinics (name, city_id, contacts, status)
      values (btrim(v_clinic ->> 'name'), v_city_id, nullif(btrim(v_clinic ->> 'contacts'), ''), 'draft')
      returning id into v_clinic_id;
    end if;
  end if;

  v_total := jsonb_array_length(p_payload -> 'rows');
  insert into public.import_batches (file_name, clinic_id, row_count)
  values (p_payload ->> 'file_name', v_clinic_id, v_total)
  returning id into v_batch_id;

  for v_row, v_idx in
    select r.value, r.ord::integer from jsonb_array_elements(p_payload -> 'rows') with ordinality as r (value, ord)
  loop
    v_n := coalesce(nullif(v_row ->> 'row_number', '')::integer, v_idx);
    v_msg := null;
    v_code := null; v_tier := null; v_dup := false;
    begin
      -- ціни
      if jsonb_typeof(v_row -> 'price_from') = 'number' then
        v_from := (v_row ->> 'price_from')::numeric;
      else
        v_from := null;
      end if;
      if v_from is null or v_from <= 0 then
        v_msg := 'Ціна від має бути числом більше нуля';
      elsif jsonb_typeof(v_row -> 'price_to') = 'number' then
        v_to := (v_row ->> 'price_to')::numeric;
        if v_to < v_from then
          v_msg := 'Ціна до не може бути меншою за ціну від';
        end if;
      elsif v_row -> 'price_to' is not null and jsonb_typeof(v_row -> 'price_to') <> 'null' then
        v_msg := 'Ціна до має бути числом';
      else
        v_to := null;
      end if;

      -- валюта
      v_cur := upper(coalesce(nullif(btrim(v_row ->> 'currency'), ''), v_def_cur));
      if v_msg is null and v_cur not in ('UAH', 'EUR', 'USD') then
        v_msg := 'Недозволена валюта: ' || v_cur || ' (дозволені UAH, EUR, USD)';
      end if;

      -- рівень
      v_tier := nullif(btrim(v_row ->> 'tier'), '');
      if v_msg is null and v_tier is not null and v_tier not in ('common', 'minimum', 'classic', 'premium') then
        v_msg := 'Невірний рівень: ' || v_tier;
      end if;

      -- service_code
      v_code := nullif(btrim(v_row ->> 'service_code'), '');
      if v_msg is null and v_code is not null then
        select tiered into v_tiered from public.services where service_code = v_code;
        if not found then
          v_unknown := v_unknown || v_n;
          v_code := '?';     -- позначка «невідомий», рядок не вставляємо
        elsif v_tiered and v_tier is not null and v_tier = 'common' then
          v_msg := 'Для послуги ' || v_code || ' потрібен рівень minimum, classic або premium';
        elsif not v_tiered and v_tier is not null and v_tier <> 'common' then
          v_msg := 'Послуга ' || v_code || ' не має рівнів: використовуйте common';
        elsif not v_tiered and v_tier is null then
          v_tier := 'common';
        end if;
      end if;

      if v_msg is not null then
        v_errors := v_errors || jsonb_build_object('row_number', v_n, 'message', v_msg);
      elsif v_code = '?' then
        null;   -- уже в unknown_service_code
      else
        v_value := round((v_from + coalesce(v_to, v_from)) / 2, 3);
        v_offer := nullif(btrim(v_row ->> 'offer_name'), '');
        v_key := concat_ws('|', coalesce(v_code, '-'), coalesce(v_tier, '-'), v_value::text, v_cur,
                           case when v_code is null then lower(coalesce(v_offer, '')) end);
        if v_key = any (v_keys) then
          v_dup := true;
        elsif exists (
          select 1 from public.clinic_prices cp
           where cp.clinic_id = v_clinic_id
             and cp.status in ('pending', 'approved')
             and cp.service_code is not distinct from v_code
             and cp.tier is not distinct from v_tier
             and cp.value = v_value
             and cp.currency = v_cur
             and (v_code is not null or lower(coalesce(cp.offer_name, '')) = lower(coalesce(v_offer, '')))
        ) then
          v_dup := true;
        end if;

        if v_dup then
          v_dups := v_dups || v_n;
        else
          insert into public.clinic_prices
            (clinic_id, service_code, tier, price_from, price_to, currency, offer_name, brand_material,
             included_text, exclusions, valid_from, status, source_url, import_batch_id)
          values
            (v_clinic_id, v_code, v_tier, v_from, v_to, v_cur, v_offer,
             nullif(btrim(v_row ->> 'brand_material'), ''), nullif(btrim(v_row ->> 'included_text'), ''),
             nullif(btrim(v_row ->> 'exclusions'), ''), v_valid_from, 'pending',
             nullif(btrim(v_row ->> 'source'), ''), v_batch_id);
          v_keys := v_keys || v_key;
          v_accepted := v_accepted || v_n;
        end if;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row_number', v_n, 'message', 'Помилка рядка: ' || sqlerrm);
    end;
  end loop;

  v_report := jsonb_build_object(
    'batch_id', v_batch_id,
    'clinic_id', v_clinic_id,
    'accepted', to_jsonb(v_accepted),
    'errors', v_errors,
    'duplicates', to_jsonb(v_dups),
    'unknown_service_code', to_jsonb(v_unknown),
    'pending_moderation', to_jsonb(v_accepted));
  update public.import_batches set report = v_report where id = v_batch_id;
  return v_report;
end;
$$;

-- ───────────────────────── Адмін-RPC з причиною зміни ─────────────────────────
-- PostgREST виконує кожен запит в окремій транзакції, тому «причину» для журналу
-- (audit_log.reason) передаємо через ці RPC, а не окремим set_config.

create or replace function public.admin_set_clinic_price_status(
  p_ids uuid[], p_status text, p_reason text default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_n integer;
begin
  perform public.assert_admin();
  if p_status not in ('pending', 'approved', 'rejected', 'stale') then
    raise exception 'Невірний статус %', p_status using errcode = '22023';
  end if;
  perform set_config('denva.reason', coalesce(p_reason, ''), true);
  update public.clinic_prices set status = p_status
   where id = any (p_ids) and status is distinct from p_status;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- p_value null → видалити орієнтир.
create or replace function public.admin_set_city_manual_price(
  p_city_id text, p_service_code text, p_tier text, p_value numeric,
  p_value_from numeric default null, p_value_to numeric default null, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_admin();
  perform set_config('denva.reason', coalesce(p_reason, ''), true);
  if p_value is null then
    delete from public.city_manual_prices
     where city_id = p_city_id and service_code = p_service_code and tier = p_tier;
  else
    insert into public.city_manual_prices (city_id, service_code, tier, value, value_from, value_to)
    values (p_city_id, p_service_code, p_tier, p_value, p_value_from, p_value_to)
    on conflict (city_id, service_code, tier) do update
      set value = excluded.value, value_from = excluded.value_from, value_to = excluded.value_to;
  end if;
end;
$$;

create or replace function public.admin_set_region_manual_price(
  p_region_id text, p_service_code text, p_tier text, p_value numeric,
  p_value_from numeric default null, p_value_to numeric default null, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_admin();
  perform set_config('denva.reason', coalesce(p_reason, ''), true);
  if p_value is null then
    delete from public.region_manual_prices
     where region_id = p_region_id and service_code = p_service_code and tier = p_tier;
  else
    insert into public.region_manual_prices (region_id, service_code, tier, value, value_from, value_to)
    values (p_region_id, p_service_code, p_tier, p_value, p_value_from, p_value_to)
    on conflict (region_id, service_code, tier) do update
      set value = excluded.value, value_from = excluded.value_from, value_to = excluded.value_to;
  end if;
end;
$$;

create or replace function public.admin_set_price_mode(
  p_city_id text, p_service_code text, p_tier text, p_mode text, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_admin();
  perform set_config('denva.reason', coalesce(p_reason, ''), true);
  insert into public.price_modes (city_id, service_code, tier, mode)
  values (p_city_id, p_service_code, p_tier, p_mode)
  on conflict (city_id, service_code, tier) do update set mode = excluded.mode;
end;
$$;

-- Універсальний запис рядка з причиною для журналу (audit_log.reason).
-- Таблиці з білого списку; колонки беруться лише з ключів p_row, що є справжніми незгенерованими колонками.
create or replace function public._save_row(p_table text, p_pk_col text, p_pk text, p_row jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_cols text;
  v_res  jsonb;
begin
  if p_table not in ('regions', 'cities', 'services', 'clinics', 'settings', 'clinic_prices') then
    raise exception 'Таблиця % недоступна для цього RPC', p_table using errcode = '42501';
  end if;
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into v_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_table
     and p_row ? c.column_name
     and c.is_generated = 'NEVER'
     and c.column_name not in ('created_at', 'created_by', 'updated_at', 'updated_by')
     and (p_pk is null or c.column_name <> p_pk_col);   -- при оновленні ключ не чіпаємо
  if p_pk is null then
    if v_cols is null then
      raise exception 'Порожній рядок' using errcode = '22023';
    end if;
    execute format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning to_jsonb(%1$I)',
      p_table, v_cols) into v_res using p_row;
  else
    if v_cols is not null then
      execute format(
        'update public.%1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::public.%1$I, $1)) where %3$I::text = $2',
        p_table, v_cols, p_pk_col) using p_row, p_pk;
    end if;
    execute format('select to_jsonb(t) from public.%1$I t where %2$I::text = $1', p_table, p_pk_col)
      into v_res using p_pk;
    if v_res is null then
      raise exception 'Запис % не знайдено в %', p_pk, p_table using errcode = 'P0002';
    end if;
  end if;
  return v_res;
end;
$$;

-- Створити або змінити картку ціни клініки з причиною. p_id null → створення.
-- Частковий p_row: оновлюються лише передані поля.
create or replace function public.admin_save_clinic_price(p_id uuid, p_row jsonb, p_reason text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_res jsonb;
begin
  perform public.assert_admin();
  perform set_config('denva.reason', coalesce(p_reason, ''), true);
  v_res := public._save_row('clinic_prices', 'id', p_id::text, case when p_id is null then p_row - 'id' else p_row end);
  return (v_res ->> 'id')::uuid;
end;
$$;

-- Створити або змінити рядок довідника (regions, cities, services, clinics, settings) з причиною.
-- Рядок існує, якщо в p_row є первинний ключ існуючого запису → часткове оновлення; інакше вставка.
create or replace function public.admin_upsert_row(p_table text, p_row jsonb, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_pk_col text;
  v_pk     text;
  v_exists boolean;
begin
  perform public.assert_admin();
  v_pk_col := case p_table
    when 'regions' then 'id' when 'cities' then 'id' when 'services' then 'service_code'
    when 'clinics' then 'id' when 'settings' then 'id' end;
  if v_pk_col is null then
    raise exception 'Таблиця % недоступна для цього RPC', p_table using errcode = '42501';
  end if;
  perform set_config('denva.reason', coalesce(p_reason, ''), true);
  if p_table = 'settings' then
    p_row := p_row || '{"id": true}'::jsonb;
  end if;
  v_pk := p_row ->> v_pk_col;
  if v_pk is not null then
    execute format('select exists (select 1 from public.%I where %I::text = $1)', p_table, v_pk_col)
      into v_exists using v_pk;
  end if;
  return public._save_row(p_table, v_pk_col, case when v_exists then v_pk end, p_row);
end;
$$;

-- Видалити рядок (regions, cities, services, clinics, clinic_prices) з причиною.
-- Міста/послуги з історією агрегатів видалити не вийде (FK) — їх деактивують (active = false).
create or replace function public.admin_delete_row(p_table text, p_pk text, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pk_col text;
begin
  perform public.assert_admin();
  v_pk_col := case p_table
    when 'regions' then 'id' when 'cities' then 'id' when 'services' then 'service_code'
    when 'clinics' then 'id' when 'clinic_prices' then 'id' end;
  if v_pk_col is null then
    raise exception 'Таблиця % недоступна для цього RPC', p_table using errcode = '42501';
  end if;
  perform set_config('denva.reason', coalesce(p_reason, ''), true);
  execute format('delete from public.%I where %I::text = $1', p_table, v_pk_col) using p_pk;
end;
$$;

-- Перерахувати одразу всі комбінації одного міста. Повертає кількість комбінацій.
create or replace function public.recalculate_city(p_city_id text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  perform public.assert_admin();
  if not exists (select 1 from public.cities where id = p_city_id) then
    raise exception 'Невідоме місто %', p_city_id using errcode = 'P0002';
  end if;
  for r in select service_code, tier from public.service_tiers loop
    perform public.recalculate(p_city_id, r.service_code, r.tier);
    delete from public.recalc_queue
     where city_id = p_city_id and service_code = r.service_code and tier = r.tier;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- ───────────────────────── Заявки (ТЗ §6.3) ─────────────────────────

-- Викликається Edge Function submit-lead (service_role). Ліміт: ≤ 5 заявок на телефон за годину.
create or replace function public.submit_lead_record(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_phone  text := btrim(coalesce(p_payload ->> 'phone', ''));
  v_digits text := regexp_replace(btrim(coalesce(p_payload ->> 'phone', '')), '\D', '', 'g');
  v_intent text := p_payload ->> 'intent';
  v_id     uuid;
begin
  if length(v_digits) < 10 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if v_intent is null or v_intent not in ('refine', 'send_calculation') then
    raise exception 'invalid_intent' using errcode = '22023';
  end if;
  if (select count(*) from public.leads l
       where l.phone_digits = v_digits and l.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  insert into public.leads (payload, phone, location_kind, location_id, intent)
  values (p_payload, v_phone, p_payload #>> '{location,kind}', p_payload #>> '{location,id}', v_intent)
  returning id into v_id;
  return jsonb_build_object('lead_id', v_id);
end;
$$;

-- Оновлення стану відправки в Telegram (service_role).
create or replace function public.update_lead_telegram_status(
  p_lead_id uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'Невірний статус %', p_status using errcode = '22023';
  end if;
  update public.leads
     set telegram_status = p_status,
         telegram_error  = case when p_status = 'sent' then null else left(p_error, 500) end,
         attempts        = attempts + 1,
         sent_at         = case when p_status = 'sent' then now() else sent_at end
   where id = p_lead_id;
end;
$$;
