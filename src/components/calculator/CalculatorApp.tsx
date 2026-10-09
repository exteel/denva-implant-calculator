"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  QUESTIONS,
  answerQuestion,
  canGoBack,
  currentStep,
  goBack,
  progressEstimate,
  qualificationFromAnswers,
  startFlow,
  type FlowState,
} from "@/engine/questions";
import { resolve } from "@/engine/resolver";
import { findCity, locationLabel } from "@/engine/geo";
import type { Answers } from "@/engine/types";
import { track } from "@/services/analytics";
import { Logo } from "@/components/ui/Logo";
import { CityStep } from "./CityStep";
import { QuestionStep } from "./QuestionStep";
import { ResultView } from "./ResultView";

const QUALIFICATION_ID = "qualification";

export function CalculatorApp() {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowState>(() => startFlow());
  const [utmSearch, setUtmSearch] = useState("");
  // Last answer per question, so "Назад" shows what was picked before even
  // though the flow itself drops the answer of the question it returns to.
  const [remembered, setRemembered] = useState<Answers>({});

  const step = locationId ? currentStep(flow) : null;
  const isResult = step?.type === "result";
  const resolution = useMemo(() => (isResult ? resolve(flow.answers) : null), [isResult, flow.answers]);

  // ТЗ §19 scenario_resolved: the clinical branch is complete once the flow
  // reaches Q00 (or the result directly).
  const resolvedLogged = useRef<string | null>(null);
  useEffect(() => {
    const reachedQualification =
      step?.type === "question" && step.questionId === QUALIFICATION_ID;
    if (!reachedQualification && !isResult) return;
    const clinical = { ...flow.answers };
    delete clinical[QUALIFICATION_ID];
    const key = JSON.stringify(clinical);
    if (resolvedLogged.current === key) return;
    resolvedLogged.current = key;
    const r = resolve(clinical);
    track("scenario_resolved", {
      kind: r.kind,
      basket_codes: r.scenarios.flatMap((s) => s.parts.map((p) => p.basket)),
      scenario_ids: r.scenarios.map((s) => s.id),
      clinical_confidence: r.clinicalConfidence,
    });
  }, [step, isResult, flow.answers]);

  useEffect(() => {
    setUtmSearch(window.location.search);
  }, []);

  const stepKey = step ? (step.type === "question" ? step.questionId : "result") : "city";
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [locationId, stepKey]);

  const handleCity = (id: string) => {
    setLocationId(id);
    track("city_selected", {
      location_id: id,
      level: findCity(id) ? "city" : "oblast",
      label: locationLabel(id),
    });
  };

  const handleAnswer = (questionId: string, value: string | string[]) => {
    setFlow((prev) => answerQuestion(prev, questionId, value));
    setRemembered((prev) => ({ ...prev, [questionId]: value }));
    if (questionId === "teeth") track("scenario_selected", { teeth: value });
    if (questionId === QUALIFICATION_ID) {
      const q = qualificationFromAnswers({ [QUALIFICATION_ID]: value });
      track("qualification_completed", {
        has_ct: q.hasCt,
        has_plan: q.hasPlan,
        has_quote: q.hasQuote,
        skipped: Array.isArray(value) && value.length === 0,
      });
    }
  };

  const handleBack = () => {
    if (canGoBack(flow)) setFlow((prev) => goBack(prev));
    else setLocationId(null);
  };

  const progress = !locationId ? 0.04 : isResult ? 1 : Math.max(0.1, progressEstimate(flow) * 0.9);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          {locationId && (
            <button
              type="button"
              onClick={() => setLocationId(null)}
              className="truncate rounded-full border border-line px-3 py-1.5 text-sm font-bold text-ink-soft hover:border-brand hover:text-brand"
              aria-label={`Змінити місто: ${locationLabel(locationId)}`}
            >
              📍 {locationLabel(locationId)}
            </button>
          )}
        </div>
        <div className="h-1 bg-canvas" aria-hidden>
          <div
            className="h-1 bg-brand transition-[width] duration-500"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-5 pb-28 sm:px-6 sm:pt-8">
        {locationId && (
          <button
            type="button"
            onClick={handleBack}
            className="mb-5 inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 text-[15px] font-bold text-ink-soft hover:text-brand"
          >
            <span aria-hidden>←</span> Назад
          </button>
        )}

        {!locationId && <CityStep onSelect={handleCity} />}

        {step?.type === "question" && (
          <QuestionStep
            key={step.questionId}
            question={QUESTIONS[step.questionId]}
            current={flow.answers[step.questionId] ?? remembered[step.questionId]}
            onAnswer={(value) => handleAnswer(step.questionId, value)}
          />
        )}

        {isResult && resolution && locationId && (
          <ResultView
            key={JSON.stringify(flow.answers) + locationId}
            resolution={resolution}
            answers={flow.answers}
            locationId={locationId}
            qualification={qualificationFromAnswers(flow.answers)}
            utmSearch={utmSearch}
          />
        )}
      </main>
    </div>
  );
}
