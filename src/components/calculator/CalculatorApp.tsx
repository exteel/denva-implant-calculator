"use client";

import { useEffect, useState } from "react";
import type { PublicLocation } from "@/lib/contracts";
import {
  chooseCount,
  chooseFollowUp,
  chooseScope,
  followUpFor,
  isComplete,
  type Answers,
  type Scope,
} from "@/engine/v2";
import { track } from "@/services/analytics";
import { Logo } from "@/components/ui/Logo";
import { CityStep } from "./CityStep";
import { FollowUpStep } from "./FollowUpStep";
import { ResultView, type ChosenLocation } from "./ResultView";
import { ScopeStep } from "./ScopeStep";
import { useLocations, usePrices } from "./useCalculatorData";

type Step = "city" | "scope" | "followup" | "result";

const PROGRESS: Record<Step, number> = { city: 0.1, scope: 0.35, followup: 0.65, result: 1 };

/** The patient flow: city → scope → one follow-up → result (ТЗ §5–6). */
export function CalculatorApp() {
  const [step, setStep] = useState<Step>("city");
  // Where the city picker returns to when it was opened from the header chip.
  const [cityReturn, setCityReturn] = useState<Step | null>(null);
  const [location, setLocation] = useState<ChosenLocation | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const locations = useLocations();
  const prices = usePrices(location);

  useEffect(() => {
    track("calculator_started");
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const handleCity = (picked: PublicLocation) => {
    setLocation({ kind: picked.kind, id: picked.id, name: picked.name });
    track("city_selected", { location_id: picked.id, kind: picked.kind });
    const target = cityReturn && cityReturn !== "city" ? cityReturn : "scope";
    // Answers survive a city change; only land on a screen that still fits them.
    setStep(target === "result" && !isComplete(answers) ? "scope" : target);
    setCityReturn(null);
  };

  const handleScope = (scope: Scope) => {
    setAnswers((prev) => chooseScope(prev, scope));
    track("scope_selected", { scope });
    if (scope !== "individual") setStep("followup");
  };

  const handleCount = (count: number) => {
    setAnswers((prev) => chooseCount(prev, count));
  };

  const handleContinue = () => {
    track("teeth_count_selected", { count: answers.count ?? 1 });
    setStep("followup");
  };

  const handleFollowUp = (value: string) => {
    setAnswers((prev) => chooseFollowUp(prev, value));
    track("followup_answered", { id: followUpFor(answers), value });
    setStep("result");
  };

  const handleBack = () => {
    if (step === "city") {
      if (cityReturn) setStep(cityReturn);
      setCityReturn(null);
    } else if (step === "result") setStep("followup");
    else if (step === "followup") setStep("scope");
    else setStep("city");
  };

  const openCityPicker = () => {
    setCityReturn(step);
    setStep("city");
  };

  const showBack = step !== "city" || cityReturn !== null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          {location && step !== "city" && (
            <button
              type="button"
              onClick={openCityPicker}
              className="min-w-0 truncate rounded-full border border-line px-3 py-1.5 text-sm font-bold text-ink-soft hover:border-brand hover:text-brand"
              aria-label={`Змінити місто: ${location.name}`}
              data-testid="city-chip"
            >
              {location.name}
            </button>
          )}
        </div>
        <div className="h-1 bg-canvas" aria-hidden>
          <div
            className="h-1 bg-brand transition-[width] duration-500"
            style={{ width: `${Math.round(PROGRESS[step] * 100)}%` }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-5 pb-24 sm:px-6 sm:pt-8">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            className="mb-5 inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 text-[15px] font-bold text-ink-soft hover:text-brand"
          >
            <span aria-hidden>←</span> Назад
          </button>
        )}

        {step === "city" && <CityStep locations={locations.state} onRetry={locations.retry} onSelect={handleCity} />}

        {step === "scope" && (
          <ScopeStep answers={answers} onScope={handleScope} onCount={handleCount} onContinue={handleContinue} />
        )}

        {step === "followup" && <FollowUpStep answers={answers} onAnswer={handleFollowUp} />}

        {step === "result" && location && (
          <ResultView
            key={`${location.kind}:${location.id}:${JSON.stringify(answers)}`}
            location={location}
            answers={answers}
            prices={prices}
          />
        )}
      </main>
    </div>
  );
}
