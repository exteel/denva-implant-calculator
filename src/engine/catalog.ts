/**
 * Каталог: компоненти ціноутворення, додаткові процедури (ТЗ §9) і кошики
 * лікування (ТЗ §8) з правилами композиції.
 */
import type {
  BasketCode,
  BasketModifiers,
  ComponentCode,
  ExtraCode,
  SegmentAxis,
} from "./types";
import { pluralUk } from "./format";

// ───────────────────────── Components ─────────────────────────

export interface ComponentInfo {
  label: string;
  unitLabel: string;
  axis: SegmentAxis;
  /** Charged once per treatment, even for two arches / several parts (ТЗ §6.6). */
  perTreatment: boolean;
}

export const COMPONENT_INFO: Record<ComponentCode, ComponentInfo> = {
  IMPLANT_SURGICAL: {
    label: "Імплант із встановленням, місцевою анестезією та формувачем",
    unitLabel: "за імплант",
    axis: "implant",
    perTreatment: false,
  },
  PROSTHETIC_ON_IMPLANT: {
    label: "Абатмент / компоненти та постійна коронка на імпланті",
    unitLabel: "за одиницю",
    axis: "prosthetic",
    perTreatment: false,
  },
  BRIDGE_PONTIC: {
    label: "Проміжна частина мостоподібної конструкції",
    unitLabel: "за одиницю",
    axis: "prosthetic",
    perTreatment: false,
  },
  HEALING_ABUTMENT: {
    label: "Формувач ясен",
    unitLabel: "за імплант",
    axis: "prosthetic",
    perTreatment: false,
  },
  DIAGNOSTICS_SCAN: {
    label: "Консультація та сканування / відбиток",
    unitLabel: "за лікування",
    axis: "none",
    perTreatment: true,
  },
  TEMP_CROWN_PACKAGE: {
    label: "Тимчасова коронка, додатковий компонент і повторне сканування",
    unitLabel: "за зуб",
    axis: "prosthetic",
    perTreatment: false,
  },
  MULTI_UNIT: {
    label: "Multi-unit абатменти та компоненти",
    unitLabel: "за імплант",
    axis: "implant",
    perTreatment: false,
  },
  ARCH_TEMP_FIXED: {
    label: "Тимчасова незнімна конструкція",
    unitLabel: "за щелепу",
    axis: "prosthetic",
    perTreatment: false,
  },
  ARCH_SCAN: {
    label: "Сканування / відбитки (етап 1)",
    unitLabel: "за щелепу",
    axis: "none",
    perTreatment: false,
  },
  ARCH_FINAL: {
    label: "Постійна незнімна конструкція",
    unitLabel: "за щелепу",
    axis: "prosthetic",
    perTreatment: false,
  },
  ARCH_RESCAN: {
    label: "Повторне сканування / відбитки (етап 2)",
    unitLabel: "за щелепу",
    axis: "none",
    perTreatment: false,
  },
};

// ───────────────────────── Extras ─────────────────────────

export interface ExtraInfo {
  label: string;
  unitLabel: string;
  description: string;
}

export const EXTRA_INFO: Record<ExtraCode, ExtraInfo> = {
  EXTRACTION_SIMPLE: {
    label: "Просте видалення зуба",
    unitLabel: "за зуб",
    description:
      "Потрібне лише якщо лікар підтвердить, що зуб неможливо зберегти; калькулятор цього не припускає.",
  },
  EXTRACTION_COMPLEX: {
    label: "Складне видалення зуба",
    unitLabel: "за зуб",
    description:
      "Потрібне лише якщо лікар підтвердить складність видалення; без огляду або КТ це не можна визначити.",
  },
  BONE_AUGMENTATION: {
    label: "Кісткова пластика",
    unitLabel: "за сегмент / випадок",
    description:
      "Потрібна лише якщо за КТ лікар підтвердить недостатній об’єм кістки; калькулятор цього не припускає.",
  },
  SINUS_LIFT: {
    label: "Синус-ліфтинг",
    unitLabel: "за сторону / випадок",
    description:
      "Потрібний лише якщо за КТ лікар підтвердить таку потребу; калькулятор цього не припускає.",
  },
  SOFT_TISSUE_GRAFT: {
    label: "Пластика м’яких тканин",
    unitLabel: "за ділянку / випадок",
    description:
      "Потрібна лише якщо лікар підтвердить такий етап після огляду; калькулятор цього не припускає.",
  },
  SURGICAL_GUIDE: {
    label: "Хірургічний шаблон",
    unitLabel: "за лікування / щелепу",
    description:
      "Використовується не в кожній клініці й не в кожному випадку; потребу підтверджує лікар за КТ.",
  },
  SEDATION: {
    label: "Седація",
    unitLabel: "за годину",
    description:
      "Потрібна лише якщо її рекомендує лікар або вибираєте ви; тривалість залежить від обсягу втручання.",
  },
  TEMPORARY_CROWN: {
    label: "Тимчасова коронка",
    unitLabel: "за зуб",
    description:
      "Потрібна лише якщо лікар підтвердить такий етап; калькулятор не припускає її без вашого вибору.",
  },
};

// ───────────────────────── Baskets ─────────────────────────

export interface BasketComponentLine {
  code: ComponentCode;
  quantity: number;
  stage?: 1 | 2;
}

export interface BasketDefinition {
  code: BasketCode;
  label: string;
  isFullArch: boolean;
  /** ТЗ §8 "Обов’язковий склад кошика" as a patient-facing bullet list. */
  included: string[];
  /** ТЗ §8 reference configuration, e.g. "Референс: 2 імпланти + 3 ортопедичні одиниці". */
  referenceNote?: string;
  /** Default modifiers for the reference scenario (used to decide if a basket-level record applies). */
  defaultModifiers: BasketModifiers;
  compose(m: BasketModifiers): BasketComponentLine[];
}

const mods = (
  implants: number,
  units: number,
  extra: Partial<BasketModifiers> = {},
): BasketModifiers => ({
  implants,
  existingImplants: 0,
  units,
  tempCrowns: 0,
  ...extra,
});

function pushPositive(
  lines: BasketComponentLine[],
  code: ComponentCode,
  quantity: number,
  stage?: 1 | 2,
): void {
  if (quantity > 0) {
    lines.push(stage ? { code, quantity, stage } : { code, quantity });
  }
}

function composeSingle(m: BasketModifiers, withTemp: boolean): BasketComponentLine[] {
  const lines: BasketComponentLine[] = [];
  pushPositive(lines, "IMPLANT_SURGICAL", m.implants);
  pushPositive(lines, "PROSTHETIC_ON_IMPLANT", m.implants);
  pushPositive(lines, "BRIDGE_PONTIC", m.units - m.implants);
  if (withTemp) pushPositive(lines, "TEMP_CROWN_PACKAGE", Math.max(m.tempCrowns, 1));
  pushPositive(lines, "DIAGNOSTICS_SCAN", 1);
  return lines;
}

function composeMulti(m: BasketModifiers): BasketComponentLine[] {
  const lines: BasketComponentLine[] = [];
  pushPositive(lines, "IMPLANT_SURGICAL", m.implants);
  pushPositive(lines, "HEALING_ABUTMENT", m.existingImplants);
  pushPositive(lines, "PROSTHETIC_ON_IMPLANT", m.implants + m.existingImplants);
  pushPositive(lines, "BRIDGE_PONTIC", m.units - m.implants - m.existingImplants);
  pushPositive(lines, "DIAGNOSTICS_SCAN", 1);
  return lines;
}

function composeArch(m: BasketModifiers): BasketComponentLine[] {
  const lines: BasketComponentLine[] = [];
  pushPositive(lines, "IMPLANT_SURGICAL", m.implants, 1);
  pushPositive(lines, "MULTI_UNIT", m.implants, 1);
  pushPositive(lines, "DIAGNOSTICS_SCAN", 1, 1);
  pushPositive(lines, "ARCH_SCAN", 1, 1);
  pushPositive(lines, "ARCH_TEMP_FIXED", 1, 1);
  pushPositive(lines, "ARCH_RESCAN", 1, 2);
  pushPositive(lines, "ARCH_FINAL", 1, 2);
  return lines;
}

const MULTI_INCLUDED_BASE = [
  "Імпланти та їх встановлення",
  "Місцева анестезія",
  "Формувачі ясен",
  "Абатменти / компоненти",
  "Постійні коронки",
  "Сканування / відбитки",
];

function multiBasket(
  code: BasketCode,
  label: string,
  implants: number,
  units: number,
  note: string,
): BasketDefinition {
  return {
    code,
    label,
    isFullArch: false,
    // The reference configuration (`note`) is shown by the scenario itself
    // (R00-3), so "what's included" stays free of counts that may not match
    // the resolved modifiers.
    referenceNote: note,
    included: [
      ...MULTI_INCLUDED_BASE,
      "Спільні процедури (консультація, сканування) рахуються один раз",
    ],
    defaultModifiers: mods(implants, units),
    compose: composeMulti,
  };
}

function archBasket(code: BasketCode, label: string, implants: number): BasketDefinition {
  return {
    code,
    label,
    isFullArch: true,
    included: [
      `Етап 1: ${implants} ${pluralUk(implants, "імплант", "імпланти", "імплантів")} із встановленням та місцевою анестезією`,
      "Етап 1: multi-unit абатменти та компоненти",
      "Етап 1: сканування / відбитки",
      "Етап 1: тимчасова незнімна конструкція",
      "Етап 2: повторне сканування / відбитки — за потреби",
      "Етап 2: постійна незнімна конструкція",
    ],
    defaultModifiers: mods(implants, 0),
    compose: composeArch,
  };
}

export const BASKETS: Record<BasketCode, BasketDefinition> = {
  SINGLE_TOOTH_STANDARD: {
    code: "SINGLE_TOOTH_STANDARD",
    label: "Один зуб — стандартний сценарій",
    isFullArch: false,
    included: [
      "Імплант і його встановлення",
      "Місцева анестезія",
      "Формувач ясен",
      "Абатмент / компоненти",
      "Сканування / відбиток",
      "Постійна коронка",
    ],
    defaultModifiers: mods(1, 1),
    compose: (m) => composeSingle(m, false),
  },
  SINGLE_TOOTH_TEMP: {
    code: "SINGLE_TOOTH_TEMP",
    label: "Один зуб — з тимчасовою коронкою",
    isFullArch: false,
    included: [
      "Усе зі стандартного сценарію для одного зуба: імплант, встановлення, анестезія, формувач, абатмент / компоненти, сканування / відбиток, постійна коронка",
      "Тимчасове протезування (тимчасова коронка)",
      "Необхідний додатковий компонент і повторне сканування",
    ],
    defaultModifiers: mods(1, 1, { tempCrowns: 1 }),
    compose: (m) => composeSingle(m, true),
  },
  IMPLANT_ALREADY_PLACED: {
    code: "IMPLANT_ALREADY_PLACED",
    label: "Імплант уже встановлений — відновлення коронки",
    isFullArch: false,
    included: [
      "Формувач ясен (якщо потрібен — враховано в розрахунку)",
      "Абатмент / компоненти",
      "Сканування / відбиток",
      "Постійна коронка",
    ],
    defaultModifiers: mods(0, 1, { existingImplants: 1 }),
    compose: composeMulti,
  },
  ADJACENT_2: multiBasket(
    "ADJACENT_2",
    "Два сусідні зуби",
    2,
    2,
    "Референс: 2 імпланти + 2 ортопедичні одиниці",
  ),
  ADJACENT_3_BRIDGE: multiBasket(
    "ADJACENT_3_BRIDGE",
    "Три сусідні зуби — міст",
    2,
    3,
    "Референс: 2 імпланти + 3 ортопедичні одиниці",
  ),
  ADJACENT_4_BRIDGE: multiBasket(
    "ADJACENT_4_BRIDGE",
    "Чотири сусідні зуби — міст",
    2,
    4,
    "Референс: 2 імпланти + 4 ортопедичні одиниці",
  ),
  ADJACENT_5_BRIDGE: multiBasket(
    "ADJACENT_5_BRIDGE",
    "П’ять сусідніх зубів — міст",
    3,
    5,
    "Референс: 3 імпланти + 5 ортопедичних одиниць",
  ),
  ADJACENT_6_BRIDGE: multiBasket(
    "ADJACENT_6_BRIDGE",
    "Шість сусідніх зубів — міст",
    3,
    6,
    "Референс: 3 імпланти + 6 ортопедичних одиниць",
  ),
  MULTIPLE_SEPARATE: multiBasket(
    "MULTIPLE_SEPARATE",
    "Кілька окремих дефектів",
    2,
    2,
    "N імплантів + N ортопедичних одиниць; спільні процедури один раз",
  ),
  FULL_ARCH_AOX4: archBasket("FULL_ARCH_AOX4", "Одна щелепа — All-on-4", 4),
  FULL_ARCH_AOX6: archBasket("FULL_ARCH_AOX6", "Одна щелепа — All-on-6", 6),
  FULL_ARCH_AOX8: archBasket("FULL_ARCH_AOX8", "Одна щелепа — All-on-8", 8),
};
