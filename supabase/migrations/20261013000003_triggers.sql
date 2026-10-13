-- DENVA AI v2 · 03 · Тригери: валідація, службові поля, журнал, незмінність snapshot-ів,
-- постановка в чергу лише зачеплених комбінацій (ТЗ §3, §7.3, §9)

-- ───────────────────────── Службові поля та валідація ─────────────────────────

create or replace function public.trg_touch()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new is not distinct from old then
    return new;                      -- порожнє оновлення: не чіпаємо ні updated_at, ні журнал
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- service_code ↔ tier: рівневі послуги мають minimum/classic/premium, решта — common.
create or replace function public.trg_validate_service_tier()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tiered boolean;
begin
  if new.service_code is null then
    return new;                      -- незіставлений рядок імпорту (лише clinic_prices)
  end if;
  select tiered into v_tiered from public.services where service_code = new.service_code;
  if not found then
    raise exception 'Невідомий service_code %', new.service_code using errcode = '23503';
  end if;
  if v_tiered then
    if new.tier is not null and new.tier not in ('minimum', 'classic', 'premium') then
      raise exception 'Для послуги % допустимі рівні minimum, classic, premium (отримано %)',
        new.service_code, new.tier using errcode = '23514';
    end if;
  elsif new.tier is null then
    new.tier := 'common';
  elsif new.tier <> 'common' then
    raise exception 'Послуга % не має рівнів: використовуйте common (отримано %)',
      new.service_code, new.tier using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Підтвердження ціни фіксує дату перевірки (verified_at), якщо її не задано явно.
create or replace function public.trg_clinic_price_verify()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'approved' then
    if tg_op = 'INSERT' then
      new.verified_at := coalesce(new.verified_at, now());
    elsif old.status <> 'approved' and new.verified_at is not distinct from old.verified_at then
      new.verified_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- Демо-значення, змінене людиною, перестає бути демо.
create or replace function public.trg_reset_demo_flag()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.is_demo = old.is_demo and new.value is distinct from old.value then
    new.is_demo := false;
  end if;
  return new;
end;
$$;

-- ───────────────────────── Лише додавання ─────────────────────────

create or replace function public.trg_append_only()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  raise exception 'Таблиця % лише для додавання: змінювати і видаляти записи заборонено', tg_table_name
    using errcode = '42501';
end;
$$;

create trigger city_aggregates_append_only before update or delete on public.city_aggregates
  for each row execute function public.trg_append_only();
create trigger city_aggregates_no_truncate before truncate on public.city_aggregates
  for each statement execute function public.trg_append_only();
create trigger published_history_append_only before update or delete on public.published_price_history
  for each row execute function public.trg_append_only();
create trigger published_history_no_truncate before truncate on public.published_price_history
  for each statement execute function public.trg_append_only();
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.trg_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.trg_append_only();

-- ───────────────────────── Журнал змін (ТЗ §7.1 «Історія змін», §8) ─────────────────────────

-- Аргументи тригера — колонки первинного ключа. Причину читає з `denva.reason`
-- (set_config('denva.reason', '…', true) у межах транзакції).
create or replace function public.trg_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_pk  text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  select string_agg(coalesce(coalesce(v_new, v_old) ->> col, ''), '|' order by ord)
    into v_pk
    from unnest(tg_argv) with ordinality as t (col, ord);
  insert into public.audit_log (actor, table_name, record_pk, action, old_data, new_data, reason)
  values (auth.uid(), tg_table_name, v_pk, tg_op, v_old, v_new,
          nullif(current_setting('denva.reason', true), ''));
  return null;
end;
$$;

-- ───────────────────────── Прив'язка тригерів валідації/службових полів ─────────────────────────

create trigger regions_touch before update on public.regions
  for each row execute function public.trg_touch();
create trigger cities_touch before update on public.cities
  for each row execute function public.trg_touch();
create trigger services_touch before update on public.services
  for each row execute function public.trg_touch();
create trigger clinics_touch before update on public.clinics
  for each row execute function public.trg_touch();
create trigger clinic_prices_touch before update on public.clinic_prices
  for each row execute function public.trg_touch();
create trigger city_manual_prices_touch before update on public.city_manual_prices
  for each row execute function public.trg_touch();
create trigger region_manual_prices_touch before update on public.region_manual_prices
  for each row execute function public.trg_touch();
create trigger price_modes_touch before update on public.price_modes
  for each row execute function public.trg_touch();
create trigger settings_touch before update on public.settings
  for each row execute function public.trg_touch();

create trigger clinic_prices_tier before insert or update on public.clinic_prices
  for each row execute function public.trg_validate_service_tier();
create trigger city_manual_prices_tier before insert or update on public.city_manual_prices
  for each row execute function public.trg_validate_service_tier();
create trigger region_manual_prices_tier before insert or update on public.region_manual_prices
  for each row execute function public.trg_validate_service_tier();
create trigger price_modes_tier before insert or update on public.price_modes
  for each row execute function public.trg_validate_service_tier();

create trigger clinic_prices_verify before insert or update on public.clinic_prices
  for each row execute function public.trg_clinic_price_verify();

create trigger city_manual_prices_demo before update on public.city_manual_prices
  for each row execute function public.trg_reset_demo_flag();
create trigger region_manual_prices_demo before update on public.region_manual_prices
  for each row execute function public.trg_reset_demo_flag();

-- ───────────────────────── Прив'язка журналу ─────────────────────────

create trigger regions_audit after insert or update or delete on public.regions
  for each row execute function public.trg_audit('id');
create trigger cities_audit after insert or update or delete on public.cities
  for each row execute function public.trg_audit('id');
create trigger services_audit after insert or update or delete on public.services
  for each row execute function public.trg_audit('service_code');
create trigger clinics_audit after insert or update or delete on public.clinics
  for each row execute function public.trg_audit('id');
create trigger clinic_prices_audit after insert or update or delete on public.clinic_prices
  for each row execute function public.trg_audit('id');
create trigger city_manual_prices_audit after insert or update or delete on public.city_manual_prices
  for each row execute function public.trg_audit('id');
create trigger region_manual_prices_audit after insert or update or delete on public.region_manual_prices
  for each row execute function public.trg_audit('id');
create trigger price_modes_audit after insert or update or delete on public.price_modes
  for each row execute function public.trg_audit('city_id', 'service_code', 'tier');
create trigger settings_audit after insert or update or delete on public.settings
  for each row execute function public.trg_audit('id');
create trigger currency_rates_audit after insert or update or delete on public.currency_rates
  for each row execute function public.trg_audit('id');
create trigger admin_users_audit after insert or update or delete on public.admin_users
  for each row execute function public.trg_audit('user_id');
create trigger import_batches_audit after insert on public.import_batches
  for each row execute function public.trg_audit('id');

-- ───────────────────────── Події перерахунку (ТЗ §3.3) ─────────────────────────
-- Ставимо в чергу ЛИШЕ зачеплені комбінації (місто × service_code × tier).

-- Комбінація ціни клініки → (місто клініки, service_code, tier). Незіставлені рядки пропускаємо.
create or replace function public.enqueue_for_clinic_price(p_clinic_id uuid, p_service_code text, p_tier text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_city text;
begin
  if p_service_code is null or p_tier is null then
    return;
  end if;
  select city_id into v_city from public.clinics where id = p_clinic_id;
  if v_city is not null then
    perform public.enqueue_recalc(v_city, p_service_code, p_tier);
  end if;
end;
$$;

create or replace function public.trg_enqueue_clinic_prices()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.enqueue_for_clinic_price(new.clinic_id, new.service_code, new.tier);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.enqueue_for_clinic_price(old.clinic_id, old.service_code, old.tier);
  end if;
  return null;
end;
$$;
create trigger clinic_prices_enqueue after insert or update or delete on public.clinic_prices
  for each row execute function public.trg_enqueue_clinic_prices();

-- Клініка: активація/деактивація/виключення, переїзд в інше місто, мережа →
-- усі комбінації її цін у старому й новому місті.
create or replace function public.trg_enqueue_clinics()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.recalc_queue (city_id, service_code, tier)
    select distinct old.city_id, cp.service_code, cp.tier
      from public.clinic_prices cp
     where cp.clinic_id = old.id and cp.service_code is not null and cp.tier is not null
    on conflict do nothing;
    return old;
  end if;
  if new.status is distinct from old.status
     or new.city_id is distinct from old.city_id
     or new.network_id is distinct from old.network_id
     or new.is_demo is distinct from old.is_demo then
    insert into public.recalc_queue (city_id, service_code, tier)
    select distinct c.city_id, cp.service_code, cp.tier
      from public.clinic_prices cp
     cross join (select new.city_id as city_id union select old.city_id) c
     where cp.clinic_id = new.id and cp.service_code is not null and cp.tier is not null
    on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger clinics_enqueue_update after update on public.clinics
  for each row execute function public.trg_enqueue_clinics();
create trigger clinics_enqueue_delete before delete on public.clinics
  for each row execute function public.trg_enqueue_clinics();

-- Ручні міські орієнтири та режими: комбінація (місто, service_code, tier).
create or replace function public.trg_enqueue_city_combo()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.enqueue_recalc(new.city_id, new.service_code, new.tier);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.enqueue_recalc(old.city_id, old.service_code, old.tier);
  end if;
  return null;
end;
$$;
create trigger city_manual_prices_enqueue after insert or update or delete on public.city_manual_prices
  for each row execute function public.trg_enqueue_city_combo();
create trigger price_modes_enqueue after insert or update or delete on public.price_modes
  for each row execute function public.trg_enqueue_city_combo();

-- Регіональний орієнтир: рядок рівня області публікуємо одразу (це просте копіювання),
-- а всі міста області для цієї комбінації — у чергу.
create or replace function public.trg_region_manual_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.publish_region_price(new.region_id, new.service_code, new.tier);
    insert into public.recalc_queue (city_id, service_code, tier)
    select c.id, new.service_code, new.tier from public.cities c where c.region_id = new.region_id
    on conflict do nothing;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.publish_region_price(old.region_id, old.service_code, old.tier);
    insert into public.recalc_queue (city_id, service_code, tier)
    select c.id, old.service_code, old.tier from public.cities c where c.region_id = old.region_id
    on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger region_manual_prices_changed after insert or update or delete on public.region_manual_prices
  for each row execute function public.trg_region_manual_changed();

-- Місто: створення, зміна області/валюти/порогу/активності → усі комбінації цього міста.
create or replace function public.trg_enqueue_city()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.region_id is distinct from old.region_id
     or new.currency is distinct from old.currency
     or new.min_clinics is distinct from old.min_clinics
     or new.active is distinct from old.active then
    perform public.enqueue_city_combos(new.id);
  end if;
  return null;
end;
$$;
create trigger cities_enqueue after insert or update on public.cities
  for each row execute function public.trg_enqueue_city();

-- Налаштування (поріг, метод, «застарілість») → усі комбінації.
create or replace function public.trg_enqueue_settings()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.min_clinics is distinct from old.min_clinics
     or new.aggregation_method is distinct from old.aggregation_method
     or new.stale_after_months is distinct from old.stale_after_months then
    perform public.enqueue_all_combos();
  end if;
  return null;
end;
$$;
create trigger settings_enqueue after update on public.settings
  for each row execute function public.trg_enqueue_settings();

-- Курс валюти → лише комбінації, де є ціни в цій валюті (клініки або регіональний fallback).
create or replace function public.trg_enqueue_currency_rate()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.recalc_queue (city_id, service_code, tier)
  select distinct cl.city_id, cp.service_code, cp.tier
    from public.clinic_prices cp
    join public.clinics cl on cl.id = cp.clinic_id
    join public.cities ci on ci.id = cl.city_id
   where cp.service_code is not null and cp.tier is not null
     and cp.currency <> ci.currency
     and (cp.currency = new.currency or ci.currency = new.currency)
  on conflict do nothing;

  insert into public.recalc_queue (city_id, service_code, tier)
  select distinct ci.id, rm.service_code, rm.tier
    from public.region_manual_prices rm
    join public.cities ci on ci.region_id = rm.region_id
   where rm.currency <> ci.currency
     and (rm.currency = new.currency or ci.currency = new.currency)
  on conflict do nothing;
  return null;
end;
$$;
create trigger currency_rates_enqueue after insert or update on public.currency_rates
  for each row execute function public.trg_enqueue_currency_rate();
