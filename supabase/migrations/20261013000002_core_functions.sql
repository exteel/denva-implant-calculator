-- DENVA AI v2 · 02 · Ядро: агрегація, публікація, перерахунок (ТЗ §2.3, §3, §4.4, §8)
--
-- Усі функції — security definer з фіксованим search_path; виконувати їх можуть лише ролі,
-- яким явно видано EXECUTE в …000006_rls_grants.sql.

-- ───────────────────────── Доступ ─────────────────────────

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.assert_admin()
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Недостатньо прав: потрібна роль адміністратора' using errcode = '42501';
  end if;
end;
$$;

-- ───────────────────────── Валюти (ТЗ §4.4) ─────────────────────────

-- Курс «грн за 1 одиницю валюти» на дату: останній запис із rate_date <= дата. UAH = 1.
create or replace function public.fx_rate_to_uah(p_currency text, p_at date default current_date)
returns numeric
language sql stable security definer set search_path = public
as $$
  select case
    when p_currency = 'UAH' then 1::numeric
    else (select r.rate_to_uah
          from public.currency_rates r
          where r.currency = p_currency and r.rate_date <= p_at
          order by r.rate_date desc
          limit 1)
  end;
$$;

-- Нормалізація суми у валюту міста (через гривню). Помилка, якщо курсу немає.
create or replace function public.normalize_to_currency(
  p_amount numeric, p_from text, p_to text, p_at date default current_date)
returns numeric
language plpgsql stable security definer set search_path = public
as $$
declare
  v_from numeric;
  v_to   numeric;
begin
  if p_from = p_to then
    return p_amount;
  end if;
  v_from := public.fx_rate_to_uah(p_from, p_at);
  v_to   := public.fx_rate_to_uah(p_to, p_at);
  if v_from is null then
    raise exception 'Немає курсу % на дату %', p_from, p_at using errcode = 'P0002';
  end if;
  if v_to is null then
    raise exception 'Немає курсу % на дату %', p_to, p_at using errcode = 'P0002';
  end if;
  return p_amount * v_from / v_to;
end;
$$;

-- Те саме, але без помилки (для переглядів): null, якщо курсу немає.
create or replace function public.try_normalize_to_currency(
  p_amount numeric, p_from text, p_to text, p_at date default current_date)
returns numeric
language plpgsql stable security definer set search_path = public
as $$
begin
  return public.normalize_to_currency(p_amount, p_from, p_to, p_at);
exception when others then
  return null;
end;
$$;

-- ───────────────────────── Агрегація (ТЗ §3.1–3.2) ─────────────────────────

-- Рахує вибірку для (місто, послуга, рівень) і дописує snapshot у city_aggregates.
-- Повертає id snapshot-а. Помилка (наприклад, немає курсу) → нічого не записується.
create or replace function public.compute_aggregate(p_city_id text, p_service_code text, p_tier text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_city     public.cities%rowtype;
  v_set      public.settings%rowtype;
  v_today    date := current_date;
  v_cutoff   timestamptz;
  v_count    integer;
  v_vals     numeric[];
  v_ids      uuid[];
  v_included jsonb;
  v_excluded jsonb;
  v_demo     boolean;
  v_value    numeric;
  v_id       uuid;
begin
  select * into v_city from public.cities where id = p_city_id;
  if not found then
    raise exception 'Невідоме місто %', p_city_id using errcode = 'P0002';
  end if;
  select * into v_set from public.settings;
  v_cutoff := now() - make_interval(months => v_set.stale_after_months);

  with cand as (
    select cp.id as cp_id, cp.clinic_id, c.name as clinic_name, c.network_id,
           c.created_at as clinic_created, cp.valid_from, cp.verified_at,
           cp.created_at as cp_created, cp.value as orig_value, cp.currency,
           (cp.is_demo or c.is_demo) as demo,
           case
             when c.status <> 'active' then 'клініка неактивна'
             when cp.status = 'rejected' then 'ціна відхилена'
             when cp.status = 'pending' then 'ціна не підтверджена'
             when cp.status = 'stale' then 'застаріла'
             when not cp.include_in_aggregate then
               'виключено адміністратором' || coalesce(': ' || nullif(btrim(cp.exclude_reason), ''), '')
             when cp.verified_at is null then 'ціна не підтверджена'
             when cp.verified_at < v_cutoff then 'застаріла'
           end as reason
    from public.clinic_prices cp
    join public.clinics c on c.id = cp.clinic_id
    where c.city_id = p_city_id
      and cp.service_code = p_service_code
      and cp.tier = p_tier
  ),
  valid as (
    select cand.*,
           round(public.normalize_to_currency(orig_value, currency, v_city.currency, v_today), 2) as norm
    from cand
    where reason is null
  ),
  -- один голос на клініку: найсвіжіший валідний запис
  ranked as (
    select valid.*,
           row_number() over (
             partition by clinic_id
             order by valid_from desc, verified_at desc nulls last, cp_created desc, cp_id) as rn
    from valid
  ),
  winners as (select * from ranked where rn = 1),
  -- філії однієї мережі з ідентичною нормалізованою ціною = одне джерело
  netted as (
    select winners.*,
           case when network_id is null then 1
                else row_number() over (partition by network_id, norm order by clinic_created, clinic_id)
           end as rn_net
    from winners
  ),
  sources as (select * from netted where rn_net = 1),
  excl as (
    select cp_id, clinic_id, clinic_name,
           public.try_normalize_to_currency(orig_value, currency, v_city.currency, v_today) as v,
           reason
    from cand where reason is not null
    union all
    select cp_id, clinic_id, clinic_name, norm, 'дублікат клініки' from ranked where rn > 1
    union all
    select cp_id, clinic_id, clinic_name, norm, 'філія мережі з тим самим прайсом' from netted where rn_net > 1
  )
  select
    (select count(*) from sources)::integer,
    (select array_agg(norm order by norm) from sources),
    (select array_agg(cp_id order by norm, cp_id) from sources),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'clinic_price_id', cp_id, 'clinic_id', clinic_id, 'clinic_name', clinic_name,
        'value_uah', norm, 'valid_from', valid_from) order by norm, cp_id), '[]'::jsonb) from sources),
    (select coalesce(jsonb_agg(jsonb_build_object(
        'clinic_price_id', cp_id, 'clinic_id', clinic_id, 'clinic_name', clinic_name,
        'value_uah', v, 'reason', reason) order by clinic_name, cp_id), '[]'::jsonb) from excl),
    (select coalesce(bool_or(demo), false) from sources)
  into v_count, v_vals, v_ids, v_included, v_excluded, v_demo;

  if v_count = 0 then
    v_value := null;
  elsif v_set.aggregation_method = 'arithmetic_mean' then
    select avg(x) into v_value from unnest(v_vals) as x;
  elsif v_count % 2 = 1 then
    v_value := v_vals[(v_count + 1) / 2];
  else
    v_value := (v_vals[v_count / 2] + v_vals[v_count / 2 + 1]) / 2;
  end if;

  insert into public.city_aggregates
    (city_id, service_code, tier, value, clinic_count, method, included_ids, included, excluded, is_demo)
  values
    (p_city_id, p_service_code, p_tier, round(v_value, 2), v_count, v_set.aggregation_method,
     coalesce(v_ids, '{}'), v_included, v_excluded, v_demo)
  returning id into v_id;

  return v_id;
end;
$$;

-- ───────────────────────── Публікація (ТЗ §2.3) ─────────────────────────

-- Записує published_prices лише якщо значення/джерело справді змінилися; зміни йдуть в історію.
-- p_value is null → рядка бути не повинно (видаляємо, якщо був).
create or replace function public.apply_published_price(
  p_kind text, p_location_id text, p_service_code text, p_tier text,
  p_value numeric, p_currency text, p_source_type text, p_source_id uuid,
  p_clinic_count integer, p_method text, p_calculated_at timestamptz, p_is_demo boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_old public.published_prices%rowtype;
  v_has boolean;
begin
  select * into v_old from public.published_prices
   where location_kind = p_kind and location_id = p_location_id
     and service_code = p_service_code and tier = p_tier
   for update;
  v_has := found;

  if p_value is null then
    if v_has then
      insert into public.published_price_history
        (location_kind, location_id, service_code, tier, change_type, value, previous_value,
         currency, source_type, source_id, clinic_count, aggregation_method, calculated_at, is_demo)
      values
        (p_kind, p_location_id, p_service_code, p_tier, 'removed', null, v_old.value,
         v_old.currency, v_old.source_type, v_old.source_id, v_old.clinic_count,
         v_old.aggregation_method, v_old.calculated_at, v_old.is_demo);
      delete from public.published_prices
       where location_kind = p_kind and location_id = p_location_id
         and service_code = p_service_code and tier = p_tier;
      return true;
    end if;
    return false;
  end if;

  if v_has
     and v_old.value = p_value
     and v_old.currency = p_currency
     and v_old.source_type = p_source_type
     and v_old.clinic_count is not distinct from p_clinic_count
     and v_old.aggregation_method is not distinct from p_method
     and v_old.is_demo = p_is_demo then
    return false;   -- нічого не змінилось: ні запису, ні історії
  end if;

  insert into public.published_prices
    (location_kind, location_id, service_code, tier, value, currency, source_type, source_id,
     clinic_count, aggregation_method, calculated_at, published_at, is_demo)
  values
    (p_kind, p_location_id, p_service_code, p_tier, p_value, p_currency, p_source_type, p_source_id,
     p_clinic_count, p_method, p_calculated_at, now(), p_is_demo)
  on conflict (location_kind, location_id, service_code, tier) do update set
    value = excluded.value, currency = excluded.currency, source_type = excluded.source_type,
    source_id = excluded.source_id, clinic_count = excluded.clinic_count,
    aggregation_method = excluded.aggregation_method, calculated_at = excluded.calculated_at,
    published_at = excluded.published_at, is_demo = excluded.is_demo;

  insert into public.published_price_history
    (location_kind, location_id, service_code, tier, change_type, value, previous_value,
     currency, source_type, source_id, clinic_count, aggregation_method, calculated_at, is_demo)
  values
    (p_kind, p_location_id, p_service_code, p_tier, 'set', p_value, v_old.value,
     p_currency, p_source_type, p_source_id, p_clinic_count, p_method, p_calculated_at, p_is_demo);
  return true;
end;
$$;

-- Вибір джерела за пріоритетом ТЗ §2.3 і публікація для міста. Повертає source_type або null.
create or replace function public.publish_price(p_city_id text, p_service_code text, p_tier text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_city      public.cities%rowtype;
  v_set       public.settings%rowtype;
  v_mode      text;
  v_threshold integer;
  v_manual    public.city_manual_prices%rowtype;
  v_agg       public.city_aggregates%rowtype;
  v_region    public.region_manual_prices%rowtype;
  v_has_manual boolean;
  v_has_agg    boolean;
  v_has_region boolean;
  v_source    text;
begin
  select * into v_city from public.cities where id = p_city_id;
  if not found then
    raise exception 'Невідоме місто %', p_city_id using errcode = 'P0002';
  end if;
  select * into v_set from public.settings;
  select coalesce((select pm.mode from public.price_modes pm
                    where pm.city_id = p_city_id and pm.service_code = p_service_code and pm.tier = p_tier),
                  'auto') into v_mode;
  v_threshold := coalesce(v_city.min_clinics, v_set.min_clinics);

  select * into v_manual from public.city_manual_prices
   where city_id = p_city_id and service_code = p_service_code and tier = p_tier;
  v_has_manual := found;
  select * into v_agg from public.city_aggregates
   where city_id = p_city_id and service_code = p_service_code and tier = p_tier
   order by seq desc limit 1;
  v_has_agg := found;
  select * into v_region from public.region_manual_prices
   where region_id = v_city.region_id and service_code = p_service_code and tier = p_tier;
  v_has_region := found;

  if v_mode = 'manual_override' and v_has_manual then
    v_source := 'manual_override';
  elsif v_mode = 'auto' and v_has_agg and v_agg.value is not null and v_agg.clinic_count >= v_threshold then
    v_source := 'aggregate';
  elsif v_has_manual then
    v_source := 'manual';
  elsif v_has_region then
    v_source := 'regional_fallback';
  end if;

  if v_source = 'aggregate' then
    perform public.apply_published_price('city', p_city_id, p_service_code, p_tier,
      v_agg.value, v_city.currency, 'aggregate', v_agg.id, v_agg.clinic_count, v_agg.method,
      v_agg.calculated_at, v_agg.is_demo);
  elsif v_source in ('manual', 'manual_override') then
    perform public.apply_published_price('city', p_city_id, p_service_code, p_tier,
      v_manual.value, v_city.currency, v_source, v_manual.id, null, null, null, v_manual.is_demo);
  elsif v_source = 'regional_fallback' then
    perform public.apply_published_price('city', p_city_id, p_service_code, p_tier,
      round(public.normalize_to_currency(v_region.value, v_region.currency, v_city.currency), 2),
      v_city.currency, 'regional_fallback', v_region.id, null, null, null, v_region.is_demo);
  else
    perform public.apply_published_price('city', p_city_id, p_service_code, p_tier,
      null, null, null, null, null, null, null, false);
  end if;

  return v_source;
end;
$$;

-- Рядок рівня області (коли пацієнт обирає область, а не місто): прямо з region_manual_prices.
create or replace function public.publish_region_price(p_region_id text, p_service_code text, p_tier text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_region public.region_manual_prices%rowtype;
begin
  select * into v_region from public.region_manual_prices
   where region_id = p_region_id and service_code = p_service_code and tier = p_tier;
  if found then
    perform public.apply_published_price('region', p_region_id, p_service_code, p_tier,
      v_region.value, v_region.currency, 'regional_fallback', v_region.id, null, null, null, v_region.is_demo);
  else
    perform public.apply_published_price('region', p_region_id, p_service_code, p_tier,
      null, null, null, null, null, null, null, false);
  end if;
end;
$$;

-- Перерахунок = агрегат + публікація; ідемпотентний (повторний виклик не змінює published_prices).
create or replace function public.recalculate(p_city_id text, p_service_code text, p_tier text)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_city_id || '|' || p_service_code || '|' || p_tier, 0));
  perform public.compute_aggregate(p_city_id, p_service_code, p_tier);
  return public.publish_price(p_city_id, p_service_code, p_tier);
end;
$$;

-- ───────────────────────── Черга (ТЗ §3.3, §8: асинхронно) ─────────────────────────

create or replace function public.enqueue_recalc(p_city_id text, p_service_code text, p_tier text)
returns void
language sql security definer set search_path = public
as $$
  insert into public.recalc_queue (city_id, service_code, tier)
  values (p_city_id, p_service_code, p_tier)
  on conflict do nothing;
$$;

-- Усі комбінації активних міст × активних послуг × рівнів (зміна налаштувань).
create or replace function public.enqueue_all_combos()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_n integer;
begin
  insert into public.recalc_queue (city_id, service_code, tier)
  select c.id, st.service_code, st.tier
  from public.cities c
  cross join public.service_tiers st
  where c.active
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Усі комбінації одного міста (нове місто, зміна валюти/регіону/порогу).
create or replace function public.enqueue_city_combos(p_city_id text)
returns void
language sql security definer set search_path = public
as $$
  insert into public.recalc_queue (city_id, service_code, tier)
  select p_city_id, st.service_code, st.tier from public.service_tiers st
  on conflict do nothing;
$$;

-- Обробляє чергу. Кожна позиція — окрема субтранзакція: збій однієї (наприклад, немає курсу)
-- не зупиняє решту і не змінює опублікованих цін; позиція лишається в черзі з attempts/last_error.
create or replace function public.process_recalc_queue(p_max integer default 500)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_done integer := 0;
begin
  for r in
    select q.city_id, q.service_code, q.tier
    from public.recalc_queue q
    order by q.attempts, q.enqueued_at
    limit p_max
    for update skip locked
  loop
    begin
      perform public.recalculate(r.city_id, r.service_code, r.tier);
      delete from public.recalc_queue
       where city_id = r.city_id and service_code = r.service_code and tier = r.tier;
      v_done := v_done + 1;
    exception when others then
      update public.recalc_queue
         set attempts = attempts + 1, last_error = left(sqlerrm, 500)
       where city_id = r.city_id and service_code = r.service_code and tier = r.tier;
    end;
  end loop;
  return v_done;
end;
$$;

-- Позначає застарілі підтверджені ціни (старші за settings.stale_after_months) як stale.
-- Тригери самі поставлять зачеплені комбінації в чергу. Запускається щодня (pg_cron).
create or replace function public.mark_stale_prices()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_n integer;
begin
  update public.clinic_prices cp
     set status = 'stale'
   where cp.status = 'approved'
     and cp.verified_at < now() - make_interval(months => (select stale_after_months from public.settings));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Адмін-RPC: перерахувати зараз (без очікування cron).
create or replace function public.recalculate_now(p_city_id text, p_service_code text, p_tier text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_source text;
begin
  perform public.assert_admin();
  v_source := public.recalculate(p_city_id, p_service_code, p_tier);
  delete from public.recalc_queue
   where city_id = p_city_id and service_code = p_service_code and tier = p_tier;
  return v_source;
end;
$$;

create or replace function public.process_queue_now()
returns integer
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_admin();
  return public.process_recalc_queue(500);
end;
$$;
