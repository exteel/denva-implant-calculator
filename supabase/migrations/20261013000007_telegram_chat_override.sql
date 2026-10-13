-- DENVA AI v2 · 07 · Telegram: збереження нового chat id після міграції групи в супергрупу.
-- Якщо власник змінить налаштування групи, Telegram перетворює її на супергрупу (інший chat id), і
-- sendMessage повертає 400 з parameters.migrate_to_chat_id. submit-lead тоді повторює відправку з новим id
-- і зберігає його тут; надалі override має пріоритет над секретом TELEGRAM_CHAT_ID.
-- Читає/пише лише Edge Function (service_role); адміністратори бачать його як частину settings.

alter table public.settings add column telegram_chat_id_override text;
