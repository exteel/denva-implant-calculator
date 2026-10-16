"use client";

import { SERVICE_CODES, type PublicService } from "@/lib/contracts";
import type { PriceBook } from "@/engine/v3";
import { moneyLines, type Currency } from "@/engine/v3/format";
import type { CalcState } from "./model";

interface Props {
  book: PriceBook;
  state: CalcState;
  currency: Currency;
}

/** Codes worth highlighting for the answers the patient gave (never added to the total). */
export function highlightedAdditional(state: CalcState, activeJaws: number): Set<string> {
  const set = new Set<string>();
  const statuses = [state.answers.upper.status, state.answers.lower.status];
  if (statuses.includes("partly_present") || statuses.includes("extraction_recommended")) {
    set.add(SERVICE_CODES.REMOVAL_SIMPLE);
    set.add(SERVICE_CODES.REMOVAL_COMPLEX);
    set.add(SERVICE_CODES.ANESTHESIA_AREA);
    set.add(SERVICE_CODES.SUTURE_AREA);
    set.add(SERVICE_CODES.HEMOSTATIC_SPONGE);
  }
  if (statuses.includes("implants_installed")) set.add(SERVICE_CODES.CEMENT_RESTORATION_REMOVAL);
  set.add(activeJaws >= 2 ? SERVICE_CODES.CT_BOTH_JAWS : SERVICE_CODES.CT_ONE_JAW);
  return set;
}

/**
 * ТЗ §5.5 / §6.1: «Що може знадобитися додатково» — every additional service
 * with the city price; informational only, never in the total.
 */
export function AdditionalServices({ book, state, currency }: Props) {
  const activeJaws = (state.counts.upper > 0 ? 1 : 0) + (state.counts.lower > 0 ? 1 : 0) || 1;
  const highlight = highlightedAdditional(state, activeJaws);
  const rows = book.response.services
    .filter((s) => s.additional)
    .map((service) => ({ service, price: book.get(service.service_code, "common") }))
    .filter((r): r is { service: PublicService; price: NonNullable<typeof r.price> } => r.price !== undefined)
    .sort((a, b) => a.service.sort - b.service.sort);

  if (rows.length === 0) return null;

  const categories: string[] = [];
  for (const r of rows) if (!categories.includes(r.service.category)) categories.push(r.service.category);
  const hasHighlight = rows.some((r) => highlight.has(r.service.service_code));

  return (
    <section
      aria-labelledby="additional-title"
      data-testid="additional"
      className="rounded-[var(--radius-card)] border border-line bg-paper p-5"
    >
      <h2 id="additional-title" className="text-[18px] font-extrabold">
        Що може знадобитися додатково
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Не входить у суму вище. Чи потрібні ці процедури й у якому обсязі, визначає лікар після діагностики; ціни — для
        вашого міста.
      </p>
      <details className="mt-3" open={hasHighlight}>
        <summary className="min-h-10 cursor-pointer text-[15px] font-bold text-brand">
          Показати ціни ({rows.length})
        </summary>
        <div className="mt-2 space-y-4">
          {categories.map((category) => (
            <div key={category}>
              <p className="text-xs font-extrabold tracking-wide text-muted uppercase">{category}</p>
              <ul className="mt-1 divide-y divide-line text-sm">
                {rows
                  .filter((r) => r.service.category === category)
                  .map(({ service, price }) => {
                    const lines = moneyLines({ low: price.value, high: price.value }, currency, book.eurRate);
                    const on = highlight.has(service.service_code);
                    return (
                      <li
                        key={service.service_code}
                        data-testid={`additional-${service.service_code}`}
                        data-highlight={on}
                        className={`flex items-baseline justify-between gap-3 py-2 ${on ? "font-bold" : ""}`}
                      >
                        <span className={on ? "text-ink" : "text-ink-soft"}>
                          {service.name}
                          <span className="font-normal text-muted"> · {service.unit}</span>
                        </span>
                        <span className="tabular whitespace-nowrap">{lines.main}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
