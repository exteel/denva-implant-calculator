"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Jaw, PublicLocation, ToothLocation, ToothStatus } from "@/lib/contracts";
import { track } from "@/services/analytics";
import { Logo } from "@/components/ui/Logo";
import { CityStep } from "./CityStep";
import { CountsStep } from "./CountsStep";
import {
  canContinueFromCounts,
  initialState,
  questionList,
  setAnswer,
  setCount,
  setUnknownChoice,
  setUnknownMode,
  type CalcState,
} from "./model";
import { QuestionStep } from "./QuestionStep";
import { HeadingLevelContext } from "./StepHeading";
import { ResultView } from "./ResultView";
import { clearSession, loadSession, saveSession, type ChosenLocation, type StepName } from "./storage";
import { useLocations, usePrices } from "./useCalculatorData";

const PROGRESS: Record<StepName, number> = { city: 0.08, counts: 0.3, question: 0.6, result: 1 };

interface Props {
  /**
   * SEO city pages (ТЗ §5.1): the city comes from the URL, the city step is
   * skipped and the header offers «змінити».
   */
  initialLocation?: PublicLocation | null;
  /**
   * The host page owns the site chrome and <main> (SEO city pages): no logo /
   * site header and no `min-h-dvh`, a <section> instead of <main>. The city
   * bar and the progress line are kept inside the calculator.
   */
  embedded?: boolean;
}

const toChosen = (l: PublicLocation): ChosenLocation => ({ kind: l.kind, id: l.id, name: l.name });

/** The patient flow: city → two sliders → per-jaw questions → result (ТЗ §5–6). */
export function CalculatorApp({ initialLocation = null, embedded = false }: Props) {
  const fixed = initialLocation ? toChosen(initialLocation) : null;
  const [location, setLocation] = useState<ChosenLocation | null>(fixed);
  const [step, setStep] = useState<StepName>(fixed ? "counts" : "city");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [state, setState] = useState<CalcState>(initialState);
  // Where the city picker returns to when it was opened from the header.
  const [cityReturn, setCityReturn] = useState<StepName | null>(null);
  const hydrated = useRef(false);
  // Scroll only after the patient navigated — never on landing / restore.
  const interacted = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const locations = useLocations();
  const prices = usePrices(location);

  // Restore the previous session (localStorage only — never the URL, ТЗ §11.1).
  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setState(saved.state);
      if (!fixed && saved.location) {
        setLocation(saved.location);
        setStep(saved.step);
        setQuestionIndex(saved.questionIndex);
      } else if (fixed && saved.step !== "city") {
        setStep(saved.step);
        setQuestionIndex(saved.questionIndex);
      }
    }
    hydrated.current = true;
    track("calculator_started");
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveSession({ v: 3, location, state, step, questionIndex });
  }, [location, state, step, questionIndex]);

  useEffect(() => {
    if (!interacted.current) return;
    if (embedded) {
      // Keep the host page where it is unless the calculator's top is off-screen.
      const top = rootRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) rootRef.current?.scrollIntoView({ block: "start" });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [step, questionIndex, embedded]);

  /** Every step change made by the patient (marks the session as interacted). */
  const go = (next: StepName) => {
    interacted.current = true;
    setStep(next);
  };
  const goQuestion = (index: number) => {
    interacted.current = true;
    setQuestionIndex(index);
  };

  const update = useCallback((fn: (s: CalcState) => CalcState) => setState(fn), []);
  const questions = useMemo(() => questionList(state), [state]);

  const handleCity = (picked: PublicLocation) => {
    setLocation(toChosen(picked));
    track("city_selected", { location_id: picked.id, kind: picked.kind });
    // Auto-advance (ТЗ §5.1); from the header → back where we were.
    const target = cityReturn && cityReturn !== "city" ? cityReturn : "counts";
    go(target);
    setCityReturn(null);
  };

  const handleContinueCounts = () => {
    if (!canContinueFromCounts(state)) return;
    track("counts_continue", { upper: state.counts.upper, lower: state.counts.lower, unknown: state.unknown.active });
    if (questionList(state).length === 0) {
      go("result");
    } else {
      goQuestion(0);
      go("question");
    }
  };

  const advanceQuestion = (nextState: CalcState, index: number) => {
    const list = questionList(nextState);
    if (index + 1 < list.length) goQuestion(index + 1);
    else go("result");
  };

  const answer = (patch: Parameters<typeof setAnswer>[2], jaw: Jaw, index: number, event: string) => {
    const next = setAnswer(state, jaw, patch);
    setState(next);
    track("question_answered", { jaw, question: event });
    advanceQuestion(next, index);
  };

  const handleBack = () => {
    if (step === "city") {
      if (cityReturn) go(cityReturn);
      setCityReturn(null);
    } else if (step === "result") {
      if (questions.length > 0) {
        goQuestion(questions.length - 1);
        go("question");
      } else {
        go("counts");
      }
    } else if (step === "question") {
      if (questionIndex > 0) goQuestion(questionIndex - 1);
      else go("counts");
    } else if (step === "counts") {
      if (!fixed) go("city");
    }
  };

  const openCityPicker = () => {
    setCityReturn(step);
    go("city");
  };

  const restart = () => {
    clearSession();
    setState(initialState());
    goQuestion(0);
    go(fixed || location ? "counts" : "city");
  };

  const showBack = step === "city" ? cityReturn !== null : step === "counts" ? !fixed : true;
  const current = questions[Math.min(questionIndex, Math.max(questions.length - 1, 0))];

  const Root = embedded ? "section" : "main";
  const city = location && step !== "city" && (
    <button
      type="button"
      onClick={openCityPicker}
      className="flex min-w-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-bold text-ink-soft hover:border-brand hover:text-brand"
      aria-label={`Змінити місто: ${location.name}`}
      data-testid="city-chip"
    >
      <span className="truncate" data-testid="city-chip-name">
        {location.name}
      </span>
      <span className="shrink-0 text-xs font-semibold text-brand">змінити</span>
    </button>
  );
  const progress = (
    <div className="h-1 bg-canvas" aria-hidden>
      <div className="h-1 bg-brand transition-[width] duration-500" style={{ width: `${Math.round(PROGRESS[step] * 100)}%` }} />
    </div>
  );

  return (
    <HeadingLevelContext.Provider value={embedded ? "h2" : "h1"}>
    <div ref={rootRef} className={embedded ? "" : "min-h-dvh"} data-testid="calculator-root">
      {embedded ? (
        <div className="mx-auto max-w-3xl px-4 pt-2 sm:px-6">
          {city && <div className="flex justify-end pb-3">{city}</div>}
          {progress}
        </div>
      ) : (
        <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
            <Logo />
            {city}
          </div>
          {progress}
        </header>
      )}

      <Root className={`mx-auto max-w-3xl px-4 pb-24 sm:px-6 ${embedded ? "pt-5" : "pt-5 sm:pt-8"}`}>
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            className="mb-5 inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 text-[15px] font-bold text-ink-soft hover:text-brand"
          >
            <span aria-hidden>←</span> Назад
          </button>
        )}

        {step === "city" && (
          <CityStep locations={locations.state} onRetry={locations.retry} onSelect={handleCity} changing={cityReturn !== null} />
        )}

        {step === "counts" && (
          <CountsStep
            state={state}
            onCount={(jaw, n) => update((s) => setCount(s, jaw, n))}
            onUnknownMode={(active) => update((s) => setUnknownMode(s, active))}
            onUnknownChoice={(choice) => {
              update((s) => setUnknownChoice(s, choice));
              track("unknown_scope_selected", { choice });
            }}
            onContinue={handleContinueCounts}
          />
        )}

        {step === "question" && current && (
          <QuestionStep
            key={`${current.jaw}-${current.kind}`}
            question={current}
            teeth={state.counts[current.jaw]}
            answers={state.answers[current.jaw]}
            position={{ index: Math.min(questionIndex, questions.length - 1), total: questions.length }}
            onLocation={(value: ToothLocation) => answer({ location: value }, current.jaw, questionIndex, "location")}
            onStatus={(value: ToothStatus) => answer({ status: value }, current.jaw, questionIndex, "status")}
            onInstalled={(value) => answer({ installed: value }, current.jaw, questionIndex, "installed")}
          />
        )}

        {step === "question" && !current && <ToResult onGo={() => go("result")} />}

        {step === "result" && location && (
          <ResultView location={location} prices={prices} state={state} update={update} onRestart={restart} />
        )}
      </Root>
    </div>
    </HeadingLevelContext.Provider>
  );
}

/** Safety net: a stored question index that no longer exists. */
function ToResult({ onGo }: { onGo: () => void }) {
  useEffect(onGo, [onGo]);
  return null;
}
