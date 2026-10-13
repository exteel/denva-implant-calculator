-- DENVA AI v2 · 06 · RLS і права (ТЗ §8: усі адмін-зміни потребують авторизації)
--
-- Модель:
--  • anon — жодного доступу до таблиць; лише EXECUTE на list_locations() і get_location_prices();
--  • authenticated + is_admin() — CRUD на адмін-таблицях; city_aggregates / published_prices /
--    published_price_history / audit_log / recalc_queue — лише читання (пишуть функції);
--  • service_role (Edge Functions) — обходить RLS; для заявок використовує submit_lead_record().
--
-- Це ОСТАННЯ міграція: вона одним проходом відкликає права за замовчуванням (PUBLIC має EXECUTE
-- на нові функції, а Supabase видає anon/authenticated ALL на нові об'єкти) і видає лише потрібні.

-- ───────────────────────── 1. Скидання прав ─────────────────────────

revoke all on all tables    in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$$;

-- ───────────────────────── 2. RLS на всіх таблицях ─────────────────────────

alter table public.regions                 enable row level security;
alter table public.cities                  enable row level security;
alter table public.services                enable row level security;
alter table public.clinics                 enable row level security;
alter table public.import_batches          enable row level security;
alter table public.clinic_prices           enable row level security;
alter table public.city_manual_prices      enable row level security;
alter table public.region_manual_prices    enable row level security;
alter table public.price_modes             enable row level security;
alter table public.settings                enable row level security;
alter table public.currency_rates          enable row level security;
alter table public.city_aggregates         enable row level security;
alter table public.published_prices        enable row level security;
alter table public.published_price_history enable row level security;
alter table public.recalc_queue            enable row level security;
alter table public.audit_log               enable row level security;
alter table public.leads                   enable row level security;
alter table public.admin_users             enable row level security;

-- Повний CRUD для адміністраторів
do $$
declare
  t text;
begin
  foreach t in array array[
    'regions', 'cities', 'services', 'clinics', 'import_batches', 'clinic_prices',
    'city_manual_prices', 'region_manual_prices', 'price_modes', 'settings', 'currency_rates']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t);
  end loop;

  -- лише читання для адміністраторів (пишуть функції)
  foreach t in array array[
    'city_aggregates', 'published_prices', 'published_price_history', 'recalc_queue', 'audit_log', 'admin_users']
  loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_read', t);
  end loop;
end
$$;

-- Єдиний рядок налаштувань: адміністратор лише читає й змінює його
revoke insert, delete on public.settings from authenticated;

-- Заявки: адміністратор читає й оновлює статус; вставка — лише через submit_lead_record (service_role)
grant select, update on public.leads to authenticated;
create policy leads_admin_read   on public.leads for select to authenticated using (public.is_admin());
create policy leads_admin_update on public.leads for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Вигляди (security_invoker → діють RLS базових таблиць)
grant select on public.admin_price_matrix, public.admin_clinic_prices, public.service_tiers to authenticated;

-- service_role: повний доступ до таблиць (RLS він і так обходить у Supabase)
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;

-- ───────────────────────── 3. EXECUTE на функції ─────────────────────────

-- Публічне читання (калькулятор)
grant execute on function public.list_locations()                    to anon, authenticated;
grant execute on function public.get_location_prices(text, text)     to anon, authenticated;

-- RLS-політики викликають is_admin() від імені користувача
grant execute on function public.is_admin()                          to authenticated;

-- Вигляд admin_clinic_prices (security_invoker) викликає її від імені користувача
grant execute on function public.try_normalize_to_currency(numeric, text, text, date) to authenticated;

-- Адмін-RPC (усередині — assert_admin())
grant execute on function public.recalculate_now(text, text, text)               to authenticated;
grant execute on function public.process_queue_now()                             to authenticated;
grant execute on function public.admin_aggregate_detail(text, text, text)        to authenticated;
grant execute on function public.import_clinic_prices(jsonb)                     to authenticated;
grant execute on function public.admin_set_clinic_price_status(uuid[], text, text) to authenticated;
grant execute on function public.admin_set_city_manual_price(text, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.admin_set_region_manual_price(text, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.admin_set_price_mode(text, text, text, text, text) to authenticated;
grant execute on function public.admin_save_clinic_price(uuid, jsonb, text)      to authenticated;
grant execute on function public.admin_upsert_row(text, jsonb, text)             to authenticated;
grant execute on function public.admin_delete_row(text, text, text)              to authenticated;
grant execute on function public.recalculate_city(text)                          to authenticated;

-- Edge Functions (service_role)
grant execute on function public.submit_lead_record(jsonb)                       to service_role;
grant execute on function public.update_lead_telegram_status(uuid, text, text)   to service_role;
grant execute on function public.process_recalc_queue(integer)                   to service_role;
grant execute on function public.mark_stale_prices()                             to service_role;
