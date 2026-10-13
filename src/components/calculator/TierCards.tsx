"use client";

import { PATIENT_TIERS, type PatientTier } from "@/lib/contracts";
import {
  TIER_DESCRIPTION,
  TIER_LABEL,
  formatDateUk,
  formatRate,
  isArchLike,
  usesImplantTier,
  type Calculation,
  type Params,
  type Tiers,
} from "@/engine/v2";
import { Breakdown, SourceNote } from "./ResultParts";
import { NO_DATA, eurText, uahText } from "./money";

interface Props {
  params: Params;
  tiers: Tiers;
  selected: PatientTier;
  current: Calculation;
  presets: Record<PatientTier, Calculation>;
  eurRate: { rate: number; date: string } | null;
  onSelectCard: (tier: PatientTier) => void;
  onTiers: (next: Tiers, which: "implant" | "crown") => void;
}

/** ТЗ §6.1: three preset cards; the selected one opens the independent toggles. */
export function TierCards({ params, tiers, selected, current, presets, eurRate, onSelectCard, onTiers }: Props) {
  const arch = isArchLike(current.kind);
  return (
    <div className="grid gap-3" role="group" aria-label="Рівень розрахунку">
      {PATIENT_TIERS.map((tier) => {
        const calc = tier === selected ? current : presets[tier];
        const isSelected = tier === selected;
        const eur = eurText(calc.main, eurRate);
        return (
          <div
            key={tier}
            data-testid={`card-${tier}`}
            className={`rounded-[var(--radius-card)] border bg-paper transition-colors ${
              isSelected ? "border-brand ring-1 ring-brand" : "border-line"
            }`}
          >
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectCard(tier)}
              className="flex w-full flex-col gap-2 rounded-[var(--radius-card)] p-4 text-left hover:bg-brand-soft/40 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[17px] font-extrabold">
                  <span
                    aria-hidden
                    className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${
                      isSelected ? "border-brand" : "border-line-strong"
                    }`}
                  >
                    {isSelected && <span className="size-2.5 rounded-full bg-brand" />}
                  </span>
                  {TIER_LABEL[tier]}
                </span>
                <span className="mt-1 block text-sm leading-snug text-ink-soft">{TIER_DESCRIPTION[tier]}</span>
              </span>
              <span className="shrink-0 pl-7 sm:pl-0 sm:text-right">
                {arch && (
                  <span className="block text-xs leading-tight font-semibold text-muted sm:ml-auto sm:max-w-[9.5rem]">
                    Перший етап (з тимчасовими зубами)
                  </span>
                )}
                <span
                  data-testid={`price-${tier}`}
                  className={`tabular block font-extrabold ${calc.main ? "text-[19px]" : "text-[14px] text-muted"}`}
                >
                  {uahText(calc.main)}
                </span>
                {eur && (
                  <span data-testid={`eur-${tier}`} className="tabular block text-sm font-semibold text-muted">
                    {eur}
                  </span>
                )}
                {arch && calc.full && (
                  <span className="mt-1 block text-xs text-muted">
                    Загальний бюджет: <span className="tabular font-bold">{uahText(calc.full)}</span>
                  </span>
                )}
              </span>
            </button>

            {isSelected && (
              <div className="border-t border-line px-4 pt-3 pb-4" data-testid="card-body">
                <TierToggles params={params} tiers={tiers} arch={arch} onTiers={onTiers} />

                {current.main === null ? (
                  <p className="mt-4 rounded-xl bg-canvas p-3 text-sm leading-relaxed text-ink-soft" role="status">
                    <span className="font-bold">{NO_DATA}.</span> Для цього міста ще немає всіх потрібних цін, тому
                    ми не називаємо суму навмання. Координатор може підготувати розрахунок вручну.
                  </p>
                ) : (
                  <>
                    {arch && <ArchTotals current={current} eurRate={eurRate} />}
                    {current.rangeNote && (
                      <p
                        className="mt-4 rounded-xl bg-brand-soft p-3 text-sm leading-relaxed text-ink-soft"
                        data-testid="range-note"
                      >
                        {current.rangeNote}
                      </p>
                    )}
                    <Breakdown groups={current.groups} showSources={current.source?.mixed ?? false} />
                    {current.source && <SourceNote source={current.source} />}
                    {eurRate && (
                      <p className="mt-2 text-xs leading-relaxed text-muted" data-testid="eur-rate">
                        Еквівалент у євро — за курсом НБУ {formatRate(eurRate.rate)} грн за 1&nbsp;€ на{" "}
                        {formatDateUk(eurRate.date)}.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ArchTotals({ current, eurRate }: { current: Calculation; eurRate: { rate: number } | null }) {
  const rows = [
    { id: "permanent", label: "Постійна конструкція", range: current.permanent },
    { id: "full", label: "Загальний бюджет лікування", range: current.full },
  ];
  return (
    <dl className="mt-4 space-y-1.5 rounded-xl bg-canvas p-3 text-sm">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
          <dt className={row.id === "full" ? "font-extrabold" : "font-bold text-ink-soft"}>{row.label}</dt>
          <dd className="tabular text-right font-extrabold" data-testid={`arch-${row.id}`}>
            {uahText(row.range)}
            {eurText(row.range, eurRate) && (
              <span className="block text-xs font-semibold text-muted">{eurText(row.range, eurRate)}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TierToggles({
  params,
  tiers,
  arch,
  onTiers,
}: {
  params: Params;
  tiers: Tiers;
  arch: boolean;
  onTiers: Props["onTiers"];
}) {
  return (
    <div className="grid gap-3">
      {usesImplantTier(params) && (
        <ToggleGroup
          label={arch ? "Рівень імплантів" : "Рівень імпланта"}
          value={tiers.implant}
          onChange={(tier) => onTiers({ ...tiers, implant: tier }, "implant")}
        />
      )}
      <ToggleGroup
        label={arch ? "Рівень постійної конструкції" : "Рівень коронки"}
        value={tiers.crown}
        onChange={(tier) => onTiers({ ...tiers, crown: tier }, "crown")}
      />
    </div>
  );
}

function ToggleGroup({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PatientTier;
  onChange: (tier: PatientTier) => void;
}) {
  return (
    <div>
      <p className="text-sm font-extrabold">{label}</p>
      <div role="group" aria-label={label} className="mt-1.5 grid grid-cols-3 gap-1 rounded-full bg-canvas p-1">
        {PATIENT_TIERS.map((tier) => {
          const active = tier === value;
          return (
            <button
              key={tier}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(tier)}
              className={`min-h-10 rounded-full px-1 text-[13px] font-bold transition-colors sm:text-sm ${
                active ? "bg-brand text-white" : "text-ink-soft hover:bg-paper"
              }`}
            >
              {TIER_LABEL[tier]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
