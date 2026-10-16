"use client";

import { useId, useState } from "react";
import type { Jaw, ToothLocation, ToothStatus } from "@/lib/contracts";
import { UNKNOWN_SCOPES, mapUnknownScope, type UnknownScope } from "@/engine/v3";
import { pluralUk, teethText } from "@/engine/v3/format";
import { DiscreteSlider } from "./DiscreteSlider";
import { JAWS, JAW_NAME, LOCATION_LABEL, STATUS_ORDER, UNKNOWN_LABEL, jawSummary, statusLabel, type CalcState, type QuoteInputs } from "./model";

interface Props {
  state: CalcState;
  inputs: QuoteInputs;
  onCount: (jaw: Jaw, count: number) => void;
  onLocation: (jaw: Jaw, value: ToothLocation) => void;
  onStatus: (jaw: Jaw, value: ToothStatus) => void;
  onInstalled: (jaw: Jaw, value: number | "unknown") => void;
  onUnknownChoice: (choice: UnknownScope) => void;
  onLeaveUnknown: () => void;
}

/** ТЗ §6: every answer can be changed on the result — one jaw at a time, nothing is re-asked. */
export function ParamsPanel({ state, inputs, onCount, onLocation, onStatus, onInstalled, onUnknownChoice, onLeaveUnknown }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const summary = [inputs.upper && `Верхня: ${jawSummary(inputs.upper, null)}`, inputs.lower && `Нижня: ${jawSummary(inputs.lower, null)}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-label="Параметри розрахунку" className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 text-[15px] font-extrabold" data-testid="scenario-label">
          {summary || "Параметри"}
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
          {state.unknown.active ? (
            <div>
              <p className="text-sm font-extrabold">Що найближче до вашої ситуації?</p>
              <Chips
                title="Масштаб ситуації"
                label="Масштаб ситуації"
                options={UNKNOWN_SCOPES.map((id) => ({ id, label: UNKNOWN_LABEL[id] }))}
                value={state.unknown.choice ?? undefined}
                onChange={(id) => onUnknownChoice(id as UnknownScope)}
              />
              <p className="mt-2 text-xs text-muted">
                Припущення: верхня щелепа, {teethText(mapUnknownScope(state.unknown.choice ?? "none").tooth_count)}.
              </p>
              <button
                type="button"
                onClick={onLeaveUnknown}
                className="mt-3 min-h-10 rounded-full border border-line-strong px-4 text-sm font-bold hover:border-brand hover:text-brand"
              >
                Вказати кількість зубів точно
              </button>
            </div>
          ) : (
            JAWS.map((jaw) => (
              <JawParams
                key={jaw}
                jaw={jaw}
                state={state}
                onCount={onCount}
                onLocation={onLocation}
                onStatus={onStatus}
                onInstalled={onInstalled}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function JawParams({
  jaw,
  state,
  onCount,
  onLocation,
  onStatus,
  onInstalled,
}: {
  jaw: Jaw;
  state: CalcState;
  onCount: Props["onCount"];
  onLocation: Props["onLocation"];
  onStatus: Props["onStatus"];
  onInstalled: Props["onInstalled"];
}) {
  const count = state.counts[jaw];
  const answers = state.answers[jaw];
  const name = JAW_NAME[jaw];
  return (
    <fieldset className="min-w-0" data-testid={`params-${jaw}`}>
      <legend className="text-[15px] font-extrabold">{name}</legend>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="text-sm text-ink-soft">Кількість зубів</p>
        <p className="tabular text-[22px] font-extrabold text-brand" data-testid={`params-count-${jaw}`}>
          {count}
        </p>
      </div>
      <DiscreteSlider
        value={count}
        min={0}
        max={14}
        onChange={(n) => onCount(jaw, n)}
        label={`${name}: кількість зубів`}
        valueText={(n) => `${n} ${pluralUk(n, "зуб", "зуби", "зубів")}`}
        testId={`params-slider-${jaw}`}
      />
      {count >= 2 && count <= 6 && (
        <Chips
          title="Розташування"
          label={`${name}: розташування`}
          options={(["adjacent", "separate", "unknown"] as const).map((id) => ({ id, label: LOCATION_LABEL[id] }))}
          value={answers.location ?? undefined}
          onChange={(id) => onLocation(jaw, id as ToothLocation)}
        />
      )}
      {count > 0 && (
        <Chips
          title="Стан зубів"
          label={`${name}: стан зубів`}
          options={STATUS_ORDER.map((id) => ({ id, label: statusLabel(id, count) }))}
          value={answers.status ?? undefined}
          onChange={(id) => onStatus(jaw, id as ToothStatus)}
        />
      )}
      {count > 0 && answers.status === "implants_installed" && (
        <div className="mt-3">
          <p className="text-sm font-bold">Скільки імплантів уже встановлено?</p>
          <div className="mt-1">
            <DiscreteSlider
              value={typeof answers.installed === "number" ? answers.installed : Math.min(count, 2)}
              min={1}
              max={count}
              onChange={(n) => onInstalled(jaw, n)}
              label={`${name}: кількість встановлених імплантів`}
              testId={`params-installed-${jaw}`}
            />
          </div>
          <button
            type="button"
            aria-pressed={answers.installed === "unknown"}
            onClick={() => onInstalled(jaw, "unknown")}
            className={`mt-1 min-h-10 rounded-full border px-4 text-sm font-bold ${
              answers.installed === "unknown" ? "border-brand bg-brand text-white" : "border-line-strong bg-paper text-ink-soft hover:border-brand"
            }`}
          >
            Не знаю
          </button>
        </div>
      )}
    </fieldset>
  );
}

function Chips({
  title,
  label,
  options,
  value,
  onChange,
}: {
  title: string;
  label: string;
  options: { id: string; label: string }[];
  value?: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-sm font-bold">{title}</p>
      <div role="group" aria-label={label} className="mt-1.5 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`min-h-10 rounded-full border px-4 text-sm font-bold transition-colors ${
                active ? "border-brand bg-brand text-white" : "border-line-strong bg-paper text-ink-soft hover:border-brand"
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
