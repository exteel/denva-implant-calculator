"use client";

import { SCOPE_OPTIONS, SCOPE_QUESTION, type Answers, type Scope } from "@/engine/v2";
import { Button } from "@/components/ui/Button";
import { StepHeading } from "./StepHeading";
import { TeethSlider } from "./TeethSlider";

interface Props {
  answers: Answers;
  onScope: (scope: Scope) => void;
  onCount: (count: number) => void;
  onContinue: () => void;
}

/**
 * ТЗ §5.2. The three "all teeth"/"don't know" options move on right away;
 * "Окремі зуби" expands the 1–7+ slider in place and waits for "Продовжити"
 * (§10: no automatic transition).
 */
export function ScopeStep({ answers, onScope, onCount, onContinue }: Props) {
  const expanded = answers.scope === "individual";

  return (
    <div>
      <StepHeading>{SCOPE_QUESTION.title}</StepHeading>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{SCOPE_QUESTION.hint}</p>

      <ul className="mt-6 grid gap-2.5" aria-label="Обсяг імплантації">
        {SCOPE_OPTIONS.map((option) => {
          const selected = answers.scope === option.id;
          const individual = option.id === "individual";
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onScope(option.id)}
                aria-pressed={selected}
                aria-expanded={individual ? expanded : undefined}
                className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left text-[16px] font-bold transition-colors hover:border-brand hover:bg-brand-soft ${
                  selected ? "border-brand bg-brand-soft" : "border-line bg-paper"
                }`}
              >
                {option.label}
                <span aria-hidden className="shrink-0 text-muted">
                  {individual ? (expanded ? "−" : "+") : "→"}
                </span>
              </button>
              {individual && (
                <div
                  data-testid="slider-region"
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    expanded ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0"
                  }`}
                  inert={!expanded}
                >
                  <div className="overflow-hidden">
                    <div className="mt-2.5 rounded-2xl border border-brand-line bg-paper p-4">
                      <p className="text-center text-[15px] font-bold">Скільки зубів потрібно замінити?</p>
                      <div className="mt-3">
                        <TeethSlider value={answers.count ?? 1} onChange={onCount} />
                      </div>
                      <Button className="mt-4 w-full" onClick={onContinue}>
                        Продовжити
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
