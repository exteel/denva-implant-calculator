-- DENVA AI v2 · демо-дані (seed). УСІ рядки позначені is_demo = true.
-- Застосовується після міграцій: `npx supabase db push --include-seed` (віддалено) або `npx supabase db reset` (локально).
-- Це ЗГЕНЕРОВАНИЙ з src/engine/geo.ts список областей і міст + канонічні демо-ціни (UAH).
-- Замініть їх реальними даними в адмінпанелі: ручне значення, змінене людиною, перестає бути демо.

-- ───────────────────────── Області та міста (src/engine/geo.ts) ─────────────────────────

insert into public.regions (id, name, is_demo) 
select v.id, v.name, true from (values
  ('kyiv-city', 'м. Київ'),
  ('lvivska', 'Львівська область'),
  ('ivano-frankivska', 'Івано-Франківська область'),
  ('ternopilska', 'Тернопільська область'),
  ('zakarpatska', 'Закарпатська область'),
  ('chernivetska', 'Чернівецька область'),
  ('volynska', 'Волинська область'),
  ('rivnenska', 'Рівненська область'),
  ('khmelnytska', 'Хмельницька область'),
  ('vinnytska', 'Вінницька область'),
  ('cherkaska', 'Черкаська область'),
  ('kirovohradska', 'Кіровоградська область'),
  ('poltavska', 'Полтавська область'),
  ('kyivska', 'Київська область'),
  ('zhytomyrska', 'Житомирська область'),
  ('chernihivska', 'Чернігівська область'),
  ('sumska', 'Сумська область'),
  ('odeska', 'Одеська область'),
  ('mykolaivska', 'Миколаївська область'),
  ('khersonska', 'Херсонська область'),
  ('zaporizka', 'Запорізька область'),
  ('dnipropetrovska', 'Дніпропетровська область'),
  ('kharkivska', 'Харківська область'),
  ('donetska', 'Донецька область'),
  ('luhanska', 'Луганська область')
) as v (id, name)
on conflict (id) do nothing;

insert into public.cities (id, name, region_id, aliases, is_demo)
select v.id, v.name, v.region_id, v.aliases, true from (values
  ('kyiv', 'Київ', 'kyiv-city', array['kyiv', 'kiev', 'kijev', 'Киев']::text[]),
  ('lviv', 'Львів', 'lvivska', array['lviv', 'lvov', 'lwow', 'Львов']::text[]),
  ('odesa', 'Одеса', 'odeska', array['odesa', 'odessa', 'Одесса']::text[]),
  ('dnipro', 'Дніпро', 'dnipropetrovska', array['dnipro', 'dnepr', 'dnipropetrovsk', 'Дніпропетровськ', 'Днепр']::text[]),
  ('kharkiv', 'Харків', 'kharkivska', array['kharkiv', 'kharkov', 'Харьков']::text[]),
  ('ivano-frankivsk', 'Івано-Франківськ', 'ivano-frankivska', array['ivano-frankivsk', 'frankivsk', 'ivano frankovsk', 'Франківськ', 'Станіслав']::text[]),
  ('chernivtsi', 'Чернівці', 'chernivetska', array['chernivtsi', 'chernovtsy', 'czernowitz', 'Черновцы']::text[]),
  ('vinnytsia', 'Вінниця', 'vinnytska', array['vinnytsia', 'vinnitsa', 'vinnitsia', 'Винница']::text[]),
  ('zaporizhzhia', 'Запоріжжя', 'zaporizka', array['zaporizhzhia', 'zaporozhye', 'zaporizhia', 'Запорожье']::text[]),
  ('poltava', 'Полтава', 'poltavska', array['poltava']::text[]),
  ('cherkasy', 'Черкаси', 'cherkaska', array['cherkasy', 'cherkassy', 'Черкассы']::text[]),
  ('zhytomyr', 'Житомир', 'zhytomyrska', array['zhytomyr', 'zhitomir']::text[]),
  ('chernihiv', 'Чернігів', 'chernihivska', array['chernihiv', 'chernigov', 'Чернигов']::text[]),
  ('sumy', 'Суми', 'sumska', array['sumy']::text[]),
  ('mykolaiv', 'Миколаїв', 'mykolaivska', array['mykolaiv', 'nikolaev', 'nikolayev', 'Николаев']::text[]),
  ('kherson', 'Херсон', 'khersonska', array['kherson']::text[]),
  ('rivne', 'Рівне', 'rivnenska', array['rivne', 'rovno', 'Ровно']::text[]),
  ('lutsk', 'Луцьк', 'volynska', array['lutsk', 'Луцк']::text[]),
  ('ternopil', 'Тернопіль', 'ternopilska', array['ternopil', 'ternopol', 'Тернополь']::text[]),
  ('khmelnytskyi', 'Хмельницький', 'khmelnytska', array['khmelnytskyi', 'khmelnitsky', 'khmelnitskiy', 'Хмельницкий']::text[]),
  ('uzhhorod', 'Ужгород', 'zakarpatska', array['uzhhorod', 'uzhgorod']::text[]),
  ('kropyvnytskyi', 'Кропивницький', 'kirovohradska', array['kropyvnytskyi', 'kropivnitsky', 'kirovograd', 'Кіровоград']::text[]),
  ('kryvyi-rih', 'Кривий Ріг', 'dnipropetrovska', array['kryvyi rih', 'kryvyi-rih', 'krivoy rog', 'kryvyj rih', 'Кривой Рог']::text[]),
  ('kamianske', 'Кам’янське', 'dnipropetrovska', array['kamianske', 'kamenskoe', 'Дніпродзержинськ']::text[]),
  ('bila-tserkva', 'Біла Церква', 'kyivska', array['bila tserkva', 'bila-tserkva', 'belaya tserkov', 'Белая Церковь']::text[]),
  ('brovary', 'Бровари', 'kyivska', array['brovary']::text[]),
  ('irpin', 'Ірпінь', 'kyivska', array['irpin', 'irpen']::text[]),
  ('kremenchuk', 'Кременчук', 'poltavska', array['kremenchuk', 'kremenchug']::text[]),
  ('mukachevo', 'Мукачево', 'zakarpatska', array['mukachevo', 'mukacheve']::text[]),
  ('kamianets-podilskyi', 'Кам’янець-Подільський', 'khmelnytska', array['kamianets-podilskyi', 'kamianets podilskyi', 'kamenets-podolsky', 'Каменец-Подольский']::text[]),
  ('drohobych', 'Дрогобич', 'lvivska', array['drohobych', 'drogobych']::text[]),
  ('uman', 'Умань', 'cherkaska', array['uman']::text[]),
  ('kramatorsk', 'Краматорськ', 'donetska', array['kramatorsk']::text[])
) as v (id, name, region_id, aliases)
on conflict (id) do nothing;

-- ───────────────────────── Каталог послуг (ТЗ §4) ─────────────────────────

insert into public.services (service_code, name, role, unit, tiered, included_text, sort, is_demo) values
  ('IMPLANT_INSTALL',    'Імплант (встановлення)',           'implant',        'за імплант',  true,  'Імплант і його встановлення, місцева анестезія', 10, true),
  ('HEALING_ABUTMENT',   'Формувач ясен',                    'healing',        'за імплант',  false, 'Формувач ясен (хілінг-абатмент) і його встановлення', 20, true),
  ('SCAN_BOTH',          'Сканування',                       'scan',           'за етап',     false, 'Цифрове сканування обох щелеп (один запис на етап лікування)', 30, true),
  ('SUPERSTRUCTURE_SET', 'Абатмент і компоненти',            'superstructure', 'за імплант',  false, 'Абатмент і компоненти для кріплення коронки', 40, true),
  ('CROWN_IMPLANT',      'Коронка на імплант',               'crown',          'за коронку',  true,  'Постійна коронка на імпланті з фіксацією', 50, true),
  ('TEMP_CROWN_UNIT',    'Тимчасова коронка',                'temporary',      'за зуб',      false, 'Тимчасова коронка на період приживлення', 60, true),
  ('MULTIUNIT',          'Мультиюніт-абатмент',              'multiunit',      'за імплант',  false, 'Мультиюніт-абатмент для конструкції на всю щелепу', 70, true),
  ('ARCH_TEMP',          'Тимчасова незнімна конструкція',   'arch_temp',      'за щелепу',   false, 'Тимчасова незнімна конструкція на щелепу', 80, true),
  ('ARCH_FINAL',         'Постійна конструкція на щелепу',   'arch_final',     'за щелепу',   true,  'Постійна незнімна конструкція на щелепу', 90, true),
  ('EXTRACTION_SIMPLE',  'Видалення зуба (просте)',          'addon',          'за зуб',      false, 'Просте видалення зуба', 100, true),
  ('EXTRACTION_COMPLEX', 'Видалення зуба (складне)',         'addon',          'за зуб',      false, 'Складне (хірургічне) видалення зуба', 110, true),
  ('AUGMENT',            'Кісткова пластика',                'addon',          'за ділянку',  false, 'Збільшення об’єму кістки в ділянці імплантації', 120, true),
  ('SINUS',              'Синус-ліфтинг',                    'addon',          'за сторону',  false, 'Підсадка кістки в ділянці верхньої щелепної пазухи', 130, true),
  ('SOFT_TISSUE',        'Пластика м’яких тканин',           'addon',          'за ділянку',  false, 'Пластика ясен навколо імпланта', 140, true),
  ('SEDATION',           'Седація',                          'addon',          'за годину',   false, 'Седація під контролем анестезіолога', 150, true),
  ('SURGICAL_GUIDE',     'Хірургічний шаблон',               'addon',          'за щелепу',   false, 'Навігаційний хірургічний шаблон для встановлення імплантів', 160, true)
on conflict (service_code) do nothing;

-- ───────────────────────── Курси НБУ і налаштування ─────────────────────────

insert into public.currency_rates (currency, rate_to_uah, rate_date) values
  ('EUR', 50.1385, '2026-10-09'),
  ('USD', 41.25,   '2026-10-09')
on conflict (currency, rate_date) do nothing;

-- settings: один рядок із типовими значеннями (min_clinics = 3, median, 12 міс., попередження 30 %) створює міграція.

-- ───────────────────────── Ручні орієнтири (канонічні демо-значення, UAH) ─────────────────────────
-- Калькулятор використовує ТІ САМІ числа у своїй dev-фікстурі.
-- Міські = база × коефіцієнт міста, регіональні = база × коефіцієнт макрорегіону,
-- округлення до 100 грн за правилом JS: Math.round(база × коефіцієнт / 100) × 100 (float8, як у фікстурі калькулятора).

create temporary table _demo_base (service_code text, tier text, price integer);
insert into _demo_base values
  ('HEALING_ABUTMENT', 'common', 1800),
  ('SCAN_BOTH', 'common', 1500),
  ('SUPERSTRUCTURE_SET', 'common', 5500),
  ('TEMP_CROWN_UNIT', 'common', 2500),
  ('MULTIUNIT', 'common', 6500),
  ('ARCH_TEMP', 'common', 38000),
  ('EXTRACTION_SIMPLE', 'common', 1100),
  ('EXTRACTION_COMPLEX', 'common', 2500),
  ('AUGMENT', 'common', 12000),
  ('SINUS', 'common', 18000),
  ('SOFT_TISSUE', 'common', 7500),
  ('SEDATION', 'common', 4000),
  ('SURGICAL_GUIDE', 'common', 4500),
  ('IMPLANT_INSTALL', 'minimum', 12000),
  ('IMPLANT_INSTALL', 'classic', 18000),
  ('IMPLANT_INSTALL', 'premium', 28000),
  ('CROWN_IMPLANT', 'minimum', 7000),
  ('CROWN_IMPLANT', 'classic', 10000),
  ('CROWN_IMPLANT', 'premium', 15000),
  ('ARCH_FINAL', 'minimum', 85000),
  ('ARCH_FINAL', 'classic', 130000),
  ('ARCH_FINAL', 'premium', 210000);

insert into public.city_manual_prices (city_id, service_code, tier, value, is_demo)
select m.city_id, b.service_code, b.tier, floor(b.price::float8 * m.mult::float8 / 100 + 0.5) * 100, true
from _demo_base b
cross join (values
  ('kyiv', 1.15),
  ('lviv', 1.00),
  ('odesa', 1.02),
  ('dnipro', 0.97),
  ('kharkiv', 0.95),
  ('ivano-frankivsk', 0.93),
  ('chernivtsi', 0.90)
) as m (city_id, mult);

insert into public.region_manual_prices (region_id, service_code, tier, value, currency, is_demo)
select m.region_id, b.service_code, b.tier, floor(b.price::float8 * m.mult::float8 / 100 + 0.5) * 100, 'UAH', true
from _demo_base b
cross join (values
  ('kyiv-city', 1.15),
  ('lvivska', 0.95),
  ('ivano-frankivska', 0.95),
  ('ternopilska', 0.95),
  ('zakarpatska', 0.95),
  ('chernivetska', 0.95),
  ('volynska', 0.95),
  ('rivnenska', 0.95),
  ('khmelnytska', 0.95),
  ('vinnytska', 0.92),
  ('cherkaska', 0.92),
  ('kirovohradska', 0.92),
  ('poltavska', 0.92),
  ('kyivska', 0.92),
  ('zhytomyrska', 0.88),
  ('chernihivska', 0.88),
  ('sumska', 0.88),
  ('odeska', 1.00),
  ('mykolaivska', 1.00),
  ('khersonska', 1.00),
  ('zaporizka', 1.00),
  ('dnipropetrovska', 0.95),
  ('kharkivska', 0.95),
  ('donetska', 0.95),
  ('luhanska', 0.95)
) as m (region_id, mult);

drop table _demo_base;

-- ───────────────────────── Демо-клініки ─────────────────────────
-- Київ: 3 активні клініки з класичним імплантом 17000 / 18500 / 19500 → медіана 18500, clinic_count 3 →
-- Київ IMPLANT_INSTALL/classic публікується як «aggregate». Дві клініки належать одній мережі,
-- але мають різні ціни — рахуються обидві.
-- Львів: 2 клініки (недостатньо для агрегату) → Львів лишається на ручному орієнтирі.

insert into public.clinics (id, name, city_id, network_id, status, verified_at, contacts, is_demo) values
  ('d0000000-0000-4000-8000-000000000001', 'Демо-клініка Київ 1', 'kyiv', 'demo-network-kyiv', 'active', now(), 'демо', true),
  ('d0000000-0000-4000-8000-000000000002', 'Демо-клініка Київ 2', 'kyiv', 'demo-network-kyiv', 'active', now(), 'демо', true),
  ('d0000000-0000-4000-8000-000000000003', 'Демо-клініка Київ 3', 'kyiv', null,                'active', now(), 'демо', true),
  ('d0000000-0000-4000-8000-000000000011', 'Демо-клініка Львів 1', 'lviv', null,               'active', now(), 'демо', true),
  ('d0000000-0000-4000-8000-000000000012', 'Демо-клініка Львів 2', 'lviv', null,               'active', now(), 'демо', true)
on conflict (id) do nothing;

insert into public.clinic_prices
  (clinic_id, service_code, tier, price_from, currency, offer_name, included_text, valid_from, verified_at, status, is_demo)
select v.clinic_id::uuid, 'IMPLANT_INSTALL', 'classic', v.price, 'UAH', 'Демо: імплант класичного рівня',
       'Імплант і його встановлення, місцева анестезія', current_date, now(), 'approved', true
from (values
  ('d0000000-0000-4000-8000-000000000001', 17000),
  ('d0000000-0000-4000-8000-000000000002', 18500),
  ('d0000000-0000-4000-8000-000000000003', 19500),
  ('d0000000-0000-4000-8000-000000000011', 16500),
  ('d0000000-0000-4000-8000-000000000012', 17800)
) as v (clinic_id, price);

-- ───────────────────────── Перша публікація ─────────────────────────
-- Тригери вже поставили зачеплені комбінації в чергу; додатково ставимо всі й обробляємо одразу
-- (далі це робить pg_cron щохвилини).

select public.enqueue_all_combos();
select public.process_recalc_queue(100000);
