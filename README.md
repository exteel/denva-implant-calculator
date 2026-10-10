# Denva Implant Calculator

Калькулятор ринкової вартості імплантації для пацієнтів (ТЗ v1.0 — `docs/TZ_v1.0_UA.txt`).

Живе посилання: https://exteel.github.io/denva-implant-calculator/

## Стек

Next.js 15 (статичний експорт) · TypeScript · Tailwind CSS 4 · Vitest · Playwright.
Деплой — GitHub Actions → GitHub Pages на кожен push у `main`.

## Архітектура

Уся логіка — у `src/engine/` (чистий TypeScript без React, контракти в `types.ts`):

```
відповіді → questions.ts (граф питань) → resolver.ts (кошик + модифікатори + клінічна впевненість)
          → price-engine.ts (геофолбек місто → область → макрорегіон → Україна; p25/медіана/p75)
          → catalog.ts (кошики, компоненти, додаткові процедури)
          → comparison.ts (C00/R01) → routing.ts (один CTA)
```

UI — `src/components/calculator/`, лендінг — `src/app/page.tsx`.
Аналітика (ТЗ §19) — `src/services/analytics.ts` → `window.dataLayer` (готово для GTM).

## Ринкові дані

`src/engine/market-data/demo-prices.json` — **демо-дані** у форматі ТЗ §17
(`service_or_basket, geo_scope, segment, p25, median, p75, n, source_mix, updated_at, …`),
згенеровані `scripts/generate-demo-prices.mjs`. Щоб підставити реальні дані — замініть JSON
(та встановіть `is_demo: false`). Записи можуть бути як на рівні компонентів, так і на рівні
кошика (кошик має пріоритет для референсного сценарію).

## Заявки

CTA відкривають форму заявки. Поки `NEXT_PUBLIC_LEAD_ENDPOINT` не задано — це демо-режим
(заявка нікуди не надсилається, користувач бачить про це повідомлення). Щоб підключити CRM/бекенд,
задайте змінну в `.github/workflows/deploy.yml` — payload надсилається POST-запитом у JSON.

## Команди

```bash
npm run dev          # локальна розробка
npm test             # юніт-тести рушія
npm run build        # статична збірка в out/
npm run test:e2e     # прокліки в браузері (потрібна збірка out/)
```
