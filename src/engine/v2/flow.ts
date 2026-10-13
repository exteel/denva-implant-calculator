/** Question texts and answer reducers of the patient flow (ТЗ §5). */
import { pluralUk } from "./format";
import { followUpFor, pruneFollowUp } from "./params";
import type { Answers, FollowUpId, Scope } from "./types";

export interface Option<T extends string = string> {
  id: T;
  label: string;
}

export const SCOPE_QUESTION = {
  title: "Які зуби потрібно замінити імплантами?",
  hint: "Враховуйте лише відсутні зуби або ті, які потрібно видалити. Не враховуйте власні зуби, на які плануються коронки.",
} as const;

export const SCOPE_OPTIONS: Option<Scope>[] = [
  { id: "individual", label: "Окремі зуби" },
  { id: "one_jaw", label: "Усі зуби на одній щелепі" },
  { id: "both_jaws", label: "Усі зуби на обох щелепах" },
  { id: "unknown", label: "Не знаю точно" },
];

export const FOLLOW_UPS: Record<FollowUpId, { title: string; options: Option[] }> = {
  tooth_state: {
    title: "Що зараз із цим зубом?",
    options: [
      { id: "removed", label: "Зуб уже видалений" },
      { id: "present", label: "Зуб ще є (потрібно видалити)" },
      { id: "implant_placed", label: "Імплант уже встановлений" },
      { id: "unknown", label: "Не знаю" },
    ],
  },
  arrangement: {
    title: "Як розташовані ці зуби?",
    options: [
      { id: "adjacent", label: "Поруч" },
      { id: "separate", label: "У різних місцях" },
      { id: "mixed", label: "Частина поруч, частина окремо" },
      { id: "unknown", label: "Не знаю" },
    ],
  },
  seven_where: {
    title: "Де розташовані ці зуби?",
    options: [
      { id: "one", label: "Переважно на одній щелепі" },
      { id: "both", label: "На обох щелепах" },
      { id: "unknown", label: "Не знаю" },
    ],
  },
  jaw_state: {
    title: "Яка зараз ситуація?",
    options: [
      { id: "no_teeth", label: "Зубів немає" },
      { id: "present", label: "Зуби ще є" },
      { id: "denture", label: "Є знімна або інша конструкція" },
      { id: "unknown", label: "Не знаю" },
    ],
  },
  approx: {
    title: "Скільки приблизно зубів відсутні або потребують видалення?",
    options: [
      { id: "one", label: "Один" },
      { id: "several", label: "Кілька" },
      { id: "most_one_jaw", label: "Більшість на одній щелепі" },
      { id: "unknown", label: "Не знаю" },
    ],
  },
};

/** Choose an option on the second screen. Keeps a still-valid follow-up. */
export function chooseScope(answers: Answers, scope: Scope): Answers {
  // The slider value is kept while another scope is browsed, so "Назад" and
  // re-selecting "Окремі зуби" bring the same count back.
  const count = scope === "individual" ? (answers.count ?? 1) : answers.count;
  return pruneFollowUp({ ...answers, scope, count });
}

export function chooseCount(answers: Answers, count: number): Answers {
  return pruneFollowUp({ ...answers, scope: "individual", count });
}

export function chooseFollowUp(answers: Answers, value: string): Answers {
  const id = followUpFor(answers);
  return id ? { ...answers, followUp: { id, value } } : answers;
}

/** Title for the 1..7 slider value shown above the scale. */
export function teethValueLabel(count: number): string {
  if (count >= 7) return "7 і більше зубів";
  if (count === 1) return "1 зуб";
  return `${count} ${pluralUk(count, "зуб", "зуби", "зубів")}`;
}
