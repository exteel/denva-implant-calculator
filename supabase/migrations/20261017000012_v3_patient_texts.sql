-- v3 follow-up: patient-facing «що входить» texts instead of the template's
-- internal rules, and no SEO page for inactive cities.

update public.services set included_text = 'Імплант і його встановлення під місцевою анестезією' where service_code = 'IMPLANT_INSTALL';
update public.services set included_text = 'Формувач ясен — формує ясна навколо імпланта перед коронкою' where service_code = 'HEALING_ABUTMENT';
update public.services set included_text = 'Цифрове сканування щелепи на етапі протезування' where service_code = 'SCAN_JAW_STAGE';
update public.services set included_text = 'Повторне сканування щелепи для наступного етапу' where service_code = 'REPEAT_SCAN_JAW';
update public.services set included_text = 'Компоненти між імплантом і коронкою: аналог, трансфер і абатмент' where service_code = 'SUPERSTRUCTURE_SET';
update public.services set included_text = 'Постійна коронка на імпланті; рівень визначає матеріал і лабораторію' where service_code = 'CROWN_IMPLANT';
update public.services set included_text = 'Тимчасова коронка на час приживлення імпланта' where service_code = 'TEMP_CROWN_UNIT';
update public.services set included_text = 'Фінальний абатмент, потрібний після тимчасової коронки' where service_code = 'ABUTMENT_FINAL';
update public.services set included_text = 'Мультиюніт — з’єднувальний компонент для конструкції на всю щелепу' where service_code = 'MULTIUNIT';
update public.services set included_text = 'Тимчасова незнімна конструкція на всю щелепу (перший етап)' where service_code = 'ARCH_TEMP';
update public.services set included_text = 'Постійна незнімна конструкція на всю щелепу' where service_code = 'ARCH_FINAL';
update public.services set included_text = 'Консультація лікаря-імплантолога' where service_code = 'IMPLANT_CONSULT';
update public.services set included_text = 'Комп’ютерна томографія однієї щелепи' where service_code = 'CT_ONE_JAW';
update public.services set included_text = 'Комп’ютерна томографія обох щелеп' where service_code = 'CT_BOTH_JAWS';
update public.services set included_text = 'Просте видалення зуба' where service_code = 'REMOVAL_SIMPLE';
update public.services set included_text = 'Складне видалення зуба' where service_code = 'REMOVAL_COMPLEX';
update public.services set included_text = 'Просте видалення зуба мудрості' where service_code = 'REMOVAL_WISDOM_SIMPLE';
update public.services set included_text = 'Складне видалення зуба мудрості' where service_code = 'REMOVAL_WISDOM_COMPLEX';
update public.services set included_text = 'Видалення зуба, раніше лікованого резорцин-формаліновим методом' where service_code = 'REMOVAL_RESORCIN';
update public.services set included_text = 'Видалення ретинованого (непрорізаного) зуба' where service_code = 'REMOVAL_IMPACTED';
update public.services set included_text = 'Місцева анестезія ділянки' where service_code = 'ANESTHESIA_AREA';
update public.services set included_text = 'Накладання шва після втручання' where service_code = 'SUTURE_AREA';
update public.services set included_text = 'Гемостатична губка для зупинки кровотечі' where service_code = 'HEMOSTATIC_SPONGE';
update public.services set included_text = 'Нарощування кісткової тканини на ділянці' where service_code = 'AUGMENT_SEGMENT';
update public.services set included_text = 'Синус-ліфтинг — нарощування кістки у верхній щелепі' where service_code = 'SINUS_LIFT';
update public.services set included_text = 'Пластика ясен (м’яких тканин)' where service_code = 'SOFT_TISSUE';
update public.services set included_text = 'Седація або лікування уві сні, за кожні 30 хвилин' where service_code = 'SEDATION_30_MIN';
update public.services set included_text = 'Хірургічний шаблон для точного встановлення імплантів' where service_code = 'SURGICAL_GUIDE_STANDARD';
update public.services set included_text = 'Зняття старої конструкції на цементній фіксації' where service_code = 'CEMENT_RESTORATION_REMOVAL';

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
    where c.seo_status <> 'draft' and c.active
  ) x;
$$;

