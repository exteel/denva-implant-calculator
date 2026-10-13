import { pluralUk } from "./format";
import { jawsOf, scenarioKind } from "./params";
import type { Arrangement, Params, ToothState } from "./types";

const TOOTH_STATE_LABEL: Record<ToothState, string> = {
  removed: "зуб уже видалений",
  present: "зуб ще є, потрібно видалити",
  implant_placed: "імплант уже встановлений",
  unknown: "стан зуба не уточнено",
};

const ARRANGEMENT_LABEL: Record<Arrangement, string> = {
  adjacent: "поруч",
  separate: "у різних місцях",
  mixed: "частина поруч, частина окремо",
  unknown: "розташування не уточнено",
};

export const ALL_ON_LABEL = (n: number) => `All-on-${n}`;

/** Human-readable scenario line, e.g. "3 зуби · поруч" — also used for Telegram. */
export function scenarioLabel(p: Params): string {
  const kind = scenarioKind(p);
  switch (kind) {
    case "reference":
      return "Довідкова ціна одного зуба";
    case "single":
      return p.toothState === "unknown" ? "1 зуб" : `1 зуб · ${TOOTH_STATE_LABEL[p.toothState]}`;
    case "multi":
      return `${p.teeth} ${pluralUk(p.teeth, "зуб", "зуби", "зубів")} · ${ARRANGEMENT_LABEL[p.arrangement]}`;
    case "seven_plus":
      return `7 і більше зубів · ${jawsOf(p) === 2 ? "обидві щелепи" : "одна щелепа"} · ${ALL_ON_LABEL(p.allOn)}`;
    case "arch":
      return `Усі зуби на ${jawsOf(p) === 2 ? "обох щелепах" : "одній щелепі"} · ${ALL_ON_LABEL(p.allOn)}`;
  }
}

export const TIER_LABEL = {
  minimum: "Мінімальний",
  classic: "Класичний",
  premium: "Преміальний",
} as const;

/** ТЗ §6.1 card captions. */
export const TIER_DESCRIPTION = {
  minimum: "Нижній перевірений ринковий рівень",
  classic: "Типовий збалансований ринковий рівень",
  premium: "Вищий рівень систем, матеріалів і лабораторії",
} as const;
