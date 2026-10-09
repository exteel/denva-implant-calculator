"use client";

import { useEffect, useRef, useState } from "react";
import type { Question } from "@/engine/types";
import { Button } from "@/components/ui/Button";

interface Props {
  question: Question;
  /** Previous answer, so going back shows what was picked. */
  current?: string | string[];
  onAnswer: (value: string | string[]) => void;
}

export function QuestionStep({ question, current, onAnswer }: Props) {
  // The clicked option unmounts on every answer; move focus to the new
  // question so keyboard and screen-reader users aren't dropped to <body>.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-[26px] leading-tight font-extrabold tracking-tight text-balance outline-none sm:text-[30px]"
      >
        {question.title}
      </h1>
      {question.subtitle && (
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{question.subtitle}</p>
      )}
      {question.type === "single" ? (
        <SingleChoice question={question} current={current} onAnswer={onAnswer} />
      ) : (
        <MultiChoice
          key={question.id}
          question={question}
          current={Array.isArray(current) ? current : []}
          onAnswer={onAnswer}
        />
      )}
    </div>
  );
}

function SingleChoice({ question, current, onAnswer }: Props) {
  return (
    <ul className="mt-6 grid gap-2.5" role="list">
      {question.options.map((option) => {
        const selected = current === option.id;
        return (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onAnswer(option.id)}
              aria-pressed={selected}
              className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors hover:border-brand hover:bg-brand-soft ${
                selected ? "border-brand bg-brand-soft" : "border-line bg-paper"
              }`}
            >
              <span>
                <span className="block text-[16px] font-bold">{option.label}</span>
                {option.hint && (
                  <span className="mt-0.5 block text-sm text-muted">{option.hint}</span>
                )}
              </span>
              <span aria-hidden className="shrink-0 text-muted">
                →
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MultiChoice({
  question,
  current,
  onAnswer,
}: Omit<Props, "current"> & { current: string[] }) {
  const [picked, setPicked] = useState<string[]>(current);

  const toggle = (id: string) => {
    const option = question.options.find((o) => o.id === id);
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (option?.exclusive) return [id];
      const exclusiveIds = question.options.filter((o) => o.exclusive).map((o) => o.id);
      return [...prev.filter((v) => !exclusiveIds.includes(v)), id];
    });
  };

  return (
    <>
      <ul className="mt-6 grid gap-2.5" role="list">
        {question.options.map((option) => {
          const checked = picked.includes(option.id);
          return (
            <li key={option.id}>
              <label
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition-colors hover:border-brand ${
                  checked ? "border-brand bg-brand-soft" : "border-line bg-paper"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(option.id)}
                  className="size-5 shrink-0 accent-[var(--color-brand)]"
                />
                <span className="text-[16px] font-bold">{option.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => onAnswer(picked)} disabled={picked.length === 0}>
          Показати результат
        </Button>
        {question.skippable && (
          <Button variant="ghost" onClick={() => onAnswer([])}>
            Пропустити
          </Button>
        )}
      </div>
    </>
  );
}
