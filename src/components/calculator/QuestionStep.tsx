"use client";

import { useState } from "react";
import type { ToothLocation, ToothStatus } from "@/lib/contracts";
import type { JawAnswers, Question } from "@/engine/v3";
import { pluralUk } from "@/engine/v3/format";
import { Button } from "@/components/ui/Button";
import { DiscreteSlider } from "./DiscreteSlider";
import {
  JAW_NAME,
  LOCATION_LABEL,
  QUESTION_TEXT,
  STATUS_ORDER,
  statusLabel,
} from "./model";
import { OptionList } from "./OptionList";
import { StepHeading } from "./StepHeading";

interface Props {
  question: Question;
  teeth: number;
  answers: JawAnswers;
  /** "Питання 2 з 3". */
  position: { index: number; total: number };
  onLocation: (value: ToothLocation) => void;
  onStatus: (value: ToothStatus) => void;
  onInstalled: (value: number | "unknown") => void;
}

/** ТЗ §5.3–5.4: one question of one jaw; the jaw is always named in the title. */
export function QuestionStep({ question, teeth, answers, position, onLocation, onStatus, onInstalled }: Props) {
  const title = (
    <>
      <span className="mb-1 block text-[15px] font-extrabold tracking-wide text-brand uppercase" data-testid="question-jaw">
        {JAW_NAME[question.jaw]}
      </span>
      {QUESTION_TEXT[question.kind]}
    </>
  );

  return (
    <div>
      <p className="mb-3 text-sm font-bold text-muted" data-testid="question-progress">
        {JAW_NAME[question.jaw]} · {teeth} {pluralUk(teeth, "зуб", "зуби", "зубів")} · питання {position.index + 1} з{" "}
        {position.total}
      </p>
      <StepHeading>{title}</StepHeading>

      {question.kind === "location" && (
        <OptionList
          label={QUESTION_TEXT.location}
          options={(["adjacent", "separate", "unknown"] as const).map((id) => ({ id, label: LOCATION_LABEL[id] }))}
          selected={answers.location}
          onSelect={(id) => onLocation(id as ToothLocation)}
        />
      )}

      {question.kind === "status" && (
        <>
          <OptionList
            label="Стан зубів"
            options={STATUS_ORDER.map((id) => ({ id, label: statusLabel(id, teeth) }))}
            selected={answers.status}
            onSelect={(id) => onStatus(id as ToothStatus)}
          />
        </>
      )}

      {question.kind === "installed" && <InstalledCount teeth={teeth} answers={answers} onInstalled={onInstalled} jawName={JAW_NAME[question.jaw]} />}
    </div>
  );
}

function InstalledCount({
  teeth,
  answers,
  onInstalled,
  jawName,
}: {
  teeth: number;
  answers: JawAnswers;
  onInstalled: (value: number | "unknown") => void;
  jawName: string;
}) {
  const [value, setValue] = useState(typeof answers.installed === "number" ? answers.installed : Math.min(teeth, 2));
  return (
    <div className="mt-6">
      <section className="rounded-2xl border border-line bg-paper p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-ink-soft">Від 1 до {teeth}</p>
          <p className="tabular" data-testid="installed-value">
            <span className="text-[34px] leading-none font-extrabold text-brand">{value}</span>
            <span className="ml-1.5 text-sm font-bold text-ink-soft">{pluralUk(value, "імплант", "імпланти", "імплантів")}</span>
          </p>
        </div>
        <div className="mt-2">
          <DiscreteSlider
            value={value}
            min={1}
            max={teeth}
            onChange={setValue}
            label={`${jawName}: кількість встановлених імплантів`}
            valueText={(n) => `${n} ${pluralUk(n, "імплант", "імпланти", "імплантів")}`}
            testId="slider-installed"
          />
        </div>
      </section>
      <Button className="mt-4 w-full" onClick={() => onInstalled(value)}>
        Продовжити
      </Button>
      <button
        type="button"
        onClick={() => onInstalled("unknown")}
        aria-pressed={answers.installed === "unknown"}
        className="mt-2.5 min-h-12 w-full rounded-2xl border border-line-strong bg-paper px-4 text-[15px] font-bold hover:border-brand hover:text-brand"
      >
        Не знаю
      </button>
    </div>
  );
}
