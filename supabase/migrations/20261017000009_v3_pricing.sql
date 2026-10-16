-- DENVA AI v3 (ТЗ 3.3) · 09 · Логіка: агрегація з baseline/hybrid, публікація, API у формі контракту v3.

-- ───────────────────────── Агрегація (ТЗ §3) ─────────────────────────

-- Рахує локальну вибірку і розраховане значення для (місто, послуга, рівень), дописує snapshot.
-- Значення (T = поріг: cities.min_clinics → settings.min_clinics, типово 3; n = кількість джерел):
--   n >= T  → медіана локальних            (aggregate)
--   0 < n < T → (n × медіана + (T−n) × baseline) / T   (hybrid; для T=3: 1 клініка = ⅓ + ⅔, 2 клініки = ⅔ + ⅓)
--   n = 0   → baseline: місто → область → Україна       (manual_baseline | regional_fallback | national_fallback)
-- Без baseline hybrid = медіана локальних (вага baseline 0), а за n = 0 значення відсутнє.
-- Усе нормалізується в UAH за курсом на дату snapshot, без округлення.
create or replace function public.compute_aggregate(p_city_id text, p_service_code text, p_tier text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_city      public.cities%rowtype;
  v_set       public.settings%rowtype;
  v_today     date := current_date;
  v_cutoff    timestamptz;
  v_t         integer;
  v_count     integer;
  v_vals      numeric[];
  v_ids       uuid[];
  v_included  jsonb;
  v_excluded  jsonb;
  v_demo      boolean;
  v_median    numeric;
  v_bl        numeric;
  v_bl_scope  text;
  v_bl_demo   boolean;
  v_row       record;
  v_value     numeric;
  v_type      text;
  v_scope     text;
  v_weights   jsonb;
  v_formula   text;
  v_scope_ua  text;
  v_id        uuid;
begin
  select * into v_city from public.cities where id = p_city_id;
  if not found then
    raise exception 'Невідоме місто %', p_city_id using errcode = 'P0002';
  end if;
  select * into v_set from public.settings;
  v_cutoff := now() - make_interval(months => v_set.stale_after_months);
  v_t := coalesce(v_city.min_clinics, v_set.min_clinics);

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
    select cand.*, public.normalize_to_currency(orig_value, currency, 'UAH', v_today) as norm
    from cand
    where reason is null
  ),
  -- одна клініка = один голос: найсвіжіший валідний запис
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
           public.try_normalize_to_currency(orig_value, currency, 'UAH', v_today) as v,
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
    v_median := null;
  elsif v_count % 2 = 1 then
    v_median := v_vals[(v_count + 1) / 2];
  else
    v_median := (v_vals[v_count / 2] + v_vals[v_count / 2 + 1]) / 2;
  end if;

  -- baseline: місто → область → Україна
  select m.value, m.is_demo, m.currency into v_row
    from (select cm.value, cm.is_demo, v_city.currency as currency
            from public.city_manual_prices cm
           where cm.city_id = p_city_id and cm.service_code = p_service_code and cm.tier = p_tier) m;
  if found then
    v_bl := public.normalize_to_currency(v_row.value, v_row.currency, 'UAH', v_today);
    v_bl_demo := v_row.is_demo;
    v_bl_scope := 'city';
  else
    select rm.value, rm.is_demo, rm.currency into v_row
      from public.region_manual_prices rm
     where rm.region_id = v_city.region_id and rm.service_code = p_service_code and rm.tier = p_tier;
    if found then
      v_bl := public.normalize_to_currency(v_row.value, v_row.currency, 'UAH', v_today);
      v_bl_demo := v_row.is_demo;
      v_bl_scope := 'region';
    else
      select km.value, km.is_demo, km.currency into v_row
        from public.country_manual_prices km
       where km.country_id = v_city.country_id and km.service_code = p_service_code and km.tier = p_tier;
      if found then
        v_bl := public.normalize_to_currency(v_row.value, v_row.currency, 'UAH', v_today);
        v_bl_demo := v_row.is_demo;
        v_bl_scope := 'country';
      end if;
    end if;
  end if;
  v_scope_ua := case v_bl_scope when 'city' then 'місто' when 'region' then 'область' when 'country' then 'Україна' end;

  if v_count >= v_t then
    v_value := v_median;
    v_type := 'aggregate';
    v_scope := 'city';
    v_weights := null;
    v_formula := format('медіана цін %s перевірених локальних клінік', v_count);
    -- baseline у snapshot лишається лише для довідки адміністратора; у PublicPrice для aggregate baseline_scope = null
  elsif v_count > 0 then
    v_type := 'hybrid';
    v_scope := 'city';
    if v_bl is null then
      v_value := v_median;
      v_weights := jsonb_build_object('local', 1, 'baseline', 0);
      v_formula := format('локальна медіана (%s клін.); базового орієнтира немає', v_count);
    else
      v_value := (v_count * v_median + (v_t - v_count) * v_bl) / v_t;
      v_weights := jsonb_build_object('local', v_count::float8 / v_t, 'baseline', (v_t - v_count)::float8 / v_t);
      v_formula := format('%s/%s × %s (%s клін.) + %s/%s × базовий орієнтир (%s)',
                          v_count, v_t, case when v_count = 1 then 'локальна ціна' else 'медіана локальних цін' end,
                          v_count, v_t - v_count, v_t, v_scope_ua);
    end if;
    v_demo := v_demo or coalesce(v_bl_demo, false);
  elsif v_bl is not null then
    v_value := v_bl;
    v_type := case v_bl_scope when 'city' then 'manual_baseline' when 'region' then 'regional_fallback' else 'national_fallback' end;
    v_scope := v_bl_scope;
    v_weights := null;
    v_formula := format('100%% базового орієнтира (%s)', v_scope_ua);
    v_demo := coalesce(v_bl_demo, false);
  else
    v_value := null;
    v_type := null;
    v_scope := null;
    v_weights := null;
    v_formula := 'немає даних: ні локальних прайсів, ні базового орієнтира';
  end if;

  insert into public.city_aggregates
    (city_id, service_code, tier, value, clinic_count, method, included_ids, included, excluded, is_demo,
     local_median, baseline_value, baseline_scope, blend_weights, formula, source_type, source_scope)
  values
    (p_city_id, p_service_code, p_tier, v_value, v_count, 'median', coalesce(v_ids, '{}'), v_included, v_excluded,
     coalesce(v_demo, false), v_median, v_bl, v_bl_scope, v_weights, v_formula, v_type, v_scope)
  returning id into v_id;

  return v_id;
end;
$$;

-- ───────────────────────── Публікація (ТЗ §2.3) ─────────────────────────

create or replace function public.apply_published_price(
  p_kind text, p_location_id text, p_service_code text, p_tier text,
  p_value numeric, p_source_type text, p_source_scope text, p_source_id uuid,
  p_local_count integer, p_baseline_scope text, p_weights jsonb,
  p_method text, p_calculated_at timestamptz, p_is_demo boolean)
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
        (location_kind, location_id, service_code, tier, change_type, value, previous_value, currency,
         source_type, source_scope, source_id, local_clinic_count, baseline_scope, blend_weights,
         aggregation_method, calculated_at, is_demo)
      values
        (p_kind, p_location_id, p_service_code, p_tier, 'removed', null, v_old.value, v_old.currency,
         v_old.source_type, v_old.source_scope, v_old.source_id, v_old.local_clinic_count, v_old.baseline_scope,
         v_old.blend_weights, v_old.aggregation_method, v_old.calculated_at, v_old.is_demo);
      delete from public.published_prices
       where location_kind = p_kind and location_id = p_location_id
         and service_code = p_service_code and tier = p_tier;
      return true;
    end if;
    return false;
  end if;

  if v_has
     and v_old.value = p_value
     and v_old.source_type = p_source_type
     and v_old.source_scope = p_source_scope
     and v_old.local_clinic_count = p_local_count
     and v_old.baseline_scope is not distinct from p_baseline_scope
     and v_old.blend_weights is not distinct from p_weights
     and v_old.is_demo = p_is_demo then
    return false;   -- нічого не змінилось: ні запису, ні історії
  end if;

  insert into public.published_prices
    (location_kind, location_id, service_code, tier, value, currency, source_type, source_scope, source_id,
     local_clinic_count, baseline_scope, blend_weights, aggregation_method, calculated_at, published_at, is_demo)
  values
    (p_kind, p_location_id, p_service_code, p_tier, p_value, 'UAH', p_source_type, p_source_scope, p_source_id,
     p_local_count, p_baseline_scope, p_weights, p_method, p_calculated_at, now(), p_is_demo)
  on conflict (location_kind, location_id, service_code, tier) do update set
    value = excluded.value, currency = excluded.currency, source_type = excluded.source_type,
    source_scope = excluded.source_scope, source_id = excluded.source_id,
    local_clinic_count = excluded.local_clinic_count, baseline_scope = excluded.baseline_scope,
    blend_weights = excluded.blend_weights, aggregation_method = excluded.aggregation_method,
    calculated_at = excluded.calculated_at, published_at = excluded.published_at, is_demo = excluded.is_demo;

  insert into public.published_price_history
    (location_kind, location_id, service_code, tier, change_type, value, previous_value, currency,
     source_type, source_scope, source_id, local_clinic_count, baseline_scope, blend_weights,
     aggregation_method, calculated_at, is_demo)
  values
    (p_kind, p_location_id, p_service_code, p_tier, 'set', p_value, v_old.value, 'UAH',
     p_source_type, p_source_scope, p_source_id, p_local_count, p_baseline_scope, p_weights,
     p_method, p_calculated_at, p_is_demo);
  return true;
end;
$$;

-- Публікація для міста: manual_override → результат останнього snapshot-а → (немає джерел) рядка немає.
-- Повертає source_type або null.
create or replace function public.publish_price(p_city_id text, p_service_code text, p_tier text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_pm  public.price_modes%rowtype;
  v_agg public.city_aggregates%rowtype;
  v_has_agg boolean;
begin
  if not exists (select 1 from public.cities where id = p_city_id) then
    raise exception 'Невідоме місто %', p_city_id using errcode = 'P0002';
  end if;
  select * into v_pm from public.price_modes
   where city_id = p_city_id and service_code = p_service_code and tier = p_tier;
  select * into v_agg from public.city_aggregates
   where city_id = p_city_id and service_code = p_service_code and tier = p_tier
   order by seq desc limit 1;
  v_has_agg := found;

  if v_pm.mode = 'manual_override' and v_pm.override_value is not null then
    perform public.apply_published_price('city', p_city_id, p_service_code, p_tier,
      v_pm.override_value, 'manual_override', 'city', null,
      case when v_has_agg then v_agg.clinic_count else 0 end, null, null, null, null, false);
    return 'manual_override';
  end if;

  if v_has_agg and v_agg.value is not null then
    perform public.apply_published_price('city', p_city_id, p_service_code, p_tier,
      v_agg.value, v_agg.source_type, v_agg.source_scope, v_agg.id,
      v_agg.clinic_count, case when v_agg.source_type = 'aggregate' then null else v_agg.baseline_scope end,
      v_agg.blend_weights, v_agg.method,
      case when v_agg.source_type in ('aggregate', 'hybrid') then v_agg.calculated_at end,
      v_agg.is_demo);
    return v_agg.source_type;
  end if;

  perform public.apply_published_price('city', p_city_id, p_service_code, p_tier,
    null, null, null, null, 0, null, null, null, null, false);
  return null;
end;
$$;

-- Рядок рівня області (пацієнт обирає область): baseline області → інакше baseline України.
create or replace function public.publish_region_price(p_region_id text, p_service_code text, p_tier text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_row record;
begin
  select rm.id, rm.value, rm.currency, rm.is_demo into v_row
    from public.region_manual_prices rm
   where rm.region_id = p_region_id and rm.service_code = p_service_code and rm.tier = p_tier;
  if found then
    perform public.apply_published_price('region', p_region_id, p_service_code, p_tier,
      public.normalize_to_currency(v_row.value, v_row.currency, 'UAH'), 'regional_fallback', 'region', v_row.id,
      0, 'region', null, null, null, v_row.is_demo);
    return;
  end if;
  select km.id, km.value, km.currency, km.is_demo into v_row
    from public.country_manual_prices km
   where km.country_id = 'UA' and km.service_code = p_service_code and km.tier = p_tier;
  if found then
    perform public.apply_published_price('region', p_region_id, p_service_code, p_tier,
      public.normalize_to_currency(v_row.value, v_row.currency, 'UAH'), 'national_fallback', 'country', v_row.id,
      0, 'country', null, null, null, v_row.is_demo);
  else
    perform public.apply_published_price('region', p_region_id, p_service_code, p_tier,
      null, null, null, null, 0, null, null, null, null, false);
  end if;
end;
$$;

-- Регіональний baseline змінився → ще й рядок області публікується одразу, міста — у чергу (як у v2),
-- але область без власного baseline тепер бере український, тож тригер лишається тим самим.

-- Baseline України змінився: рядки всіх областей — одразу, усі активні міста для цієї комбінації — у чергу.
create or replace function public._country_combo_changed(p_service_code text, p_tier text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.publish_region_price(rg.id, p_service_code, p_tier) from public.regions rg;
  insert into public.recalc_queue (city_id, service_code, tier)
  select c.id, p_service_code, p_tier from public.cities c where c.active
  on conflict do nothing;
end;
$$;

create or replace function public.trg_country_manual_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public._country_combo_changed(new.service_code, new.tier);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public._country_combo_changed(old.service_code, old.tier);
  end if;
  return null;
end;
$$;
create trigger country_manual_prices_changed after insert or update or delete on public.country_manual_prices
  for each row execute function public.trg_country_manual_changed();

-- Нова область одразу отримує рядки з baseline України.
create or replace function public.trg_region_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.publish_region_price(new.id, st.service_code, st.tier) from public.service_tiers st;
  return null;
end;
$$;
create trigger regions_created after insert on public.regions
  for each row execute function public.trg_region_created();

-- ───────────────────────── Публічні RPC (anon) ─────────────────────────

create or replace function public._services_json()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'service_code', s.service_code, 'name', s.name, 'category', coalesce(s.category, ''),
           'role', s.role, 'unit', s.unit, 'tiered', s.tiered, 'tier_source', s.tier_source,
           'additional', s.additional, 'included_text', s.included_text, 'sort', s.sort)
         order by s.sort, s.service_code), '[]'::jsonb)
  from public.services s where s.active;
$$;

create or replace function public._eur_rate_json()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('rate', r.rate_to_uah, 'date', r.rate_date)
  from public.currency_rates r
  where r.currency = 'EUR' and r.rate_date <= current_date
  order by r.rate_date desc
  limit 1;
$$;

-- PublicPrice[] локації: лише опубліковане, лише активні послуги, без даних клінік.
create or replace function public._prices_json(p_kind text, p_id text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'service_code', pp.service_code, 'tier', pp.tier, 'value', pp.value, 'currency', 'UAH',
           'source_type', pp.source_type, 'source_scope', pp.source_scope,
           'local_clinic_count', pp.local_clinic_count, 'baseline_scope', pp.baseline_scope,
           'blend_weights', pp.blend_weights, 'calculated_at', pp.calculated_at,
           'published_at', pp.published_at, 'is_demo', pp.is_demo)
         order by s.sort, pp.service_code, pp.tier), '[]'::jsonb)
  from public.published_prices pp
  join public.services s on s.service_code = pp.service_code and s.active
  where pp.location_kind = p_kind and pp.location_id = p_id;
$$;

create or replace function public.list_locations()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x.loc order by x.kind_rank, x.name), '[]'::jsonb)
  from (
    select 0 as kind_rank, c.name,
           jsonb_build_object(
             'kind', 'city', 'id', c.id, 'slug', c.slug, 'name', c.name,
             'region_id', c.region_id, 'region_name', r.name,
             'aliases', to_jsonb(c.aliases)) as loc
    from public.cities c
    join public.regions r on r.id = c.region_id
    where c.active
    union all
    select 1, r.name,
           jsonb_build_object(
             'kind', 'region', 'id', r.id, 'slug', r.id, 'name', r.name,
             'region_id', null, 'region_name', null, 'aliases', '[]'::jsonb)
    from public.regions r
    where r.active
  ) x;
$$;

create or replace function public.get_location_prices(p_kind text, p_id text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_location jsonb;
begin
  if p_kind = 'city' then
    select jsonb_build_object(
             'kind', 'city', 'id', c.id, 'slug', c.slug, 'name', c.name,
             'region_id', c.region_id, 'region_name', r.name, 'aliases', to_jsonb(c.aliases))
      into v_location
      from public.cities c
      join public.regions r on r.id = c.region_id
     where c.id = p_id and c.active;
  elsif p_kind = 'region' then
    select jsonb_build_object(
             'kind', 'region', 'id', r.id, 'slug', r.id, 'name', r.name,
             'region_id', null, 'region_name', null, 'aliases', '[]'::jsonb)
      into v_location
      from public.regions r
     where r.id = p_id and r.active;
  else
    raise exception 'Невідомий вид локації: % (очікується city або region)', p_kind using errcode = '22023';
  end if;

  if v_location is null then
    raise exception 'Локацію не знайдено: % %', p_kind, p_id using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'location', v_location,
    'currency', 'UAH',
    'eur_rate', public._eur_rate_json(),
    'services', public._services_json(),
    'prices', public._prices_json(p_kind, p_id));
end;
$$;

-- CityPageData[] для будування SEO-сторінок: кожне місто зі seo_status ≠ draft.
-- updated_at = остання суттєва зміна (ціни або контент/статус) — для sitemap lastmod.
create or replace function public.get_city_pages()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(x.page order by x.name), '[]'::jsonb)
  from (
    select c.name,
           jsonb_build_object(
             'location', jsonb_build_object(
               'kind', 'city', 'id', c.id, 'slug', c.slug, 'name', c.name,
               'region_id', c.region_id, 'region_name', r.name, 'aliases', to_jsonb(c.aliases)),
             'seo_status', c.seo_status,
             'content', jsonb_build_object(
               'intro', c.intro, 'faq', c.faq, 'local_notes', c.local_notes,
               'reviewer_name', c.reviewer_name, 'reviewer_url', c.reviewer_url, 'reviewed_at', c.reviewed_at),
             'prices', public._prices_json('city', c.id),
             'services', public._services_json(),
             'eur_rate', public._eur_rate_json(),
             'updated_at', greatest(
               c.content_updated_at,
               coalesce((select max(pp.published_at) from public.published_prices pp
                          where pp.location_kind = 'city' and pp.location_id = c.id), c.content_updated_at))
           ) as page
    from public.cities c
    join public.regions r on r.id = c.region_id
    where c.seo_status <> 'draft'
  ) x;
$$;

-- ───────────────────────── Адмін-вигляди (контракт v3) ─────────────────────────

create view public.admin_price_matrix with (security_invoker = true) as
select
  c.id                      as city_id,
  c.name                    as city_name,
  s.service_code            as service_code,
  s.name                    as service_name,
  st.tier                   as tier,
  coalesce(pm.mode, 'auto') as mode,
  pm.override_value         as override_value,
  cmp.value                 as city_baseline,
  rmp.value                 as region_baseline,
  kmp.value                 as country_baseline,
  coalesce(agg.clinic_count, 0) as local_clinic_count,
  agg.local_median          as local_median,
  agg.baseline_value        as baseline_value,
  agg.baseline_scope        as baseline_scope,
  agg.blend_weights         as blend_weights,
  pp.value                  as published_value,
  pp.source_type            as published_source_type,
  pp.published_at           as published_at
from public.cities c
cross join public.services s
join public.service_tiers st on st.service_code = s.service_code
left join public.price_modes pm
       on pm.city_id = c.id and pm.service_code = s.service_code and pm.tier = st.tier
left join public.city_manual_prices cmp
       on cmp.city_id = c.id and cmp.service_code = s.service_code and cmp.tier = st.tier
left join public.region_manual_prices rmp
       on rmp.region_id = c.region_id and rmp.service_code = s.service_code and rmp.tier = st.tier
left join public.country_manual_prices kmp
       on kmp.country_id = c.country_id and kmp.service_code = s.service_code and kmp.tier = st.tier
left join lateral (
  select a.clinic_count, a.local_median, a.baseline_value, a.baseline_scope, a.blend_weights
  from public.city_aggregates a
  where a.city_id = c.id and a.service_code = s.service_code and a.tier = st.tier
  order by a.seq desc
  limit 1
) agg on true
left join public.published_prices pp
       on pp.location_kind = 'city' and pp.location_id = c.id
      and pp.service_code = s.service_code and pp.tier = st.tier
where c.active and s.active;

-- ТЗ §7.3: відхилення ціни клініки від чинного значення snapshot-а (у UAH).
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
  select public.try_normalize_to_currency(cp.value, cp.currency, 'UAH') as norm
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
      'id', v_a.id, 'value', v_a.value, 'local_clinic_count', v_a.clinic_count,
      'local_median', v_a.local_median, 'baseline_value', v_a.baseline_value,
      'baseline_scope', v_a.baseline_scope, 'blend_weights', v_a.blend_weights,
      'formula', coalesce(v_a.formula, ''), 'calculated_at', v_a.calculated_at),
    'included', v_a.included,
    'excluded', v_a.excluded);
end;
$$;

-- ───────────────────────── Імпорт прайсу клініки (ТЗ §7.4; шаблон «DENVA шаблон цін клініки») ─────────────────────────

-- ImportPayload (v3) → ImportReport. Рядки без ціни пропускаються (skipped_empty), решта — pending («На перевірці»).
-- Клініка: clinic_id → існуюча; інакше пошук за містом і назвою без урахування регістру; інакше нова чернетка.
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
  v_row_from   date;
  v_key        text;
  v_keys       text[] := '{}';
  v_msg        text;
  v_dup        boolean;
  v_accepted   integer[] := '{}';
  v_dups       integer[] := '{}';
  v_unknown    integer[] := '{}';
  v_skipped    integer[] := '{}';
  v_errors     jsonb := '[]'::jsonb;
  v_report     jsonb;
  v_total      integer;
  v_flag_tender  boolean := coalesce((v_clinic ->> 'dental_tender')::boolean, false);
  v_flag_profile boolean := coalesce((v_clinic ->> 'public_profile_consent')::boolean, false);
  v_flag_data    boolean := coalesce((v_clinic ->> 'data_confirmed')::boolean, false);
begin
  perform public.assert_admin();
  if v_clinic is null or jsonb_typeof(p_payload -> 'rows') is distinct from 'array' then
    raise exception 'Некоректний payload імпорту: потрібні clinic та rows' using errcode = '22023';
  end if;

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
    select id into v_clinic_id from public.clinics
     where city_id = v_city_id and lower(btrim(name)) = lower(btrim(v_clinic ->> 'name'))
     order by created_at limit 1;
    if v_clinic_id is null then
      insert into public.clinics (name, city_id, contacts, status)
      values (btrim(v_clinic ->> 'name'), v_city_id, nullif(btrim(v_clinic ->> 'contacts'), ''), 'draft')
      returning id into v_clinic_id;
    end if;
  end if;

  -- картка клініки з шаблону: порожні текстові поля не затирають наявні, прапорці лише вмикаються
  update public.clinics set
    region = coalesce(nullif(btrim(v_clinic ->> 'region'), ''), region),
    address = coalesce(nullif(btrim(v_clinic ->> 'address'), ''), address),
    contact_person = coalesce(nullif(btrim(v_clinic ->> 'contact_person'), ''), contact_person),
    contacts = coalesce(nullif(btrim(v_clinic ->> 'contacts'), ''), contacts),
    dental_tender = dental_tender or v_flag_tender,
    public_profile_consent = public_profile_consent or v_flag_profile,
    data_confirmed = data_confirmed or v_flag_data
  where id = v_clinic_id;

  v_total := jsonb_array_length(p_payload -> 'rows');
  insert into public.import_batches (file_name, clinic_id, row_count)
  values (p_payload ->> 'file_name', v_clinic_id, v_total)
  returning id into v_batch_id;

  for v_row, v_idx in
    select r.value, r.ord::integer from jsonb_array_elements(p_payload -> 'rows') with ordinality as r (value, ord)
  loop
    v_n := coalesce(nullif(v_row ->> 'row_number', '')::integer, v_idx);
    v_msg := null;
    v_code := null; v_tier := null; v_dup := false; v_from := null; v_to := null;
    begin
      if jsonb_typeof(v_row -> 'price_from') = 'number' then
        v_from := (v_row ->> 'price_from')::numeric;
      end if;

      if v_from is null and (v_row -> 'price_from' is null or jsonb_typeof(v_row -> 'price_from') = 'null'
                             or nullif(btrim(v_row ->> 'price_from'), '') is null) then
        -- порожній рядок шаблону — дозволений, пропускаємо
        v_skipped := v_skipped || v_n;
        continue;
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
      end if;

      v_cur := upper(coalesce(nullif(btrim(v_row ->> 'currency'), ''), 'UAH'));
      if v_msg is null and v_cur not in ('UAH', 'EUR', 'USD') then
        v_msg := 'Недозволена валюта: ' || v_cur || ' (дозволені UAH, EUR, USD)';
      end if;

      v_row_from := v_valid_from;
      if v_msg is null and nullif(btrim(v_row ->> 'valid_from'), '') is not null then
        begin
          v_row_from := (v_row ->> 'valid_from')::date;
        exception when others then
          v_msg := 'Невірна дата чинності: ' || (v_row ->> 'valid_from');
        end;
      end if;

      v_tier := nullif(btrim(v_row ->> 'tier'), '');
      if v_msg is null and v_tier is not null and v_tier not in ('common', 'minimum', 'classic', 'premium') then
        v_msg := 'Невірний рівень: ' || v_tier;
      end if;

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
        v_offer := nullif(btrim(v_row ->> 'service_name'), '');
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
            (clinic_id, service_code, tier, price_from, price_to, currency, offer_name,
             included_text, exclusions, valid_from, status, source_url, import_batch_id)
          values
            (v_clinic_id, v_code, v_tier, v_from, v_to, v_cur, v_offer,
             nullif(btrim(v_row ->> 'included_text'), ''), nullif(btrim(v_row ->> 'exclusions'), ''),
             v_row_from, 'pending', nullif(btrim(v_row ->> 'note'), ''), v_batch_id);
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
    'skipped_empty', to_jsonb(v_skipped),
    'pending_moderation', to_jsonb(v_accepted));
  update public.import_batches set report = v_report where id = v_batch_id;
  return v_report;
end;
$$;

-- ───────────────────────── Адмін-RPC ─────────────────────────

-- Базова ціна України (p_value null → видалити).
create or replace function public.admin_set_country_manual_price(
  p_country_id text, p_service_code text, p_tier text, p_value numeric,
  p_value_from numeric default null, p_value_to numeric default null, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_admin();
  perform set_config('denva.reason', coalesce(p_reason, ''), true);
  if p_value is null then
    delete from public.country_manual_prices
     where country_id = p_country_id and service_code = p_service_code and tier = p_tier;
  else
    insert into public.country_manual_prices (country_id, service_code, tier, value, value_from, value_to)
    values (p_country_id, p_service_code, p_tier, p_value, p_value_from, p_value_to)
    on conflict (country_id, service_code, tier) do update
      set value = excluded.value, value_from = excluded.value_from, value_to = excluded.value_to;
  end if;
end;
$$;

-- Режим комбінації: 'auto' або 'manual_override' (значення + причина обов'язкові).
create or replace function public.admin_set_price_mode(
  p_city_id text, p_service_code text, p_tier text, p_mode text,
  p_override_value numeric default null, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_admin();
  if p_mode = 'manual_override' and (p_override_value is null or nullif(btrim(p_reason), '') is null) then
    raise exception 'Для manual_override потрібні значення і причина перевизначення' using errcode = '22023';
  end if;
  perform set_config('denva.reason', coalesce(p_reason, ''), true);
  insert into public.price_modes (city_id, service_code, tier, mode, override_value, override_reason)
  values (p_city_id, p_service_code, p_tier, p_mode,
          case when p_mode = 'manual_override' then p_override_value end,
          case when p_mode = 'manual_override' then btrim(p_reason) end)
  on conflict (city_id, service_code, tier) do update
    set mode = excluded.mode, override_value = excluded.override_value, override_reason = excluded.override_reason;
end;
$$;

-- Заявка: допускаємо intent dental_tender | refine (send_calculation — лише для старих заявок v2).
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
  if v_intent is null or v_intent not in ('dental_tender', 'refine') then
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
