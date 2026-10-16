-- DENVA AI v3 · 11 · RLS і права для об'єктів v3 (остання міграція).
-- Нові функції отримують EXECUTE для PUBLIC за замовчуванням, а вигляди — права Supabase за замовчуванням,
-- тож, як і в …000006, одним проходом відкликаємо все і видаємо лише потрібне.

-- ───────────────────────── 1. Нова таблиця ─────────────────────────

alter table public.country_manual_prices enable row level security;
revoke all on public.country_manual_prices from public, anon, authenticated;
grant select, insert, update, delete on public.country_manual_prices to authenticated;
create policy country_manual_prices_admin_all on public.country_manual_prices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant all on public.country_manual_prices to service_role;

-- ───────────────────────── 2. Відтворені вигляди ─────────────────────────

revoke all on public.admin_price_matrix, public.admin_clinic_prices from public, anon, authenticated;
grant select on public.admin_price_matrix, public.admin_clinic_prices to authenticated;
grant all on public.admin_price_matrix, public.admin_clinic_prices to service_role;

-- ───────────────────────── 3. Функції: скидання і повна видача ─────────────────────────

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

-- Публічне читання (калькулятор, SEO-збірка)
grant execute on function public.list_locations()                    to anon, authenticated;
grant execute on function public.get_location_prices(text, text)     to anon, authenticated;
grant execute on function public.get_city_pages()                    to anon, authenticated;

-- RLS-політики і вигляд admin_clinic_prices викликають ці функції від імені користувача
grant execute on function public.is_admin()                          to authenticated;
grant execute on function public.try_normalize_to_currency(numeric, text, text, date) to authenticated;

-- Адмін-RPC (усередині — assert_admin())
grant execute on function public.recalculate_now(text, text, text)               to authenticated;
grant execute on function public.recalculate_city(text)                          to authenticated;
grant execute on function public.process_queue_now()                             to authenticated;
grant execute on function public.admin_aggregate_detail(text, text, text)        to authenticated;
grant execute on function public.import_clinic_prices(jsonb)                     to authenticated;
grant execute on function public.admin_set_clinic_price_status(uuid[], text, text) to authenticated;
grant execute on function public.admin_set_city_manual_price(text, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.admin_set_region_manual_price(text, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.admin_set_country_manual_price(text, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.admin_set_price_mode(text, text, text, text, numeric, text) to authenticated;
grant execute on function public.admin_save_clinic_price(uuid, jsonb, text)      to authenticated;
grant execute on function public.admin_upsert_row(text, jsonb, text)             to authenticated;
grant execute on function public.admin_delete_row(text, text, text)              to authenticated;

-- Edge Functions (service_role)
grant execute on function public.submit_lead_record(jsonb)                       to service_role;
grant execute on function public.update_lead_telegram_status(uuid, text, text)   to service_role;
grant execute on function public.process_recalc_queue(integer)                   to service_role;
grant execute on function public.mark_stale_prices()                             to service_role;
