"use client";

import { useId, useMemo, useState } from "react";
import type { PublicLocation } from "@/lib/contracts";
import { listRegions, searchCities } from "@/engine/v2";
import { StepHeading } from "./StepHeading";
import { UnavailableState } from "./UnavailableState";
import type { Loadable } from "./useCalculatorData";

interface Props {
  locations: Loadable<PublicLocation[]>;
  onRetry: () => void;
  onSelect: (location: PublicLocation) => void;
}

/** ТЗ §5.1: the list appears only after 1–2 letters; no city → pick an oblast. */
export function CityStep({ locations, onRetry, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [pickRegion, setPickRegion] = useState(false);
  const inputId = useId();
  const all = useMemo(() => (locations.status === "ready" ? locations.data : []), [locations]);
  const results = useMemo(() => searchCities(all, query), [all, query]);
  const regions = useMemo(() => listRegions(all), [all]);
  const typed = query.trim().length > 0;

  return (
    <div>
      <StepHeading focus={false}>Калькулятор імплантації</StepHeading>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">
        Дізнайтеся орієнтовну вартість імплантації у вашому місті
      </p>

      {locations.status === "error" ? (
        <UnavailableState unavailable={locations.unavailable} onRetry={onRetry} />
      ) : !pickRegion ? (
        <>
          <label htmlFor={inputId} className="mt-6 block text-[15px] font-bold">
            Оберіть місто лікування
          </label>
          <input
            id={inputId}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) onSelect(results[0]);
            }}
            placeholder="Почніть вводити назву міста"
            className="mt-2 h-14 w-full rounded-2xl border border-line-strong bg-paper px-4 text-[16px] font-semibold placeholder:font-medium placeholder:text-muted focus:border-brand focus:outline-none"
          />
          {typed && results.length > 0 && (
            <ul className="mt-3 grid gap-2" aria-label="Знайдені міста">
              {results.map((city) => (
                <li key={city.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(city)}
                    data-testid={`location-${city.kind}-${city.id}`}
                    className="flex min-h-13 w-full items-center justify-between rounded-2xl border border-line bg-paper px-4 py-3 text-left text-[16px] font-bold hover:border-brand hover:bg-brand-soft"
                  >
                    <span>
                      {city.name}
                      {city.region_name && (
                        <span className="block text-sm font-medium text-muted">{city.region_name}</span>
                      )}
                    </span>
                    <span aria-hidden className="text-muted">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {typed && results.length === 0 && (
            <p className="mt-4 text-[15px] text-muted" role="status">
              {locations.status === "loading" ? "Завантажуємо список міст…" : "Такого міста немає в списку."}
            </p>
          )}
          <button
            type="button"
            onClick={() => setPickRegion(true)}
            className="mt-4 text-[15px] font-bold text-brand underline-offset-4 hover:underline"
          >
            Немає мого міста — оберіть область
          </button>
        </>
      ) : (
        <>
          <p className="mt-6 text-[15px] font-bold">Оберіть область</p>
          {regions.length === 0 && locations.status === "loading" && (
            <p className="mt-3 text-[15px] text-muted" role="status">
              Завантажуємо список областей…
            </p>
          )}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Області">
            {regions.map((region) => (
              <li key={region.id}>
                <button
                  type="button"
                  onClick={() => onSelect(region)}
                  data-testid={`location-${region.kind}-${region.id}`}
                  className="flex min-h-12 w-full items-center rounded-2xl border border-line bg-paper px-4 py-2.5 text-left text-[15px] font-bold hover:border-brand hover:bg-brand-soft"
                >
                  {region.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setPickRegion(false)}
            className="mt-4 text-[15px] font-bold text-brand underline-offset-4 hover:underline"
          >
            ← Повернутися до пошуку міста
          </button>
        </>
      )}
    </div>
  );
}
