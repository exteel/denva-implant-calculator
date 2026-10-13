"use client";

import { useMemo, useState } from "react";
import type { LeadIntent, LocationPricesResponse, PatientTier } from "@/lib/contracts";
import {
  ALL_ON_LABEL,
  calculate,
  calculatePresets,
  createPriceBook,
  deriveParams,
  isArchLike,
  jawsOf,
  listAddons,
  scenarioLabel,
  type AllOn,
  type Answers,
  type Params,
  type Tiers,
} from "@/engine/v2";
import { getDataSource } from "@/lib/data";
import { buildLeadPayload } from "@/services/lead";
import { track } from "@/services/analytics";
import { AddonsBlock } from "./AddonsBlock";
import { LeadBlock } from "./LeadBlock";
import { ParamsPanel } from "./ParamsPanel";
import { StepHeading } from "./StepHeading";
import { TierCards } from "./TierCards";
import { UnavailableState } from "./UnavailableState";
import { eurText, uahText } from "./money";
import type { LoadState, Loadable } from "./useCalculatorData";
import { useEffect } from "react";

export interface ChosenLocation {
  kind: "city" | "region";
  id: string;
  name: string;
}

interface Props {
  location: ChosenLocation;
  answers: Answers;
  prices: LoadState<LocationPricesResponse>;
}

export function ResultView({ location, answers, prices }: Props) {
  const state: Loadable<LocationPricesResponse> = prices.state;
  if (state.status === "loading") {
    return (
      <div role="status" aria-live="polite" className="space-y-3" data-testid="result-loading">
        <p className="text-[17px] font-extrabold">Рахуємо вартість для {location.name}…</p>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-[var(--radius-card)] bg-line/60" />
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return <UnavailableState unavailable={state.unavailable} onRetry={prices.retry} />;
  }
  const initial = deriveParams(answers);
  if (!initial) return null;
  return <ResultBody response={state.data} answers={answers} location={location} initialParams={initial} />;
}

function ResultBody({
  response,
  answers,
  location,
  initialParams,
}: {
  response: LocationPricesResponse;
  answers: Answers;
  location: ChosenLocation;
  initialParams: Params;
}) {
  const book = useMemo(() => createPriceBook(response), [response]);
  const [params, setParams] = useState<Params>(initialParams);
  const [tiers, setTiers] = useState<Tiers>({ implant: "classic", crown: "classic" });
  const [selected, setSelected] = useState<PatientTier>("classic");

  const current = useMemo(() => calculate(book, params, tiers), [book, params, tiers]);
  const presets = useMemo(() => calculatePresets(book, params), [book, params]);
  const addons = useMemo(() => listAddons(book, params), [book, params]);
  const arch = isArchLike(current.kind);

  useEffect(() => {
    track("result_viewed", {
      location_id: location.id,
      scenario: scenarioLabel(initialParams),
      has_data: current.main !== null,
    });
    // Once per result screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildLead = (intent: LeadIntent, phone: string) =>
    buildLeadPayload({
      intent,
      phone,
      location,
      answers,
      params,
      calculation: current,
      implantTier: tiers.implant,
      crownTier: tiers.crown,
      pageUrl: window.location.href,
      search: window.location.search,
    });

  const submit = async (body: Parameters<Awaited<ReturnType<typeof getDataSource>>["submitLead"]>[0]) =>
    (await getDataSource()).submitLead(body);

  const changeParams = (next: Params) => {
    setParams(next);
    track("params_changed", { scenario: scenarioLabel(next) });
  };

  const selectCard = (tier: PatientTier) => {
    setSelected(tier);
    setTiers({ implant: tier, crown: tier });
    track("tier_card_selected", { tier });
  };

  const changeTiers = (next: Tiers, which: "implant" | "crown") => {
    setTiers(next);
    track("tier_toggled", { which, tier: next[which] });
  };

  const changeAllOn = (allOn: AllOn) => {
    setParams((p) => ({ ...p, allOn }));
    track("all_on_selected", { all_on: allOn });
  };

  return (
    <div className="space-y-5">
      <div>
        <StepHeading>
          {current.kind === "reference" ? "Довідкова ціна одного зуба" : "Орієнтовна вартість імплантації"}
        </StepHeading>
        <p className="mt-1.5 text-[15px] text-ink-soft">
          Середня ринкова ціна для: <span className="font-bold text-ink">{response.location.name}</span>
        </p>
      </div>

      {current.kind === "reference" && (
        <Notice>
          Ви не знаєте точно, що потрібно, тому ми показуємо довідкову ціну одного зуба. Уточніть обсяг у
          параметрах нижче — сума одразу перерахується.
        </Notice>
      )}
      {params.approx === "several" && (
        <Notice>
          Ви вказали «кілька» зубів, тому ми взяли 3 зуби без уточнення розташування. Змініть кількість у
          параметрах — сума одразу перерахується.
        </Notice>
      )}

      <ParamsPanel params={params} onChange={changeParams} />

      {arch ? (
        <ArchSection
          params={params}
          onAllOn={changeAllOn}
          segmentNote={current.kind === "seven_plus"}
          segment={current.segment}
          eurRate={book.eurRate}
        >
          <TierCards
            params={params}
            tiers={tiers}
            selected={selected}
            current={current}
            presets={presets}
            eurRate={book.eurRate}
            onSelectCard={selectCard}
            onTiers={changeTiers}
          />
        </ArchSection>
      ) : (
        <TierCards
          params={params}
          tiers={tiers}
          selected={selected}
          current={current}
          presets={presets}
          eurRate={book.eurRate}
          onSelectCard={selectCard}
          onTiers={changeTiers}
        />
      )}

      <AddonsBlock items={addons} teethPresent={params.teethPresent} />

      <p className="rounded-2xl bg-canvas p-4 text-sm leading-relaxed text-ink-soft" data-testid="disclaimer">
        Остаточну схему лікування та ціну визначають після консультації лікаря та КТ. Розрахунок орієнтовний і не
        є діагнозом чи планом лікування.
      </p>

      <LeadBlock buildLead={buildLead} submit={submit} />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-brand-line bg-brand-soft p-4 text-sm leading-relaxed text-ink-soft">
      {children}
    </p>
  );
}

const ALL_ON: AllOn[] = [4, 6, 8];

/** ТЗ §6.2: All-on-4 / 6 / 8 tabs; none is presented as medically recommended. */
function ArchSection({
  params,
  onAllOn,
  segmentNote,
  segment,
  eurRate,
  children,
}: {
  params: Params;
  onAllOn: (n: AllOn) => void;
  segmentNote: boolean;
  segment: ReturnType<typeof calculate>["segment"];
  eurRate: { rate: number } | null;
  children: React.ReactNode;
}) {
  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = ALL_ON.indexOf(params.allOn);
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = ALL_ON[(index + delta + ALL_ON.length) % ALL_ON.length];
    onAllOn(next);
    document.getElementById(`allon-tab-${next}`)?.focus();
  };

  return (
    <section aria-label="Варіанти All-on" className="space-y-3">
      {segmentNote && (
        <Notice>
          <span data-testid="segment-note">
            Для 7 і більше зубів лікар може запропонувати як All-on, так і сегментний міст на кількох імплантах —
            схему визначає лікар після огляду та КТ. Нижче — орієнтири для варіантів All-on.
          </span>
        </Notice>
      )}
      {segment && (
        <div className="rounded-2xl border border-line bg-paper p-4 text-sm">
          <p className="font-extrabold">{segment.label}</p>
          <p className="tabular mt-1 font-bold">
            {uahText(segment.main)} {eurText(segment.main, eurRate)}
          </p>
        </div>
      )}
      <div
        role="tablist"
        aria-label="Кількість імплантів на щелепі"
        className="grid grid-cols-3 gap-1 rounded-full bg-line/60 p-1"
        onKeyDown={onKeyDown}
      >
        {ALL_ON.map((n) => {
          const active = params.allOn === n;
          return (
            <button
              key={n}
              id={`allon-tab-${n}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="allon-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => onAllOn(n)}
              className={`min-h-11 rounded-full text-[15px] font-extrabold transition-colors ${
                active ? "bg-paper text-brand shadow-sm" : "text-ink-soft hover:text-brand"
              }`}
            >
              {ALL_ON_LABEL(n)}
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {jawsOf(params) === 2
          ? "Для двох щелеп імпланти, мультиюніти та постійні конструкції рахуються вдвічі; сканування — один раз на етап. "
          : ""}
        Кількість імплантів остаточно визначає лікар після огляду та КТ: жоден із варіантів не є медичною
        рекомендацією, це орієнтири для порівняння.
      </p>
      <div id="allon-panel" role="tabpanel" aria-labelledby={`allon-tab-${params.allOn}`}>
        {children}
      </div>
    </section>
  );
}
