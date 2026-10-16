"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Jaw, JawCalculation, JawInput, LeadIntent, LocationPricesResponse, PatientTier } from "@/lib/contracts";
import { createPriceBook, sourceSentence, type PriceBook } from "@/engine/v3";
import { formatDateUk, formatRate, type Currency } from "@/engine/v3/format";
import { getDataSource } from "@/lib/data";
import { buildLeadPayload } from "@/services/lead";
import { track } from "@/services/analytics";
import { AdditionalServices } from "./AdditionalServices";
import { JawBlock } from "./JawBlock";
import { LeadBlock } from "./LeadBlock";
import {
  JAWS,
  UNKNOWN_LABEL,
  deriveInputs,
  jawAvailable,
  leadParts,
  presetJaw,
  quoteFor,
  setAnswer,
  setCountKeepingOne,
  setScenario,
  setTiers,
  setUnknownChoice,
  leaveUnknownMode,
  type CalcState,
} from "./model";
import { Money, NO_DATA } from "./Money";
import { ParamsPanel } from "./ParamsPanel";
import { StepHeading } from "./StepHeading";
import { UnavailableState } from "./UnavailableState";
import type { LoadState } from "./useCalculatorData";
import type { ChosenLocation } from "./storage";

interface Props {
  location: ChosenLocation;
  prices: LoadState<LocationPricesResponse>;
  state: CalcState;
  update: (fn: (state: CalcState) => CalcState) => void;
  onRestart: () => void;
}

export function ResultView({ location, prices, state, update, onRestart }: Props) {
  const loaded = prices.state;
  if (loaded.status === "loading") {
    return (
      <div role="status" aria-live="polite" className="space-y-3" data-testid="result-loading">
        <p className="text-[17px] font-extrabold">Рахуємо вартість для {location.name}…</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-[var(--radius-card)] bg-line/60" />
        ))}
      </div>
    );
  }
  if (loaded.status === "error") return <UnavailableState unavailable={loaded.unavailable} onRetry={prices.retry} />;
  return <ResultBody response={loaded.data} location={location} state={state} update={update} onRestart={onRestart} />;
}

const submitLead = async (body: Parameters<Awaited<ReturnType<typeof getDataSource>>["submitLead"]>[0]) =>
  (await getDataSource()).submitLead(body);

function ResultBody({
  response,
  location,
  state,
  update,
  onRestart,
}: {
  response: LocationPricesResponse;
  location: ChosenLocation;
  state: CalcState;
  update: Props["update"];
  onRestart: () => void;
}) {
  const book = useMemo(() => createPriceBook(response), [response]);
  const inputs = useMemo(() => deriveInputs(state), [state]);
  const quote = useMemo(() => quoteFor(state, book), [state, book]);
  const currency: Currency = state.currency;
  const eurRate = book.eurRate;

  const calcs: Record<Jaw, JawCalculation | null> = { upper: quote.upperJawCalculation, lower: quote.lowerJawCalculation };
  const jawInputs: Record<Jaw, JawInput | null> = { upper: inputs.upper, lower: inputs.lower };
  const activeJaws = JAWS.filter((j) => calcs[j] !== null);
  const meta = quote.priceMeta;
  const hasData = quote.overallTotal !== null;

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track("result_viewed", { location_id: location.id, has_data: hasData });
    if (hasData) track("calculation_completed", { location_id: location.id, jaws: activeJaws.length });
  }, [location.id, hasData, activeJaws.length]);

  const rangeFrom = (jaw: Jaw) => inputs.rangeFromTeeth[jaw];

  const buildLead = (intent: LeadIntent, phone: string) =>
    buildLeadPayload({
      intent,
      phone,
      location,
      parts: leadParts(state, book),
      pageUrl: window.location.href,
      search: window.location.search,
    });

  const preset = (jaw: Jaw, tier: PatientTier): JawCalculation | null => {
    const input = jawInputs[jaw];
    return input ? presetJaw(input, tier, book, rangeFrom(jaw)) : null;
  };

  return (
    <div className="space-y-5">
      <div>
        <StepHeading>Орієнтовна вартість імплантації</StepHeading>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Середня ринкова ціна для: <span className="font-bold text-ink">{response.location.name}</span>
        </p>
      </div>

      {state.unknown.active && state.unknown.choice && (
        <p
          className="rounded-2xl border border-brand-line bg-brand-soft p-4 text-sm leading-relaxed text-ink-soft"
          data-testid="unknown-note"
        >
          Ви не знаєте точно, тому ми показуємо орієнтир: «{UNKNOWN_LABEL[state.unknown.choice]}». Уточніть у параметрах
          нижче — сума одразу перерахується.
        </p>
      )}

      <ParamsPanel
        state={state}
        inputs={inputs}
        onCount={(jaw, n) => {
          update((s) => setCountKeepingOne(s, jaw, n));
          track("params_changed", { what: "count", jaw, value: n });
        }}
        onLocation={(jaw, value) => update((s) => setAnswer(s, jaw, { location: value }))}
        onStatus={(jaw, value) => update((s) => setAnswer(s, jaw, { status: value }))}
        onInstalled={(jaw, value) => update((s) => setAnswer(s, jaw, { installed: value }))}
        onUnknownChoice={(choice) => update((s) => setUnknownChoice(s, choice))}
        onLeaveUnknown={() => update((s) => leaveUnknownMode(s))}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <CurrencyToggle
          value={currency}
          disabled={!eurRate}
          onChange={(c) => {
            update((s) => ({ ...s, currency: c }));
            track("currency_changed", { currency: c });
          }}
        />
        <label
          className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-2.5 text-left"
          data-testid="temp-toggle"
        >
          <input
            type="checkbox"
            checked={state.includeTemporary}
            onChange={(event) => {
              update((s) => ({ ...s, includeTemporary: event.target.checked }));
              track("temporary_toggled", { on: event.target.checked });
            }}
            className="size-5 shrink-0 accent-[var(--color-brand)]"
          />
          <span className="text-sm leading-snug font-bold">Врахувати можливе тимчасове протезування</span>
        </label>
      </div>

      {activeJaws.map((jaw) => {
        const input = jawInputs[jaw];
        const calc = calcs[jaw];
        if (!input || !calc) return null;
        return (
          <JawBlock
            key={jaw}
            jaw={jaw}
            input={input}
            calc={calc}
            minCalc={jawAvailable(calc) ? preset(jaw, "minimum") : null}
            premCalc={jawAvailable(calc) ? preset(jaw, "premium") : null}
            tiers={state.tiers[jaw]}
            book={book}
            currency={currency}
            onTiers={(patch, which) => {
              update((s) => setTiers(s, jaw, patch));
              track("tier_toggled", { jaw, which, tier: Object.values(patch)[0] });
            }}
            onPreset={(tier) => {
              update((s) => setTiers(s, jaw, { implant: tier, crown: tier }));
              track("tier_preset_applied", { jaw, tier });
            }}
            onScenario={(scenario) => {
              update((s) => setScenario(s, jaw, scenario));
              track("scenario_selected", { jaw, scenario });
            }}
          />
        );
      })}

      <OverallBlock
        total={quote.overallTotal}
        currency={currency}
        eurRate={eurRate}
        twoJaws={activeJaws.length === 2}
        anyAllOn={activeJaws.some((j) => ["aox4", "aox6", "aox8"].includes(calcs[j]?.scenario ?? ""))}
      />

      {hasData && <SourceBlock meta={meta} book={book} />}

      <AdditionalServices book={book} state={state} currency={currency} />

      <p className="rounded-2xl bg-canvas p-4 text-sm leading-relaxed text-ink-soft" data-testid="disclaimer">
        Остаточну схему лікування та ціну визначають після консультації лікаря та КТ. Розрахунок орієнтовний і не є
        діагнозом чи планом лікування.
      </p>

      <LeadBlock buildLead={buildLead} submit={submitLead} />

      <button
        type="button"
        onClick={onRestart}
        className="min-h-10 text-sm font-bold text-ink-soft underline-offset-4 hover:text-brand hover:underline"
        data-testid="restart"
      >
        Почати розрахунок заново
      </button>
    </div>
  );
}

function CurrencyToggle({ value, disabled, onChange }: { value: Currency; disabled: boolean; onChange: (c: Currency) => void }) {
  return (
    <div role="group" aria-label="Валюта" className="grid grid-cols-2 gap-1 rounded-full border border-line bg-paper p-1" data-testid="currency-toggle">
      {(
        [
          ["UAH", "₴", "Гривня"],
          ["EUR", "€", "Євро"],
        ] as const
      ).map(([id, symbol, name]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          aria-label={name}
          disabled={disabled && id === "EUR"}
          onClick={() => onChange(id)}
          className={`min-h-10 rounded-full text-[15px] font-extrabold transition-colors disabled:opacity-40 ${
            value === id ? "bg-brand text-white" : "text-ink-soft hover:bg-canvas"
          }`}
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}

function OverallBlock({
  total,
  currency,
  eurRate,
  twoJaws,
  anyAllOn,
}: {
  total: ReturnType<typeof quoteFor>["overallTotal"];
  currency: Currency;
  eurRate: { rate: number } | null;
  twoJaws: boolean;
  anyAllOn: boolean;
}) {
  return (
    <section
      aria-labelledby="overall-title"
      data-testid="overall"
      className="rounded-[var(--radius-card)] border-2 border-brand bg-paper p-5"
    >
      <h2 id="overall-title" className="text-[18px] font-extrabold">
        Загальна орієнтовна вартість
      </h2>
      <div className="mt-2">
        <Money range={total} currency={currency} eurRate={eurRate} mainClass="text-[30px] font-extrabold text-brand" testId="overall-main" />
      </div>
      {total && anyAllOn && (
        <p className="mt-1 text-xs text-muted">Для All-on — повний бюджет двох етапів.</p>
      )}
      {!total && <p className="mt-1 text-sm text-ink-soft">{NO_DATA} для цього розрахунку — суму ми не вигадуємо.</p>}
      {twoJaws && (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft" data-testid="two-jaws-note">
          Точну спільну схему уточнить клініка. Загальна сума — проста сума двох щелеп, кожна зі своїм скануванням.
        </p>
      )}
    </section>
  );
}

function SourceBlock({ meta, book }: { meta: ReturnType<typeof quoteFor>["priceMeta"]; book: PriceBook }) {
  const date = meta.calculated_at ? formatDateUk(meta.calculated_at) : null;
  return (
    <section className="rounded-2xl bg-canvas p-4 text-sm leading-relaxed" data-testid="source-note" aria-label="Джерело цін">
      <p>
        <span className="font-bold">Джерело цін: </span>
        <span data-testid="source-sentence">{sourceSentence(meta)}</span>
      </p>
      <p className="mt-1 text-muted">
        <span data-testid="source-city">{book.locationName}</span>
        {date && (
          <>
            {" · ціни станом на "}
            <span data-testid="source-date">{date}</span>
          </>
        )}{" "}
        {meta.is_demo && (
          <span className="inline-flex rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn" data-testid="demo-badge">
            демо-дані
          </span>
        )}
      </p>
      {meta.eur_rate && (
        <p className="mt-1 text-xs text-muted" data-testid="eur-rate">
          Еквівалент у євро — за курсом НБУ {formatRate(meta.eur_rate.rate)} грн за 1&nbsp;€ на {formatDateUk(meta.eur_rate.date)}.
        </p>
      )}
    </section>
  );
}
