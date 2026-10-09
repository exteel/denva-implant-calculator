"use client";

import { useId, useMemo, useState } from "react";
import { OBLASTS, oblastLocationId, searchCities } from "@/engine/geo";
import type { City } from "@/engine/types";

export function CityStep({ onSelect }: { onSelect: (locationId: string) => void }) {
  const [query, setQuery] = useState("");
  const [pickOblast, setPickOblast] = useState(false);
  const inputId = useId();
  const results: City[] = useMemo(() => searchCities(query, 8), [query]);
  const oblasts = useMemo(
    () => [...OBLASTS].sort((a, b) => a.name.localeCompare(b.name, "uk")),
    [],
  );

  return (
    <div>
      <h1 className="text-[26px] leading-tight font-extrabold tracking-tight sm:text-[30px]">
        У якому місті плануєте лікування?
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        Ціни на імплантацію помітно відрізняються між містами. Якщо даних по місту замало, ми
        використаємо дані області або регіону — і чесно про це скажемо.
      </p>

      {!pickOblast ? (
        <>
          <label htmlFor={inputId} className="sr-only">
            Пошук міста
          </label>
          <input
            id={inputId}
            type="search"
            autoComplete="off"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) onSelect(results[0].id);
            }}
            placeholder="Почніть вводити назву міста"
            className="mt-6 h-14 w-full rounded-2xl border border-line-strong bg-paper px-4 text-[16px] font-semibold placeholder:font-medium placeholder:text-muted focus:border-brand focus:outline-none"
          />
          <ul className="mt-3 grid gap-2" aria-label="Міста">
            {results.map((city) => (
              <li key={city.id}>
                <button
                  type="button"
                  onClick={() => onSelect(city.id)}
                  className="flex min-h-13 w-full items-center justify-between rounded-2xl border border-line bg-paper px-4 py-3 text-left text-[16px] font-bold hover:border-brand hover:bg-brand-soft"
                >
                  {city.name}
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {results.length === 0 && (
            <p className="mt-4 text-[15px] text-muted">Такого міста немає в списку.</p>
          )}
          <button
            type="button"
            onClick={() => setPickOblast(true)}
            className="mt-4 text-[15px] font-bold text-brand underline-offset-4 hover:underline"
          >
            Мого міста немає — оберу область
          </button>
        </>
      ) : (
        <>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2" aria-label="Області">
            {oblasts.map((oblast) => (
              <li key={oblast.id}>
                <button
                  type="button"
                  // м. Київ is a city with its own market data, not an oblast.
                  onClick={() => onSelect(oblast.id === "kyiv-city" ? "kyiv" : oblastLocationId(oblast.id))}
                  className="flex min-h-12 w-full items-center rounded-2xl border border-line bg-paper px-4 py-2.5 text-left text-[15px] font-bold hover:border-brand hover:bg-brand-soft"
                >
                  {oblast.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setPickOblast(false)}
            className="mt-4 text-[15px] font-bold text-brand underline-offset-4 hover:underline"
          >
            ← Повернутися до пошуку міста
          </button>
        </>
      )}
    </div>
  );
}
