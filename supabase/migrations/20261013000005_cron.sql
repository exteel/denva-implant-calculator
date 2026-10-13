-- DENVA AI v2 · 05 · Розклад (pg_cron). Окрема міграція: ніщо не залежить від розширення,
-- тож там, де pg_cron недоступний (локальні тести, PGlite), вона нічого не робить.
--
--  • щохвилини — обробка черги перерахунку (ТЗ §8: асинхронно);
--  • щодня о 03:15 UTC — позначення застарілих цін (settings.stale_after_months).
--
-- Щоденне оновлення курсів НБУ — Edge Function nbu-rate; її розклад описано в supabase/README.md
-- (потребує pg_net і секрету, тому не входить у міграцію).

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;

    perform cron.schedule('denva-process-recalc-queue', '* * * * *',
                          'select public.process_recalc_queue()');
    perform cron.schedule('denva-mark-stale-prices', '15 3 * * *',
                          'select public.mark_stale_prices()');
  else
    raise notice 'pg_cron недоступний — розклад не створено (виклик process_recalc_queue() робіть вручну)';
  end if;
end
$$;
