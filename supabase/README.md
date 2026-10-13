# Supabase-бекенд DENVA AI

Усе, що живе на сервері: схема бази, SQL-логіка цін, демо-дані та дві Edge Functions.
Контракт з фронтендом — `src/lib/contracts.ts`; ТЗ — `docs/TZ_v2_DENVA_AI.txt`; дизайн — `docs/ARCHITECTURE_v2.md`.

## Що тут лежить

| Шлях | Призначення |
|---|---|
| `config.toml` | налаштування CLI (`project_id = denva-implant-calculator`, функції `submit-lead` і `nbu-rate`) |
| `migrations/…000001_schema.sql` | таблиці: міста, області, послуги, клініки, прайси, ручні орієнтири, агрегати, опубліковані ціни, заявки… |
| `migrations/…000002_core_functions.sql` | агрегація (`compute_aggregate`), публікація (`publish_price`), перерахунок, черга |
| `migrations/…000003_triggers.sql` | валідація, журнал змін (`audit_log`), незмінні snapshot-и, постановка в чергу лише зачеплених комбінацій |
| `migrations/…000004_api.sql` | `list_locations`, `get_location_prices`, `admin_price_matrix`, `admin_clinic_prices`, `admin_aggregate_detail`, `import_clinic_prices`, адмін-RPC, `submit_lead_record` |
| `migrations/…000005_cron.sql` | pg_cron: черга щохвилини, «застарілі ціни» щодня (сама пропускається, якщо pg_cron недоступний) |
| `migrations/…000006_rls_grants.sql` | RLS і права (остання міграція) |
| `seed.sql` | демо-дані: області, міста, послуги, ціни, 5 демо-клінік, курси; усе з `is_demo = true` |
| `functions/submit-lead` | заявка з форми → база → Telegram |
| `functions/nbu-rate` | щоденне оновлення курсів НБУ (EUR, USD) |
| `functions/_shared` | чисті TS-модулі (форматування Telegram, валідація, обробник) — вони покриті тестами |
| `tests/` | тести на PGlite (Postgres у npm) і Vitest: `npx vitest run supabase` |

Як це працює в двох словах: будь-яка зміна ціни клініки, клініки, ручного орієнтира, режиму, курсу чи налаштувань
кладе в `recalc_queue` **лише зачеплену** комбінацію «місто × послуга × рівень»; `pg_cron` щохвилини запускає
`process_recalc_queue()`: новий snapshot у `city_aggregates` (з переліком включених/виключених записів і причинами),
потім `published_prices` за пріоритетом ТЗ §2.3 (`manual_override` → агрегат при n ≥ порога → ручне міське →
регіональне → немає рядка). Поки перерахунок не вдався, діє попередня ціна. Калькулятор читає лише
`get_location_prices()` — прайсів клінік пацієнт не бачить (RLS).

## Розгортання (робить власник, один раз)

1. Створіть проєкт на supabase.com (регіон ближче до України, наприклад Frankfurt). Запам'ятайте `project ref`
   (частина адреси `https://<ref>.supabase.co`).
2. У терміналі, з кореня репозиторію:

```bash
npx supabase login                          # відкриє браузер
npx supabase link --project-ref <ref>
npx supabase db push                        # застосує міграції
npx supabase db push --include-seed         # (або так, одразу з демо-даними з seed.sql)
npx supabase functions deploy submit-lead nbu-rate
npx supabase secrets set TELEGRAM_BOT_TOKEN=<токен> TELEGRAM_CHAT_ID=<chat id>
```

   Якщо `--include-seed` недоступний у вашій версії CLI — відкрийте **SQL Editor** у Supabase, вставте вміст
   `supabase/seed.sql` і виконайте. Seed можна запускати лише на чистій базі (він ідемпотентний для довідників,
   але демо-ціни вставляє без перевірки).
3. У **Project Settings → API** скопіюйте `Project URL` і `anon public` ключ — вони потрібні сайту
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). `service_role` ключ нікуди не копіюйте,
   крім розкладу курсів нижче.
4. **Authentication → URL Configuration**: Site URL = адреса адмінки на GitHub Pages
   (`https://exteel.github.io/denva-implant-calculator/admin/`), додайте її ж у Redirect URLs.

## Telegram-бот для заявок

1. У Telegram відкрийте **@BotFather** → `/newbot` → задайте назву та username → отримайте токен
   (`123456:ABC…`). Це `TELEGRAM_BOT_TOKEN`.
2. Створіть робочу групу DENVA, додайте туди бота.
3. Напишіть у групі будь-яке повідомлення, потім відкрийте в браузері
   `https://api.telegram.org/bot<токен>/getUpdates` — знайдіть `"chat":{"id":-100…}`. Це `TELEGRAM_CHAT_ID`
   (для груп починається з `-`).
4. `npx supabase secrets set TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=…`. Токен зберігається лише в Supabase.

Заявка спершу зберігається в `leads`, потім іде в Telegram. Якщо Telegram недоступний чи секрети не задані,
заявка не втрачається: `telegram_status = failed`, у адмінці є «Надіслати ще раз» (виклик `submit-lead` з
`{ "retry_lead_id": "…" }`; адмін може повторити будь-яку заявку, публічна форма — лише створену за останню годину).
Ліміт: не більше 5 заявок на один телефон за годину.

## Перший адміністратор

1. Відкрийте `/admin/` на сайті, зареєструйтесь (email + пароль).
2. У Supabase **SQL Editor** виконайте (підставте свій email):

```sql
insert into public.admin_users (user_id, email)
select id, email from auth.users where email = 'you@example.com';
```

3. Оновіть `/admin/` — з'являться розділи. Інших адміністраторів додаєте так само.
   Після цього можна вимкнути самостійну реєстрацію (**Authentication → Sign In / Providers → Email →
   Allow new users to sign up**): незареєстровані в `admin_users` користувачі й так нічого не бачать і не змінюють.

## Курси НБУ щодня (`nbu-rate`)

Функція вимагає заголовок `Authorization: Bearer <service_role key>`. Найпростіший розклад — pg_cron + pg_net
(увімкніть розширення `pg_net` і `pg_cron` у **Database → Extensions**, ключ збережіть у Vault):

```sql
select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

select cron.schedule('denva-nbu-rate', '10 7 * * *', $$
  select net.http_post(
    url     := 'https://<ref>.supabase.co/functions/v1/nbu-rate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body    := '{}'::jsonb);
$$);
```

(або через **Integrations → Cron** в дашборді: HTTP-запит із тим самим заголовком). Перевірити вручну:
`curl -X POST https://<ref>.supabase.co/functions/v1/nbu-rate -H "Authorization: Bearer <service_role key>"`.
Новий курс автоматично ставить у чергу лише комбінації, де є ціни в EUR/USD. Поки курсу немає, перерахунок таких
комбінацій відкладається, а діюча опублікована ціна не змінюється.

## Корисне

- Перерахувати зараз: у адмінці або `select recalculate_now('kyiv','IMPLANT_INSTALL','classic');`, `select recalculate_city('kyiv');`,
  `select process_recalc_queue();`.
- Чому ціна не змінилась: `select * from recalc_queue;` (колонка `last_error`) та `admin_aggregate_detail(...)`.
- Журнал змін: `audit_log` (автор, таблиця, старе/нове значення, причина); історія опублікованих цін — `published_price_history`;
  snapshot-и агрегатів — `city_aggregates` (лише додаються).
- Тести SQL: `npx vitest run supabase` (Docker не потрібен). Типи: `npx tsc --noEmit -p supabase/tsconfig.json`.
