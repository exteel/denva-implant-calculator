# Denva Implant Calculator

DENVA AI — калькулятор орієнтовної вартості імплантації за містами (ТЗ 3.3 — `docs/TZ_v3.3_DENVA_AI.txt`).

Живе посилання: https://exteel.github.io/denva-implant-calculator/

## Стек

Next.js 15 (статичний експорт) · TypeScript · Tailwind CSS 4 · Vitest · Playwright.
Деплой — GitHub Actions → GitHub Pages на кожен push у `main`.

## Калькулятор пацієнта (v3, ТЗ `docs/TZ_v3.3_DENVA_AI.txt`, архітектура `docs/ARCHITECTURE_v3.md`)

Формули — `src/engine/v3/` (чистий переносний TypeScript: без React/DOM/Node, лише відносні імпорти — той самий код
працює в браузері та в Edge Function `calculate`): `calculateJaw()` / `calculateQuote()` (`calc.ts`), `priceMeta`
(`meta.ts`), речення про джерело цін ТЗ §6.1 (`sentence.ts`), «Не знаю точно» (`unknown.ts`), питання по щелепах
(`flow.ts`); форматування лише для показу — `format.ts`. UI — `src/components/calculator/` (`CalculatorApp`
приймає `initialLocation` і `embedded` для міських SEO-сторінок); стан — лише у `localStorage`.

Ціни не лежать у коді: `src/lib/data/` — інтерфейс `CalculatorDataSource` (Supabase RPC + Edge Function `submit-lead`).
Для локальної розробки та e2e є фікстура (демо-дані): `NEXT_PUBLIC_DATA_SOURCE=fixture`; у звичайній збірці
модуль фікстури не потрапляє в бандл. Без налаштованого Supabase продакшн-збірка показує спокійний стан
«Калькулятор тимчасово недоступний».

## Команди

```bash
npm run dev          # локальна розробка
npm test             # юніт-тести
npm run build        # статична збірка в out/
NEXT_PUBLIC_DATA_SOURCE=fixture NEXT_PUBLIC_BASE_PATH= npm run build && npx playwright test e2e/calculator-v3.spec.ts
```
