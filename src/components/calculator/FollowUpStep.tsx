"use client";

import { FOLLOW_UPS, followUpFor, type Answers } from "@/engine/v2";
import { OptionList } from "./OptionList";
import { StepHeading } from "./StepHeading";

interface Props {
  answers: Answers;
  onAnswer: (value: string) => void;
}

/** ТЗ §5.3: exactly one clarifying question for the chosen branch. */
export function FollowUpStep({ answers, onAnswer }: Props) {
  const id = followUpFor(answers);
  if (!id) return null;
  const question = FOLLOW_UPS[id];
  const current = answers.followUp?.id === id ? answers.followUp.value : undefined;

  return (
    <div>
      <StepHeading>{question.title}</StepHeading>
      <OptionList options={question.options} selected={current} onSelect={onAnswer} label={question.title} />
    </div>
  );
}
