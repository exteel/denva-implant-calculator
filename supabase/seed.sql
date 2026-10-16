-- DENVA AI v3 · демо-дані (seed). УСІ рядки позначені is_demo = true.
-- Застосовується ПІСЛЯ міграцій (каталог послуг v3 створює міграція …000008):
--   віддалено: `npx supabase db push --include-seed`, локально: `npx supabase db reset`.
-- Згенеровано: області/міста з v1-списку (src/engine/geo.ts) + канонічні демо-ціни з docs/ARCHITECTURE_v3.md, Додаток А.
-- Замініть їх реальними даними в адмінпанелі: значення, змінене людиною, перестає бути демо.

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

insert into public.currency_rates (currency, rate_to_uah, rate_date) values
  ('EUR', 50.1385, '2026-10-09'),
  ('USD', 41.25,   '2026-10-09')
on conflict (currency, rate_date) do nothing;

-- ── Базові ціни України (country_manual_prices): значення Додатка А ──
insert into public.country_manual_prices (country_id, service_code, tier, value, is_demo)
select 'UA', b.service_code, b.tier, b.price, true
from (values
    ('IMPLANT_INSTALL', 'minimum', 12000),
    ('IMPLANT_INSTALL', 'classic', 18000),
    ('IMPLANT_INSTALL', 'premium', 28000),
    ('HEALING_ABUTMENT', 'minimum', 1500),
    ('HEALING_ABUTMENT', 'classic', 1800),
    ('HEALING_ABUTMENT', 'premium', 2500),
    ('SCAN_JAW_STAGE', 'common', 1200),
    ('REPEAT_SCAN_JAW', 'common', 1000),
    ('SUPERSTRUCTURE_SET', 'minimum', 4500),
    ('SUPERSTRUCTURE_SET', 'classic', 5500),
    ('SUPERSTRUCTURE_SET', 'premium', 8000),
    ('CROWN_IMPLANT', 'minimum', 7000),
    ('CROWN_IMPLANT', 'classic', 10000),
    ('CROWN_IMPLANT', 'premium', 15000),
    ('TEMP_CROWN_UNIT', 'common', 2500),
    ('ABUTMENT_FINAL', 'minimum', 3000),
    ('ABUTMENT_FINAL', 'classic', 4000),
    ('ABUTMENT_FINAL', 'premium', 6000),
    ('MULTIUNIT', 'minimum', 5000),
    ('MULTIUNIT', 'classic', 6500),
    ('MULTIUNIT', 'premium', 9000),
    ('ARCH_TEMP', 'common', 38000),
    ('ARCH_FINAL', 'minimum', 85000),
    ('ARCH_FINAL', 'classic', 130000),
    ('ARCH_FINAL', 'premium', 210000),
    ('IMPLANT_CONSULT', 'common', 600),
    ('CT_ONE_JAW', 'common', 900),
    ('CT_BOTH_JAWS', 'common', 1400),
    ('REMOVAL_SIMPLE', 'common', 1100),
    ('REMOVAL_COMPLEX', 'common', 2500),
    ('REMOVAL_WISDOM_SIMPLE', 'common', 1800),
    ('REMOVAL_WISDOM_COMPLEX', 'common', 3500),
    ('REMOVAL_RESORCIN', 'common', 2200),
    ('REMOVAL_IMPACTED', 'common', 4500),
    ('ANESTHESIA_AREA', 'common', 400),
    ('SUTURE_AREA', 'common', 300),
    ('HEMOSTATIC_SPONGE', 'common', 250),
    ('AUGMENT_SEGMENT', 'common', 12000),
    ('SINUS_LIFT', 'common', 18000),
    ('SOFT_TISSUE', 'common', 7500),
    ('SEDATION_30_MIN', 'common', 2500),
    ('SURGICAL_GUIDE_STANDARD', 'common', 4500),
    ('CEMENT_RESTORATION_REMOVAL', 'common', 500)
  ) as b (service_code, tier, price)
on conflict (country_id, service_code, tier) do nothing;

-- ── Обласні baseline = база × коефіцієнт макрорегіону; Закарпатська і Волинська без обласних цін
--    (їхні міста отримують national_fallback). Округлення до 100: Math.round(база × коеф / 100) × 100 (float8, як у JS).
insert into public.region_manual_prices (region_id, service_code, tier, value, currency, is_demo)
select m.region_id, b.service_code, b.tier, floor(b.price::float8 * m.mult::float8 / 100 + 0.5) * 100, 'UAH', true
from (values
    ('IMPLANT_INSTALL', 'minimum', 12000),
    ('IMPLANT_INSTALL', 'classic', 18000),
    ('IMPLANT_INSTALL', 'premium', 28000),
    ('HEALING_ABUTMENT', 'minimum', 1500),
    ('HEALING_ABUTMENT', 'classic', 1800),
    ('HEALING_ABUTMENT', 'premium', 2500),
    ('SCAN_JAW_STAGE', 'common', 1200),
    ('REPEAT_SCAN_JAW', 'common', 1000),
    ('SUPERSTRUCTURE_SET', 'minimum', 4500),
    ('SUPERSTRUCTURE_SET', 'classic', 5500),
    ('SUPERSTRUCTURE_SET', 'premium', 8000),
    ('CROWN_IMPLANT', 'minimum', 7000),
    ('CROWN_IMPLANT', 'classic', 10000),
    ('CROWN_IMPLANT', 'premium', 15000),
    ('TEMP_CROWN_UNIT', 'common', 2500),
    ('ABUTMENT_FINAL', 'minimum', 3000),
    ('ABUTMENT_FINAL', 'classic', 4000),
    ('ABUTMENT_FINAL', 'premium', 6000),
    ('MULTIUNIT', 'minimum', 5000),
    ('MULTIUNIT', 'classic', 6500),
    ('MULTIUNIT', 'premium', 9000),
    ('ARCH_TEMP', 'common', 38000),
    ('ARCH_FINAL', 'minimum', 85000),
    ('ARCH_FINAL', 'classic', 130000),
    ('ARCH_FINAL', 'premium', 210000),
    ('IMPLANT_CONSULT', 'common', 600),
    ('CT_ONE_JAW', 'common', 900),
    ('CT_BOTH_JAWS', 'common', 1400),
    ('REMOVAL_SIMPLE', 'common', 1100),
    ('REMOVAL_COMPLEX', 'common', 2500),
    ('REMOVAL_WISDOM_SIMPLE', 'common', 1800),
    ('REMOVAL_WISDOM_COMPLEX', 'common', 3500),
    ('REMOVAL_RESORCIN', 'common', 2200),
    ('REMOVAL_IMPACTED', 'common', 4500),
    ('ANESTHESIA_AREA', 'common', 400),
    ('SUTURE_AREA', 'common', 300),
    ('HEMOSTATIC_SPONGE', 'common', 250),
    ('AUGMENT_SEGMENT', 'common', 12000),
    ('SINUS_LIFT', 'common', 18000),
    ('SOFT_TISSUE', 'common', 7500),
    ('SEDATION_30_MIN', 'common', 2500),
    ('SURGICAL_GUIDE_STANDARD', 'common', 4500),
    ('CEMENT_RESTORATION_REMOVAL', 'common', 500)
  ) as b (service_code, tier, price)
cross join (values
    ('kyiv-city', 1.15),
    ('lvivska', 0.95),
    ('ivano-frankivska', 0.95),
    ('ternopilska', 0.95),
    ('chernivetska', 0.95),
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
) as m (region_id, mult)
on conflict (region_id, service_code, tier) do nothing;

-- ── Міські baseline (7 міст); інші міста → обласний baseline ──
insert into public.city_manual_prices (city_id, service_code, tier, value, is_demo)
select m.city_id, b.service_code, b.tier, floor(b.price::float8 * m.mult::float8 / 100 + 0.5) * 100, true
from (values
    ('IMPLANT_INSTALL', 'minimum', 12000),
    ('IMPLANT_INSTALL', 'classic', 18000),
    ('IMPLANT_INSTALL', 'premium', 28000),
    ('HEALING_ABUTMENT', 'minimum', 1500),
    ('HEALING_ABUTMENT', 'classic', 1800),
    ('HEALING_ABUTMENT', 'premium', 2500),
    ('SCAN_JAW_STAGE', 'common', 1200),
    ('REPEAT_SCAN_JAW', 'common', 1000),
    ('SUPERSTRUCTURE_SET', 'minimum', 4500),
    ('SUPERSTRUCTURE_SET', 'classic', 5500),
    ('SUPERSTRUCTURE_SET', 'premium', 8000),
    ('CROWN_IMPLANT', 'minimum', 7000),
    ('CROWN_IMPLANT', 'classic', 10000),
    ('CROWN_IMPLANT', 'premium', 15000),
    ('TEMP_CROWN_UNIT', 'common', 2500),
    ('ABUTMENT_FINAL', 'minimum', 3000),
    ('ABUTMENT_FINAL', 'classic', 4000),
    ('ABUTMENT_FINAL', 'premium', 6000),
    ('MULTIUNIT', 'minimum', 5000),
    ('MULTIUNIT', 'classic', 6500),
    ('MULTIUNIT', 'premium', 9000),
    ('ARCH_TEMP', 'common', 38000),
    ('ARCH_FINAL', 'minimum', 85000),
    ('ARCH_FINAL', 'classic', 130000),
    ('ARCH_FINAL', 'premium', 210000),
    ('IMPLANT_CONSULT', 'common', 600),
    ('CT_ONE_JAW', 'common', 900),
    ('CT_BOTH_JAWS', 'common', 1400),
    ('REMOVAL_SIMPLE', 'common', 1100),
    ('REMOVAL_COMPLEX', 'common', 2500),
    ('REMOVAL_WISDOM_SIMPLE', 'common', 1800),
    ('REMOVAL_WISDOM_COMPLEX', 'common', 3500),
    ('REMOVAL_RESORCIN', 'common', 2200),
    ('REMOVAL_IMPACTED', 'common', 4500),
    ('ANESTHESIA_AREA', 'common', 400),
    ('SUTURE_AREA', 'common', 300),
    ('HEMOSTATIC_SPONGE', 'common', 250),
    ('AUGMENT_SEGMENT', 'common', 12000),
    ('SINUS_LIFT', 'common', 18000),
    ('SOFT_TISSUE', 'common', 7500),
    ('SEDATION_30_MIN', 'common', 2500),
    ('SURGICAL_GUIDE_STANDARD', 'common', 4500),
    ('CEMENT_RESTORATION_REMOVAL', 'common', 500)
  ) as b (service_code, tier, price)
cross join (values
    ('kyiv', 1.15),
    ('lviv', 1.00),
    ('odesa', 1.02),
    ('dnipro', 0.97),
    ('kharkiv', 0.95),
    ('ivano-frankivsk', 0.93),
    ('chernivtsi', 0.90)
) as m (city_id, mult)
on conflict (city_id, service_code, tier) do nothing;

-- ── Демо-клініки (IMPLANT_INSTALL / classic, approved) ──
-- Київ: 3 клініки 17000 / 18500 / 19500 → aggregate 18500 (дві з однієї мережі, але різні ціни — рахуються обидві).
-- Львів: 2 клініки 17500 / 19000 → hybrid ⅔·18250 + ⅓·18000 (baseline міста).
-- Одеса: 1 клініка 19000 → hybrid ⅓·19000 + ⅔·18400 (baseline міста 18000 × 1.02 → 18400).
insert into public.clinics (id, name, city_id, network_id, status, verified_at, contacts, is_demo) values
  ('d0000000-0000-4000-8000-000000000001', 'Демо-клініка Київ 1', 'kyiv', 'demo-network-kyiv', 'active', now(), 'демо', true),
  ('d0000000-0000-4000-8000-000000000002', 'Демо-клініка Київ 2', 'kyiv', 'demo-network-kyiv', 'active', now(), 'демо', true),
  ('d0000000-0000-4000-8000-000000000003', 'Демо-клініка Київ 3', 'kyiv', null,                'active', now(), 'демо', true),
  ('d0000000-0000-4000-8000-000000000011', 'Демо-клініка Львів 1', 'lviv', null,               'active', now(), 'демо', true),
  ('d0000000-0000-4000-8000-000000000012', 'Демо-клініка Львів 2', 'lviv', null,               'active', now(), 'демо', true),
  ('d0000000-0000-4000-8000-000000000021', 'Демо-клініка Одеса 1', 'odesa', null,              'active', now(), 'демо', true)
on conflict (id) do nothing;

insert into public.clinic_prices
  (clinic_id, service_code, tier, price_from, currency, offer_name, included_text, valid_from, verified_at, status, is_demo)
select v.clinic_id::uuid, 'IMPLANT_INSTALL', 'classic', v.price, 'UAH', 'Демо: імплант класичного рівня',
       'Повна ціна встановлення імпланта без формувача та коронки', current_date, now(), 'approved', true
from (values
  ('d0000000-0000-4000-8000-000000000001', 17000),
  ('d0000000-0000-4000-8000-000000000002', 18500),
  ('d0000000-0000-4000-8000-000000000003', 19500),
  ('d0000000-0000-4000-8000-000000000011', 17500),
  ('d0000000-0000-4000-8000-000000000012', 19000),
  ('d0000000-0000-4000-8000-000000000021', 19000)
) as v (clinic_id, price);

-- ── SEO: усі міста draft (за замовчуванням), Київ — review з демо-контентом ──
update public.cities set
  seo_status = 'review',
  intro = 'Демо-вступ: скільки коштує імплантація у Києві — орієнтовні ринкові ціни на основі перевірених прайсів клінік міста та ручних орієнтирів DENVA.',
  faq = '[{"q": "Демо-питання: чи входить КТ у вартість імплантації?", "a": "Демо-відповідь: ні, КТ і консультація показуються окремо як можливі додаткові витрати."}, {"q": "Демо-питання: чому ціна орієнтовна?", "a": "Демо-відповідь: остаточну схему і ціну визначає лікар після консультації та КТ."}]'::jsonb,
  local_notes = 'Демо-нотатка про київський ринок: різниця між мінімальним і преміальним рівнями.',
  reviewer_name = 'Ім’я рецензента',
  reviewed_at = '2026-10-17T09:00:00+00',
  content_is_demo = true
where id = 'kyiv';

-- ── Перша публікація: тригери вже поставили зачеплені комбінації в чергу; ставимо всі й обробляємо одразу ──
select public.enqueue_all_combos();
select public.process_recalc_queue(100000);
