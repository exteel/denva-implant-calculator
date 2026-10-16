-- DENVA AI v3 (ТЗ 3.3) · 08 · Структура: каталог з шаблону, базові ціни України, нова модель публікації,
-- SEO-поля міст, картка клініки. Лише ВПЕРЕД: застосовані міграції 01–07 не змінюються.
-- Логіка (compute/publish/RPC) — у …000009, демо-дані — у …000010, права — у …000011.

-- ───────────────────────── 0. Прибираємо вигляди, що залежать від змінюваних колонок ─────────────────────────
-- (відтворюються в …000009 у формі контракту v3)

drop view if exists public.admin_price_matrix;
drop view if exists public.admin_clinic_prices;

-- ───────────────────────── 1. Режими ціни: лише auto | manual_override (з причиною) ─────────────────────────

-- ці UPDATE-и виконуємо до зміни каталогу, поки старі коди ще мають старі рівні
update public.price_modes set mode = 'auto' where mode = 'manual';

alter table public.price_modes
  add column override_value  numeric,
  add column override_reason text;

-- v2 брав значення override з ручного міського орієнтира — переносимо його як значення перевизначення
update public.price_modes pm
   set override_value = cmp.value, override_reason = 'перенесено з v2'
  from public.city_manual_prices cmp
 where pm.mode = 'manual_override'
   and cmp.city_id = pm.city_id and cmp.service_code = pm.service_code and cmp.tier = pm.tier;
update public.price_modes set mode = 'auto' where mode = 'manual_override' and override_value is null;

alter table public.price_modes drop constraint price_modes_mode_check;
alter table public.price_modes
  add constraint price_modes_mode_check check (mode in ('auto', 'manual_override')),
  add constraint price_modes_override_complete check (
    mode = 'auto'
    or (override_value > 0 and nullif(btrim(override_reason), '') is not null));

-- ───────────────────────── 2. Каталог послуг: category, tier_source, additional ─────────────────────────

alter table public.services drop constraint services_role_check;
alter table public.services drop constraint services_tiered_roles;
-- старі ролі v2 (arch_temp, arch_final) лишаються дозволеними лише для деактивованих кодів v2
alter table public.services add constraint services_role_check check (role in (
  'implant', 'healing', 'scan', 'superstructure', 'crown', 'temporary', 'final_abutment', 'multiunit',
  'arch', 'diagnostic', 'removal', 'addon', 'arch_temp', 'arch_final'));

alter table public.services
  add column category    text,
  add column tier_source text not null default 'common'
    check (tier_source in ('implant_tier', 'crown_or_arch_tier', 'common')),
  add column additional  boolean not null default false;

update public.services set tier_source = case role when 'implant' then 'implant_tier' else 'crown_or_arch_tier' end
 where tiered;
alter table public.services
  add constraint services_tier_source_consistent check (tiered = (tier_source <> 'common'));

-- Рівно коди шаблону «DENVA шаблон цін клініки» (аркуш «Довідник кодів»), порядок = порядок шаблону.
insert into public.services
  (service_code, name, category, role, unit, tiered, tier_source, additional, included_text, sort)
values
  ('IMPLANT_INSTALL', 'Встановлення імпланта', 'Імплантація', 'implant', 'за імплант', true, 'implant_tier', false, 'Повна ціна встановлення імпланта без формувача та коронки', 10),
  ('HEALING_ABUTMENT', 'Формувач ясен', 'Компоненти', 'healing', 'за імплант', true, 'implant_tier', false, 'Ціна залежить від рівня імпланта', 20),
  ('SCAN_JAW_STAGE', 'Сканування однієї щелепи', 'Цифровий етап', 'scan', 'за щелепу/етап', false, 'common', false, 'Рахується окремо для кожної активної щелепи', 30),
  ('REPEAT_SCAN_JAW', 'Повторне сканування однієї щелепи', 'Цифровий етап', 'scan', 'за щелепу/етап', false, 'common', false, 'Лише якщо потрібен повторний етап', 40),
  ('SUPERSTRUCTURE_SET', 'Комплект супраструктур', 'Компоненти', 'superstructure', 'за імплант', true, 'implant_tier', false, 'Аналог, трансфер/scan abutment та абатмент за стандартом клініки', 50),
  ('CROWN_IMPLANT', 'Постійна коронка на імпланті', 'Коронки', 'crown', 'за зуб', true, 'crown_or_arch_tier', false, 'Окремі рівні лабораторії: minimum/classic/premium', 60),
  ('TEMP_CROWN_UNIT', 'Тимчасова коронка', 'Тимчасові зуби', 'temporary', 'за зуб', false, 'common', false, 'Не входить автоматично', 70),
  ('ABUTMENT_FINAL', 'Фінальний абатмент після тимчасової коронки', 'Компоненти', 'final_abutment', 'за імплант', true, 'implant_tier', false, 'Додається лише разом із тимчасовим протезуванням', 80),
  ('MULTIUNIT', 'Мультиюніт', 'Повна щелепа', 'multiunit', 'за імплант', true, 'implant_tier', false, 'Ціна залежить від рівня імпланта', 90),
  ('ARCH_TEMP', 'Тимчасова повнощелепна конструкція', 'Повна щелепа', 'arch', 'за щелепу', false, 'common', false, 'Повна ціна тимчасової конструкції', 100),
  ('ARCH_FINAL', 'Постійна повнощелепна конструкція', 'Повна щелепа', 'arch', 'за щелепу', true, 'crown_or_arch_tier', false, 'Окремі рівні minimum/classic/premium', 110),
  ('IMPLANT_CONSULT', 'Консультація імплантолога', 'Діагностика', 'diagnostic', 'за консультацію', false, 'common', true, 'Не включати в основний total', 120),
  ('CT_ONE_JAW', 'КТ однієї щелепи', 'Діагностика', 'diagnostic', 'за щелепу', false, 'common', true, 'Не включати в основний total', 130),
  ('CT_BOTH_JAWS', 'КТ обох щелеп', 'Діагностика', 'diagnostic', 'за дослідження', false, 'common', true, 'Не включати в основний total', 140),
  ('REMOVAL_SIMPLE', 'Просте видалення зуба', 'Видалення', 'removal', 'за зуб', false, 'common', true, 'Не включати автоматично', 150),
  ('REMOVAL_COMPLEX', 'Складне видалення зуба', 'Видалення', 'removal', 'за зуб', false, 'common', true, 'Не включати автоматично', 160),
  ('REMOVAL_WISDOM_SIMPLE', 'Просте видалення зуба мудрості', 'Видалення', 'removal', 'за зуб', false, 'common', true, 'Не включати автоматично', 170),
  ('REMOVAL_WISDOM_COMPLEX', 'Складне видалення зуба мудрості', 'Видалення', 'removal', 'за зуб', false, 'common', true, 'Не включати автоматично', 180),
  ('REMOVAL_RESORCIN', 'Видалення резорцин-формалінового зуба', 'Видалення', 'removal', 'за зуб', false, 'common', true, 'Не включати автоматично', 190),
  ('REMOVAL_IMPACTED', 'Видалення ретинованого зуба', 'Видалення', 'removal', 'за зуб', false, 'common', true, 'Не включати автоматично', 200),
  ('ANESTHESIA_AREA', 'Анестезія', 'Видалення', 'removal', 'за ділянку', false, 'common', true, 'Ділянка визначається клінікою', 210),
  ('SUTURE_AREA', 'Накладання шва', 'Видалення', 'removal', 'за ділянку', false, 'common', true, 'За показаннями', 220),
  ('HEMOSTATIC_SPONGE', 'Гемостатична губка', 'Видалення', 'removal', 'за одиницю', false, 'common', true, 'За показаннями', 230),
  ('AUGMENT_SEGMENT', 'Кісткова аугментація', 'Кісткові процедури', 'addon', 'за сегмент', false, 'common', true, 'Вказати, що входить у ціну', 240),
  ('SINUS_LIFT', 'Синус-ліфтинг', 'Кісткові процедури', 'addon', 'за операцію/сегмент', false, 'common', true, 'Вказати, що входить у ціну', 250),
  ('SOFT_TISSUE', 'Пластика м’яких тканин', 'М’які тканини', 'addon', 'за ділянку', false, 'common', true, 'Не включати автоматично', 260),
  ('SEDATION_30_MIN', 'Седація або лікування уві сні', 'Седація', 'addon', 'за 30 хвилин', false, 'common', true, 'Якщо клініка рахує погодинно, вказати половину години', 270),
  ('SURGICAL_GUIDE_STANDARD', 'Стандартний хірургічний шаблон', 'Навігація', 'addon', 'за шаблон', false, 'common', true, 'Розбірний шаблон із тимчасовими зубами описати у примітці', 280),
  ('CEMENT_RESTORATION_REMOVAL', 'Зняття конструкції на цементній фіксації', 'Протезування', 'addon', 'за зуб', false, 'common', true, 'Гвинтове зняття окремо не враховується', 290)
on conflict (service_code) do update set
  name = excluded.name, category = excluded.category, role = excluded.role, unit = excluded.unit,
  tiered = excluded.tiered, tier_source = excluded.tier_source, additional = excluded.additional,
  included_text = excluded.included_text, sort = excluded.sort, active = true, is_demo = false;

-- Старі коди v2 деактивуємо (історія й прайси лишаються)
update public.services set active = false
 where service_code not in ('IMPLANT_INSTALL', 'HEALING_ABUTMENT', 'SCAN_JAW_STAGE', 'REPEAT_SCAN_JAW', 'SUPERSTRUCTURE_SET', 'CROWN_IMPLANT', 'TEMP_CROWN_UNIT', 'ABUTMENT_FINAL', 'MULTIUNIT', 'ARCH_TEMP', 'ARCH_FINAL', 'IMPLANT_CONSULT', 'CT_ONE_JAW', 'CT_BOTH_JAWS', 'REMOVAL_SIMPLE', 'REMOVAL_COMPLEX', 'REMOVAL_WISDOM_SIMPLE', 'REMOVAL_WISDOM_COMPLEX', 'REMOVAL_RESORCIN', 'REMOVAL_IMPACTED', 'ANESTHESIA_AREA', 'SUTURE_AREA', 'HEMOSTATIC_SPONGE', 'AUGMENT_SEGMENT', 'SINUS_LIFT', 'SOFT_TISSUE', 'SEDATION_30_MIN', 'SURGICAL_GUIDE_STANDARD', 'CEMENT_RESTORATION_REMOVAL') and active;

-- Рядки, що не відповідають новим правилам рівнів (змінилась «рівневість» коду) або належать деактивованим
-- кодам, не мають сенсу: прибираємо їх (журнал audit_log їх зберігає).
delete from public.price_modes pm using public.services s
 where s.service_code = pm.service_code and (not s.active or (s.tiered <> (pm.tier <> 'common')));

-- ───────────────────────── 3. Базові ціни України ─────────────────────────

create table public.country_manual_prices (
  id           uuid primary key default gen_random_uuid(),
  country_id   text not null default 'UA',
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
  unique (country_id, service_code, tier),
  constraint country_manual_range check (value_from is null or value_to is null or value_to >= value_from)
);
comment on table public.country_manual_prices is 'Ручна середня ціна України — останній рівень базового орієнтира (ТЗ §2.3).';

create trigger country_manual_prices_touch before update on public.country_manual_prices
  for each row execute function public.trg_touch();
create trigger country_manual_prices_tier before insert or update on public.country_manual_prices
  for each row execute function public.trg_validate_service_tier();
create trigger country_manual_prices_demo before update on public.country_manual_prices
  for each row execute function public.trg_reset_demo_flag();
create trigger country_manual_prices_audit after insert or update or delete on public.country_manual_prices
  for each row execute function public.trg_audit('id');

-- ───────────────────────── 4. Snapshot-и: локальна вибірка, baseline, ваги, формула ─────────────────────────

alter table public.city_aggregates alter column value type numeric;   -- без округлення (ТЗ §8.1)
alter table public.city_aggregates
  add column local_median   numeric,
  add column baseline_value numeric,
  add column baseline_scope text check (baseline_scope in ('city', 'region', 'country')),
  add column blend_weights  jsonb,
  add column formula        text,
  add column source_type    text check (source_type in
    ('aggregate', 'hybrid', 'manual_baseline', 'regional_fallback', 'national_fallback')),
  add column source_scope   text check (source_scope in ('city', 'region', 'country'));

-- ───────────────────────── 5. Опубліковані ціни ─────────────────────────

alter table public.published_prices rename column clinic_count to local_clinic_count;
alter table public.published_prices drop constraint published_prices_source_type_check;
update public.published_prices set local_clinic_count = 0 where local_clinic_count is null;
update public.published_prices set source_type = 'manual_baseline' where source_type = 'manual';
alter table public.published_prices alter column value type numeric;
alter table public.published_prices
  alter column local_clinic_count set not null,
  alter column local_clinic_count set default 0,
  add column source_scope  text,
  add column baseline_scope text check (baseline_scope in ('city', 'region', 'country')),
  add column blend_weights jsonb;
update public.published_prices
   set source_scope = case when location_kind = 'city' then 'city' else 'region' end;
alter table public.published_prices
  alter column source_scope set not null,
  add constraint published_prices_source_scope_check check (source_scope in ('city', 'region', 'country'));
alter table public.published_prices add constraint published_prices_source_type_check check (source_type in
  ('aggregate', 'hybrid', 'manual_baseline', 'manual_override', 'regional_fallback', 'national_fallback'));

alter table public.published_price_history rename column clinic_count to local_clinic_count;
alter table public.published_price_history alter column value type numeric;
alter table public.published_price_history alter column previous_value type numeric;
alter table public.published_price_history
  add column source_scope  text,
  add column baseline_scope text,
  add column blend_weights jsonb;

-- ───────────────────────── 6. Налаштування: метод агрегації — лише медіана (ТЗ §3.2) ─────────────────────────

alter table public.settings drop constraint settings_aggregation_method_check;
update public.settings set aggregation_method = 'median' where aggregation_method <> 'median';
alter table public.settings add constraint settings_aggregation_method_check check (aggregation_method = 'median');

-- ───────────────────────── 7. Міста: slug, SEO-статус, контент сторінки (ТЗ §11) ─────────────────────────

alter table public.cities
  add column slug               text,
  add column seo_status         text not null default 'draft'
    check (seo_status in ('draft', 'review', 'published', 'stale', 'removed')),
  add column intro              text,
  add column faq                jsonb not null default '[]'::jsonb check (jsonb_typeof(faq) = 'array'),
  add column local_notes        text,
  add column reviewer_name      text,
  add column reviewer_url       text,
  add column reviewed_at        timestamptz,
  add column content_is_demo    boolean not null default false,
  add column content_updated_at timestamptz;

update public.cities set slug = id, content_updated_at = now();
alter table public.cities
  alter column slug set not null,
  alter column content_updated_at set not null,
  alter column content_updated_at set default now(),
  add constraint cities_slug_unique unique (slug),
  add constraint cities_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- slug за замовчуванням = id; content_updated_at змінюється лише при зміні видимого контенту/статусу (sitemap lastmod)
create or replace function public.trg_city_content()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.slug := coalesce(nullif(btrim(new.slug), ''), new.id);
    new.content_updated_at := now();
  elsif new.seo_status is distinct from old.seo_status
        or new.intro is distinct from old.intro
        or new.faq is distinct from old.faq
        or new.local_notes is distinct from old.local_notes
        or new.reviewer_name is distinct from old.reviewer_name
        or new.reviewer_url is distinct from old.reviewer_url
        or new.reviewed_at is distinct from old.reviewed_at
        or new.name is distinct from old.name then
    new.content_updated_at := now();
  end if;
  return new;
end;
$$;
create trigger cities_content before insert or update on public.cities
  for each row execute function public.trg_city_content();

-- ───────────────────────── 8. Клініки: картка з шаблону ─────────────────────────

alter table public.clinics
  add column region                 text,
  add column address                text,
  add column contact_person         text,
  add column dental_tender          boolean not null default false,
  add column public_profile_consent boolean not null default false,
  add column data_confirmed         boolean not null default false;

-- ───────────────────────── 9. Заявки: intent dental_tender ─────────────────────────

alter table public.leads drop constraint leads_intent_check;
alter table public.leads add constraint leads_intent_check
  check (intent in ('dental_tender', 'refine', 'send_calculation'));   -- send_calculation лишився від v2

-- ───────────────────────── 10. Старі функції зі зміненими сигнатурами ─────────────────────────

drop function if exists public.apply_published_price(text, text, text, text, numeric, text, text, uuid, integer, text, timestamptz, boolean);
drop function if exists public.admin_set_price_mode(text, text, text, text, text);
