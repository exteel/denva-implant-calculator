# Denva Implant Calculator

DENVA AI — калькулятор орієнтовної вартості імплантації за містами (ТЗ v2 — `docs/TZ_v2_DENVA_AI.txt`).

Живе посилання: https://exteel.github.io/denva-implant-calculator/

## Стек

Next.js 15 (статичний експорт) · TypeScript · Tailwind CSS 4 · Vitest · Playwright.
Деплой — GitHub Actions → GitHub Pages на кожен push у `main`.

## Калькулятор пацієнта (v2, ТЗ `docs/TZ_v2_DENVA_AI.txt`)

Формули — `src/engine/v2/` (чистий TypeScript): `calc.ts` (ТЗ §4), `params.ts` + `flow.ts` (відповіді → параметри),
`source.ts` (підпис джерела ціни), `format.ts` (грн/EUR, дати, відмінки). UI — `src/components/calculator/`,
`/` і `/calculator/` рендерять той самий застосунок.

Ціни не лежать у коді: `src/lib/data/` — інтерфейс `CalculatorDataSource` (Supabase RPC + Edge Function `submit-lead`).
Для локальної розробки та e2e є фікстура (демо-дані): `NEXT_PUBLIC_DATA_SOURCE=fixture`; у звичайній збірці
модуль фікстури не потрапляє в бандл. Без налаштованого Supabase продакшн-збірка показує спокійний стан
«Калькулятор тимчасово недоступний».

## Команди

```bash
npm run dev          # локальна розробка
npm test             # юніт-тести
npm run build        # статична збірка в out/
NEXT_PUBLIC_DATA_SOURCE=fixture NEXT_PUBLIC_BASE_PATH= npm run build && npx playwright test e2e/calculator-v2.spec.ts
```
