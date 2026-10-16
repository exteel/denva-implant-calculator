"use client";

import type { Jaw } from "@/lib/contracts";
import { UNKNOWN_SCOPES, type UnknownScope } from "@/engine/v3";
import { pluralUk } from "@/engine/v3/format";
import { Button } from "@/components/ui/Button";
import { DiscreteSlider } from "./DiscreteSlider";
import { JAWS, JAW_NAME, UNKNOWN_LABEL, canContinueFromCounts, type CalcState } from "./model";
import { OptionList } from "./OptionList";
import { StepHeading } from "./StepHeading";

interface Props {
  state: CalcState;
  onCount: (jaw: Jaw, count: number) => void;
  onUnknownMode: (active: boolean) => void;
  onUnknownChoice: (choice: UnknownScope) => void;
  onContinue: () => void;
}

const teethSpoken = (n: number) => `${n} ${pluralUk(n, "зуб", "зуби", "зубів")}`;

/**
 * ТЗ §5.2: one screen, two always-visible 0–14 sliders (upper / lower jaw)
 * with −/+ buttons. «Не знаю точно» replaces both with one clarification.
 */
export function CountsStep({ state, onCount, onUnknownMode, onUnknownChoice, onContinue }: Props) {
  const unknown = state.unknown.active;
  const ready = canContinueFromCounts(state);

  return (
    <div>
      <StepHeading>Скільки зубів потрібно замінити імплантами?</StepHeading>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        Враховуйте лише відсутні зуби або ті, які потрібно видалити. Не враховуйте власні зуби, на які плануються
        коронки.
      </p>

      {unknown ? (
        <div data-testid="unknown-panel">
          <p className="mt-6 text-[15px] font-bold">Що найближче до вашої ситуації?</p>
          <OptionList
            label="Масштаб ситуації"
            options={UNKNOWN_SCOPES.map((id) => ({ id, label: UNKNOWN_LABEL[id] }))}
            selected={state.unknown.choice}
            onSelect={(id) => onUnknownChoice(id as UnknownScope)}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4" data-testid="count-sliders">
          {JAWS.map((jaw) => (
            <section key={jaw} aria-label={JAW_NAME[jaw]} className="rounded-2xl border border-line bg-paper p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[17px] font-extrabold">{JAW_NAME[jaw]}</h2>
                <p className="tabular text-right" data-testid={`count-${jaw}`}>
                  <span className="text-[34px] leading-none font-extrabold text-brand">{state.counts[jaw]}</span>
                  <span className="ml-1.5 text-sm font-bold text-ink-soft">
                    {pluralUk(state.counts[jaw], "зуб", "зуби", "зубів")}
                  </span>
                </p>
              </div>
              <div className="mt-2">
                <DiscreteSlider
                  value={state.counts[jaw]}
                  min={0}
                  max={14}
                  onChange={(n) => onCount(jaw, n)}
                  label={`${JAW_NAME[jaw]}: кількість зубів`}
                  valueText={teethSpoken}
                  testId={`slider-${jaw}`}
                />
              </div>
              {/* always rendered: toggling it would shift the layout */}
              <p className={`mt-1 h-4 text-xs text-muted ${state.counts[jaw] === 0 ? "" : "invisible"}`}>
                0 — ця щелепа не потребує імплантації
              </p>
            </section>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onUnknownMode(!unknown)}
        aria-pressed={unknown}
        className="mt-4 min-h-12 w-full rounded-2xl border border-line-strong bg-paper px-4 text-[15px] font-bold text-ink hover:border-brand hover:text-brand"
      >
        {unknown ? "← Повернутися до бігунків" : "Не знаю точно"}
      </button>

      {/* always rendered (hidden when ready): the Continue button must not jump */}
      <p
        className={`mt-3 min-h-11 text-sm text-muted ${ready ? "invisible" : ""}`}
        role="status"
        data-testid="counts-hint"
      >
        {unknown
          ? "Оберіть один із варіантів, щоб продовжити."
          : "Оберіть кількість зубів хоча б для однієї щелепи — або натисніть «Не знаю точно»."}
      </p>

      <Button className="mt-4 w-full" disabled={!ready} onClick={onContinue}>
        Продовжити
      </Button>
    </div>
  );
}
