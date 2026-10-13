"use client";

import { useId, useState } from "react";
import {
  FOLLOW_UPS,
  scenarioLabel,
  setScope,
  setTeeth,
  setToothState,
  type Arrangement,
  type Params,
  type ToothState,
} from "@/engine/v2";
import { TeethSlider } from "./TeethSlider";

interface Props {
  params: Params;
  onChange: (next: Params) => void;
}

const SCOPES = [
  { id: "individual", label: "Окремі зуби" },
  { id: "one_jaw", label: "Одна щелепа" },
  { id: "both_jaws", label: "Обидві щелепи" },
] as const;

const JAW_CHOICES = [
  { id: "1", label: "Одна щелепа" },
  { id: "2", label: "Обидві щелепи" },
];

/** ТЗ §6: change the scenario right on the result page, no need to redo the flow. */
export function ParamsPanel({ params, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section aria-label="Параметри розрахунку" className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-[15px] font-extrabold" data-testid="scenario-label">
          {scenarioLabel(params)}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="min-h-10 rounded-full border border-line-strong px-4 text-sm font-bold text-ink hover:border-brand hover:text-brand"
        >
          {open ? "Сховати параметри" : "Змінити параметри"}
        </button>
      </div>

      {open && (
        <div id={panelId} className="mt-4 space-y-5 border-t border-line pt-4" data-testid="params-panel">
          <Chips
            label="Що потрібно замінити"
            options={SCOPES.map((s) => ({ id: s.id, label: s.label }))}
            value={params.scope === "reference" ? undefined : params.scope}
            onChange={(id) => onChange(setScope(params, id as (typeof SCOPES)[number]["id"]))}
          />

          {params.scope === "individual" && (
            <>
              <div>
                <p className="mb-1 text-sm font-extrabold">Кількість зубів</p>
                <TeethSlider value={params.teeth} onChange={(n) => onChange(setTeeth(params, n))} />
              </div>
              {params.teeth === 1 && (
                <Chips
                  label={FOLLOW_UPS.tooth_state.title}
                  options={FOLLOW_UPS.tooth_state.options}
                  value={params.toothState}
                  onChange={(id) => onChange(setToothState(params, id as ToothState))}
                />
              )}
              {params.teeth > 1 && params.teeth < 7 && (
                <Chips
                  label={FOLLOW_UPS.arrangement.title}
                  options={FOLLOW_UPS.arrangement.options}
                  value={params.arrangement}
                  onChange={(id) => onChange({ ...params, arrangement: id as Arrangement })}
                />
              )}
              {params.teeth >= 7 && (
                <Chips
                  label="Щелепи"
                  options={JAW_CHOICES}
                  value={String(params.jaws)}
                  onChange={(id) => onChange({ ...params, jaws: id === "2" ? 2 : 1 })}
                />
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value?: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-extrabold">{label}</p>
      <div role="group" aria-label={label} className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`min-h-10 rounded-full border px-4 text-sm font-bold transition-colors ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-line-strong bg-paper text-ink-soft hover:border-brand"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
