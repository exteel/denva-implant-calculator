/**
 * Clinical scenario resolver (ТЗ §6, §8, §16.1): answers → basket(s) +
 * modifiers + clinical confidence. Pure and framework-free.
 *
 * Every leaf either resolves to ≥1 priced scenario or to `no_basket` with a
 * clear message (ТЗ §20). Nothing here diagnoses (P-02): counts are reference
 * scenarios for a financial estimate only.
 */

import { effectiveTeeth } from "./questions";
import type {
  Answers,
  BasketCode,
  BasketModifiers,
  ClinicalConfidence,
  ExtraCode,
  RelevantExtra,
  Resolution,
  Scenario,
  ScenarioPart,
} from "./types";

// ───────────────────────── small helpers ─────────────────────────

const CONFIDENCE_ORDER: ClinicalConfidence[] = [
  "LOW",
  "LOW_MEDIUM",
  "MEDIUM",
  "MEDIUM_HIGH",
  "HIGH",
];

function lowerConf(c: ClinicalConfidence): ClinicalConfidence {
  return CONFIDENCE_ORDER[Math.max(0, CONFIDENCE_ORDER.indexOf(c) - 1)];
}

function higherConf(c: ClinicalConfidence, cap: ClinicalConfidence = "MEDIUM_HIGH"): ClinicalConfidence {
  const up = Math.min(CONFIDENCE_ORDER.indexOf(c) + 1, CONFIDENCE_ORDER.indexOf(cap));
  return CONFIDENCE_ORDER[Math.max(up, CONFIDENCE_ORDER.indexOf(c))];
}

function minConf(a: ClinicalConfidence, b: ClinicalConfidence): ClinicalConfidence {
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(a), CONFIDENCE_ORDER.indexOf(b))];
}

const get = (a: Answers, key: string): string | undefined => {
  const v = a[key];
  return typeof v === "string" ? v : undefined;
};

const mods = (m: Partial<BasketModifiers>): BasketModifiers => ({
  implants: 0,
  existingImplants: 0,
  units: 0,
  tempCrowns: 0,
  ...m,
});

const part = (basket: BasketCode, m: Partial<BasketModifiers>, arch?: ScenarioPart["arch"]): ScenarioPart =>
  arch ? { basket, modifiers: mods(m), arch } : { basket, modifiers: mods(m) };

const DEFAULT_FLAGS: Resolution["flags"] = {
  massExtraction: false,
  unsureSave: false,
  existingImplants: false,
  tempCrownOption: false,
};

const UNSURE_SAVE_NOTE =
  "Цей розрахунок має сенс лише якщо видалення зуба справді необхідне. Спершу варто перевірити, чи можна його зберегти.";

const UNSURE_SAVE_NOTE_MANY =
  "Цей розрахунок має сенс лише якщо видалення зубів справді необхідне. Спершу варто перевірити, чи можна їх зберегти.";

/** ТЗ §6.3 wording, shared by every multi-tooth scenario. */
const REFERENCE_ASSUMPTION =
  "Ми використовуємо один із можливих сценаріїв лише для оцінки вартості — кількість і розташування імплантів визначає лікар після діагностики.";

const NOT_INCLUDED_ASSUMPTION =
  "Кісткова пластика, синус-ліфтинг та інші процедури не включені в загальну суму — їхню потребу визначає лікар за результатами діагностики.";

// ───────────────────────── extras ─────────────────────────

const NOTE = {
  extractionConfirmed: "якщо видалення підтвердять",
  extractionOnlyIfNeeded: "лише якщо видалення справді необхідне",
  extractionPerTooth: "за кожен зуб, який ще треба видалити",
  extractionMaybe: "за кожен зуб, якщо видалення знадобиться",
  extractionCount: "за кожен зуб; кількість визначить лікар",
  bone: "якщо підтвердить КТ",
  sinus: "лише для верхньої щелепи, якщо підтвердить КТ",
  soft: "якщо знадобиться за результатами огляду",
  guide: "якщо лікар вирішить застосувати",
  sedation: "за бажанням, оплачується за годину",
  temp: "за бажанням, за кожен зуб",
} as const;

function extractionExtras(note: string, quantity: number): RelevantExtra[] {
  return [
    { code: "EXTRACTION_SIMPLE", note, quantity },
    { code: "EXTRACTION_COMPLEX", note, quantity },
  ];
}

const extra = (code: ExtraCode, note?: string, quantity?: number): RelevantExtra => ({
  code,
  ...(note ? { note } : {}),
  ...(quantity !== undefined ? { quantity } : {}),
});

// ───────────────────────── resolution builders ─────────────────────────

function defaultScenarioId(scenarios: Scenario[]): string | undefined {
  return (scenarios.find((s) => !s.isSecondary) ?? scenarios[0])?.id;
}

function priced(r: Omit<Resolution, "kind" | "defaultScenarioId" | "flags"> & { flags?: Partial<Resolution["flags"]> }): Resolution {
  return {
    kind: "priced",
    defaultScenarioId: defaultScenarioId(r.scenarios),
    ...r,
    flags: { ...DEFAULT_FLAGS, ...r.flags },
  };
}

function noBasket(title: string, message: string, assumption?: string): Resolution {
  return {
    kind: "no_basket",
    scenarios: [],
    clinicalConfidence: "LOW",
    title,
    assumptions: [
      assumption ?? "Ми не показуємо ціну, коли немає надійної основи для розрахунку, щоб не вводити в оману.",
    ],
    noBasketMessage: message,
    relevantExtras: [],
    comparisonScope: null,
    flags: { ...DEFAULT_FLAGS },
  };
}

const CONSULT_OR_CMP =
  "Найкращий наступний крок — коротка консультація, де лікар розбереться в ситуації. Якщо у вас уже є КТ, план лікування чи кошторис, їх можна перевірити в CheckMyPlan.";

// ───────────────────────── 6.1 one tooth ─────────────────────────

function singleScenario(): Scenario {
  return {
    id: "SINGLE_TOOTH_STANDARD",
    label: "1 зуб",
    parts: [part("SINGLE_TOOTH_STANDARD", { implants: 1, units: 1 })],
  };
}

function singleExtras(extraction?: { note: string }): RelevantExtra[] {
  return [
    ...(extraction ? extractionExtras(extraction.note, 1) : []),
    extra("BONE_AUGMENTATION", NOTE.bone),
    extra("SINUS_LIFT", NOTE.sinus),
    extra("SOFT_TISSUE_GRAFT", NOTE.soft),
    extra("SEDATION", NOTE.sedation),
  ];
}

const SINGLE_STANDARD_ASSUMPTION =
  "Рахуємо стандартне відновлення одного зуба: імплант, встановлення, місцева анестезія, формувач ясен, абатмент і постійна коронка.";

function resolveSingle(a: Answers): Resolution {
  const state = get(a, "single_state") ?? "unknown";
  const systemKnown = get(a, "implant_system_known") === "yes";

  switch (state) {
    case "already_removed":
      return priced({
        scenarios: [singleScenario()],
        clinicalConfidence: "HIGH",
        title: "Один зуб, який уже видалений",
        assumptions: [SINGLE_STANDARD_ASSUMPTION, NOT_INCLUDED_ASSUMPTION],
        relevantExtras: singleExtras(),
        comparisonScope: "teeth",
        flags: { tempCrownOption: true },
      });

    case "extraction_recommended":
      return priced({
        scenarios: [singleScenario()],
        clinicalConfidence: "MEDIUM_HIGH",
        title: "Один зуб, який рекомендують видалити",
        assumptions: [
          SINGLE_STANDARD_ASSUMPTION,
          "Видалення зуба не входить у загальну суму — воно показане окремо серед можливих додаткових витрат.",
          NOT_INCLUDED_ASSUMPTION,
        ],
        relevantExtras: singleExtras({ note: NOTE.extractionConfirmed }),
        comparisonScope: "teeth",
        flags: { tempCrownOption: true },
      });

    case "unsure_save":
      return priced({
        scenarios: [singleScenario()],
        clinicalConfidence: "LOW_MEDIUM",
        title: "Один зуб — чи потрібне видалення, ще не ясно",
        assumptions: [
          SINGLE_STANDARD_ASSUMPTION,
          "Це умовний розрахунок: він показує, скільки коштувало б відновлення, якщо зуб доведеться видалити.",
        ],
        conditionalNote: UNSURE_SAVE_NOTE,
        relevantExtras: singleExtras({ note: NOTE.extractionOnlyIfNeeded }),
        comparisonScope: "teeth",
        flags: { unsureSave: true, tempCrownOption: true },
      });

    case "implant_placed":
      return priced({
        scenarios: [
          {
            id: "IMPLANT_ALREADY_PLACED",
            label: "Коронка на встановленому імпланті",
            parts: [part("IMPLANT_ALREADY_PLACED", { existingImplants: 1, units: 1 })],
          },
        ],
        clinicalConfidence: systemKnown ? "HIGH" : "MEDIUM",
        title: "Один зуб, імплант уже встановлений",
        assumptions: [
          "Рахуємо лише ортопедичний етап: формувач за потреби, компоненти, сканування або відбиток і постійна коронка.",
          ...(systemKnown
            ? []
            : ["Сумісність компонентів треба перевірити — система імпланта невідома."]),
        ],
        relevantExtras: [],
        comparisonScope: "teeth",
        flags: { existingImplants: true },
      });

    case "old_problem": {
      const kind = get(a, "old_problem_kind") ?? "unknown";
      if (kind === "crown_only") {
        return priced({
          scenarios: [
            {
              id: "IMPLANT_ALREADY_PLACED",
              label: "Нова коронка на імпланті",
              parts: [part("IMPLANT_ALREADY_PLACED", { existingImplants: 1, units: 1 })],
            },
          ],
          clinicalConfidence: "LOW_MEDIUM",
          title: "Заміна старої коронки на імпланті",
          assumptions: [
            "Припускаємо, що імплант у порядку і потрібно переробити лише ортопедичний етап — нову коронку.",
            "Зняття старої коронки та можливі додаткові роботи можуть оплачуватися окремо; це оцінює лікар після огляду.",
          ],
          relevantExtras: [],
          comparisonScope: "teeth",
          flags: { existingImplants: true },
        });
      }
      if (kind === "implant_problem") {
        return noBasket(
          "Проблема зі старим імплантом",
          "Проблему з імплантом неможливо оцінити без огляду та знімка: від причини залежить і обсяг лікування, і його вартість. Тому ми не показуємо ціну, щоб не вводити в оману. " +
            CONSULT_OR_CMP,
        );
      }
      return noBasket(
        "Проблема зі старою коронкою або імплантом",
        "Поки неясно, чи йдеться лише про коронку, чи про сам імплант, — тому надійно визначити вартість неможливо. " +
          CONSULT_OR_CMP,
      );
    }

    default:
      return priced({
        scenarios: [singleScenario()],
        clinicalConfidence: "LOW_MEDIUM",
        title: "Один зуб",
        assumptions: [
          "Ми припускаємо стандартне відновлення одного зуба — це лише орієнтир для оцінки вартості.",
          "Чи потрібне видалення зуба або інші процедури, визначить лікар після огляду.",
        ],
        relevantExtras: singleExtras({ note: NOTE.extractionMaybe }),
        comparisonScope: "teeth",
        flags: { tempCrownOption: true },
      });
  }
}

// ───────────────────────── shared multi-tooth helpers ─────────────────────────

interface RefConfig {
  basket: BasketCode;
  implants: number;
  units: number;
  /** Baseline clinical confidence for this reference. */
  confidence: ClinicalConfidence;
}

const ADJACENT: Record<string, RefConfig> = {
  two: { basket: "ADJACENT_2", implants: 2, units: 2, confidence: "MEDIUM_HIGH" },
  three: { basket: "ADJACENT_3_BRIDGE", implants: 2, units: 3, confidence: "MEDIUM" },
  four: { basket: "ADJACENT_4_BRIDGE", implants: 2, units: 4, confidence: "MEDIUM" },
  five: { basket: "ADJACENT_5_BRIDGE", implants: 3, units: 5, confidence: "LOW_MEDIUM" },
  six: { basket: "ADJACENT_6_BRIDGE", implants: 3, units: 6, confidence: "LOW_MEDIUM" },
};

const plural = (n: number, one: string, few: string, many: string): string =>
  n % 10 === 1 && n % 100 !== 11
    ? one
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
      ? few
      : many;
const teethWord = (n: number): string => `${n} ${plural(n, "зуб", "зуби", "зубів")}`;
const implantsWord = (n: number): string => `${n} ${plural(n, "імплант", "імпланти", "імплантів")}`;
const unitsWord = (n: number): string => `${n} ${plural(n, "ортопедична одиниця", "ортопедичні одиниці", "ортопедичних одиниць")}`;

function adjacentScenario(cfg: RefConfig, existing: boolean): Scenario {
  if (existing) {
    return {
      id: `IMPLANT_ALREADY_PLACED_${cfg.units}`,
      label: teethWord(cfg.units),
      parts: [part("IMPLANT_ALREADY_PLACED", { existingImplants: cfg.implants, units: cfg.units })],
      referenceNote: `Референс для оцінки: ${implantsWord(cfg.implants)} уже встановлено + ${unitsWord(cfg.units)}`,
    };
  }
  return {
    id: cfg.basket,
    label: teethWord(cfg.units),
    parts: [part(cfg.basket, { implants: cfg.implants, units: cfg.units })],
    referenceNote: `Референс для оцінки: ${implantsWord(cfg.implants)} + ${unitsWord(cfg.units)}`,
  };
}

function multiExtras(opts: {
  extraction?: { note: string; quantity: number };
  units: number;
  withGuide?: boolean;
  tempCrown?: boolean;
  sinus?: boolean;
  bone?: boolean;
  soft?: boolean;
}): RelevantExtra[] {
  return [
    ...(opts.extraction ? extractionExtras(opts.extraction.note, opts.extraction.quantity) : []),
    ...(opts.bone === false ? [] : [extra("BONE_AUGMENTATION", NOTE.bone)]),
    ...(opts.sinus === false ? [] : [extra("SINUS_LIFT", NOTE.sinus)]),
    ...(opts.soft === false ? [] : [extra("SOFT_TISSUE_GRAFT", NOTE.soft)]),
    ...(opts.withGuide === false ? [] : [extra("SURGICAL_GUIDE", NOTE.guide)]),
    extra("SEDATION", NOTE.sedation),
    ...(opts.tempCrown === false ? [] : [extra("TEMPORARY_CROWN", NOTE.temp, opts.units)]),
  ];
}

/** Extraction extras shared by the "adjacent" and "separate" state questions. */
function stateExtraction(
  state: string,
  count: number,
): { note: string; quantity: number } | undefined {
  switch (state) {
    case "extraction_recommended":
      return { note: NOTE.extractionConfirmed, quantity: count };
    case "unsure_save":
      return { note: NOTE.extractionOnlyIfNeeded, quantity: count };
    case "part_removed":
    case "part_missing":
      return { note: NOTE.extractionPerTooth, quantity: 1 };
    case "unknown":
      return { note: NOTE.extractionMaybe, quantity: 1 };
    default:
      return undefined;
  }
}

// ───────────────────────── 6.2 / 6.3 adjacent ─────────────────────────

function resolveAdjacent(a: Answers, range: "2_3" | "4_6"): Resolution {
  const countAnswer = get(a, range === "2_3" ? "adjacent_count_2_3" : "adjacent_count_4_6") ?? "unknown";
  const state = get(a, "adjacent_state") ?? "unknown";

  // Which reference configs do we show, and at what baseline confidence?
  let configs: RefConfig[];
  let baseConf: ClinicalConfidence;
  if (countAnswer === "unknown") {
    configs = range === "2_3" ? [ADJACENT.two, ADJACENT.three] : [ADJACENT.four, ADJACENT.six];
    baseConf = range === "2_3" ? "LOW_MEDIUM" : "LOW";
  } else {
    configs = [ADJACENT[countAnswer]];
    baseConf = ADJACENT[countAnswer].confidence;
  }

  const existing = state === "implants_placed";
  const scenarios = configs.map((c) => adjacentScenario(c, existing));
  const primaryUnits = configs[0].units;

  let confidence: ClinicalConfidence = baseConf;
  if (existing) confidence = minConf(baseConf, "MEDIUM");
  if (state === "unsure_save" || state === "unknown") confidence = lowerConf(confidence);

  const extraction = existing ? undefined : stateExtraction(state, primaryUnits);
  const unsure = state === "unsure_save";
  // ТЗ P-06: many teeth recommended for removal → plan check first.
  const mass = state === "extraction_recommended" && configs.some((c) => c.units >= 5);

  const title =
    countAnswer === "unknown"
      ? range === "2_3"
        ? "2–3 зуби поруч"
        : "4–6 зубів поруч"
      : `${teethWord(configs[0].units)} поруч`;

  const assumptions: string[] = [REFERENCE_ASSUMPTION];
  if (countAnswer === "unknown") {
    assumptions.push("Ми показуємо кілька сценаріїв і не нав’язуємо один план — точну кількість зубів визначить лікар.");
  }
  if (existing) {
    assumptions.push(
      "Припускаємо, що встановлені імпланти можна використати для постійної конструкції — це підтвердить лікар після огляду.",
    );
  } else {
    assumptions.push(NOT_INCLUDED_ASSUMPTION);
  }
  if (state === "unknown" || state === "unsure_save") {
    assumptions.push("Поточний стан зубів невідомий або неясний, тому впевненість у сценарії нижча.");
  }

  return priced({
    scenarios,
    clinicalConfidence: confidence,
    title,
    assumptions,
    conditionalNote: unsure ? UNSURE_SAVE_NOTE_MANY : undefined,
    relevantExtras: multiExtras({
      extraction,
      units: primaryUnits,
      ...(existing ? { bone: false, sinus: false, soft: false, withGuide: false } : {}),
    }),
    comparisonScope: "teeth",
    flags: { massExtraction: mass, unsureSave: unsure, existingImplants: existing },
  });
}

// ───────────────────────── 6.4 separate ─────────────────────────

const SEPARATE_N: Record<string, number> = { two: 2, three: 3, four: 4 };

function separateScenario(n: number, existingImplants: number, label?: string): Scenario {
  const implants = Math.max(n - existingImplants, 0);
  return {
    id: `MULTIPLE_SEPARATE_${n}`,
    label: label ?? `${teethWord(n)} окремо`,
    parts: [part("MULTIPLE_SEPARATE", { implants, existingImplants, units: n })],
    referenceNote:
      existingImplants > 0
        ? `Референс для оцінки: ${implantsWord(implants)} нових + ${implantsWord(existingImplants)} уже встановлено + ${unitsWord(n)}`
        : `Референс для оцінки: ${implantsWord(n)} + ${unitsWord(n)}`,
  };
}

function resolveSeparate(a: Answers): Resolution {
  const countAnswer = get(a, "separate_count") ?? "unknown";
  const state = get(a, "separate_state") ?? "unknown";

  if (countAnswer === "more_than_six") return resolveSeparateMany(state);

  if (countAnswer === "unknown" && state === "unknown") {
    return noBasket(
      "Кілька зубів у різних місцях",
      "Не знаючи ні кількості зубів, ні їхнього стану, ми не можемо надійно визначити сценарій і не будемо вигадувати ціну. " +
        CONSULT_OR_CMP,
    );
  }

  let counts: number[];
  let baseConf: ClinicalConfidence;
  if (countAnswer === "unknown") {
    counts = [2, 4];
    baseConf = "LOW";
  } else if (countAnswer === "five_six") {
    counts = [5, 6];
    baseConf = "LOW";
  } else {
    counts = [SEPARATE_N[countAnswer] ?? 2];
    baseConf = "MEDIUM";
  }

  const withImplants = state === "some_implants_placed";
  const existingRaw = get(a, "existing_implants_count") ?? "unknown";
  const existingBase = existingRaw === "two" ? 2 : existingRaw === "three_plus" ? 3 : 1;
  const systemKnown = get(a, "implant_system_known") === "yes";

  const scenarios = counts.map((n) =>
    separateScenario(n, withImplants ? Math.min(existingBase, n) : 0),
  );

  let confidence: ClinicalConfidence = baseConf;
  if (state === "unsure_save" || state === "unknown") confidence = lowerConf(confidence);
  if (withImplants && !systemKnown) confidence = lowerConf(confidence);

  const unsure = state === "unsure_save";
  const mass = state === "extraction_recommended" && Math.max(...counts) >= 5;

  const assumptions: string[] = [
    "Рахуємо як окремі дефекти: спільні процедури, як-от діагностику, враховуємо один раз.",
    REFERENCE_ASSUMPTION,
  ];
  if (countAnswer === "unknown") {
    assumptions.push("Кількість зубів невідома, тому показуємо два сценарії для орієнтиру.");
  }
  if (withImplants) {
    assumptions.push(
      existingRaw === "unknown"
        ? "Кількість уже встановлених імплантів невідома — для оцінки беремо один імплант."
        : "Для вже встановлених імплантів рахуємо лише ортопедичний етап.",
    );
    if (!systemKnown) assumptions.push("Сумісність компонентів треба перевірити — система імплантів невідома.");
  } else {
    assumptions.push(NOT_INCLUDED_ASSUMPTION);
  }

  return priced({
    scenarios,
    clinicalConfidence: confidence,
    title:
      countAnswer === "unknown"
        ? "Кілька зубів у різних місцях"
        : countAnswer === "five_six"
          ? "5–6 зубів у різних місцях"
          : `${teethWord(counts[0])} у різних місцях`,
    assumptions: assumptions.slice(0, 4),
    conditionalNote: unsure ? UNSURE_SAVE_NOTE_MANY : undefined,
    relevantExtras: multiExtras({
      extraction: withImplants ? undefined : stateExtraction(state, counts[0]),
      units: counts[0],
      withGuide: true,
      tempCrown: true,
    }),
    comparisonScope: "teeth",
    flags: { massExtraction: mass, unsureSave: unsure, existingImplants: withImplants },
  });
}

/** ТЗ §6.4 ">6": direction only — never one implant per missing tooth. */
function resolveSeparateMany(state: string): Resolution {
  const scenarios: Scenario[] = [
    {
      id: "FULL_ARCH_AOX4",
      label: "Напрям: повнощелепне відновлення (All-on-4)",
      parts: [part("FULL_ARCH_AOX4", { implants: 4 })],
      referenceNote: "Референс для оцінки: 4 імпланти + тимчасова та постійна незнімні конструкції",
    },
    {
      id: "FULL_ARCH_AOX6",
      label: "Напрям: повнощелепне відновлення (All-on-6)",
      parts: [part("FULL_ARCH_AOX6", { implants: 6 })],
      referenceNote: "Референс для оцінки: 6 імплантів + тимчасова та постійна незнімні конструкції",
    },
  ];
  const unsure = state === "unsure_save";
  const mass = state === "extraction_recommended";
  const extraction = stateExtraction(state, 1);

  return priced({
    scenarios,
    clinicalConfidence: "LOW",
    title: "Багато зубів у різних місцях",
    assumptions: [
      "Коли відновити потрібно понад 6 зубів, точний обсяг лікування можна визначити лише за планом лікаря.",
      "Показуємо лише напрям повнощелепного відновлення як орієнтир — це не рекомендація й не план лікування.",
      "Етап 1 (імпланти й тимчасові незнімні зуби) не є повною вартістю «під ключ» — постійна конструкція входить в Етап 2.",
    ],
    directionNotes: [
      "Часткове відновлення (окремі імпланти або мости) теж можливе, але без плану лікування ми не можемо коректно його оцінити.",
      "Ми не припускаємо один імплант на кожен відсутній зуб — кількість і розташування імплантів визначає лікар після діагностики.",
    ],
    conditionalNote: unsure ? UNSURE_SAVE_NOTE_MANY : undefined,
    relevantExtras: [
      ...(extraction ? extractionExtras(extraction.note, extraction.quantity) : []),
      extra("BONE_AUGMENTATION", NOTE.bone),
      extra("SINUS_LIFT", NOTE.sinus),
      extra("SURGICAL_GUIDE", NOTE.guide),
      extra("SEDATION", NOTE.sedation),
    ],
    comparisonScope: null,
    flags: {
      massExtraction: mass,
      unsureSave: unsure,
      existingImplants: state === "some_implants_placed",
    },
  });
}

// ───────────────────────── 6.5 / 6.6 full arch ─────────────────────────

type ArchPlan = "aox4" | "aox6" | "aox8";

const ARCH_BASKET: Record<ArchPlan, BasketCode> = {
  aox4: "FULL_ARCH_AOX4",
  aox6: "FULL_ARCH_AOX6",
  aox8: "FULL_ARCH_AOX8",
};
const ARCH_IMPLANTS: Record<ArchPlan, number> = { aox4: 4, aox6: 6, aox8: 8 };
const ARCH_NAME: Record<ArchPlan, string> = { aox4: "All-on-4", aox6: "All-on-6", aox8: "All-on-8" };

const isArchPlan = (v: string | undefined): v is ArchPlan => v === "aox4" || v === "aox6" || v === "aox8";

const ARCH_NOT_QUALITY =
  "All-on-4, All-on-6 і All-on-8 — це різні схеми, а не рівні якості: більша кількість імплантів не означає автоматично кращий варіант.";
const STAGE_ASSUMPTION =
  "Етап 1 (імпланти й тимчасові незнімні зуби) — це не повна вартість «під ключ»: постійні зуби входять в Етап 2.";

function archPart(plan: ArchPlan, arch?: ScenarioPart["arch"]): ScenarioPart {
  return part(ARCH_BASKET[plan], { implants: ARCH_IMPLANTS[plan] }, arch);
}

function archRef(plan: ArchPlan): string {
  return `Референс для оцінки: ${implantsWord(ARCH_IMPLANTS[plan])} + тимчасова незнімна конструкція + постійна конструкція`;
}

function archExtras(opts: { extraction?: boolean; note?: string }): RelevantExtra[] {
  return [
    ...(opts.extraction ? extractionExtras(opts.note ?? NOTE.extractionCount, 1) : []),
    extra("BONE_AUGMENTATION", NOTE.bone),
    extra("SINUS_LIFT", NOTE.sinus),
    extra("SURGICAL_GUIDE", NOTE.guide),
    extra("SEDATION", NOTE.sedation),
  ];
}

function resolveArch(a: Answers): Resolution {
  const situation = get(a, "arch_situation") ?? "unknown";
  const offered = get(a, "arch_plan_offered") ?? "no";

  const baseConf: ClinicalConfidence =
    situation === "no_teeth" || situation === "removable_denture" ? "MEDIUM" : "LOW";
  const mass = situation === "few_left" || situation === "mostly_destroyed";
  const teethRemain = mass || situation === "unknown";

  const order: ArchPlan[] = isArchPlan(offered)
    ? [offered, ...(["aox4", "aox6", "aox8"] as const).filter((p) => p !== offered)]
    : ["aox4", "aox6", "aox8"];

  const scenarios: Scenario[] = order.map((plan) => ({
    id: ARCH_BASKET[plan].replace("FULL_ARCH_", ""),
    label: ARCH_NAME[plan],
    parts: [archPart(plan)],
    referenceNote: archRef(plan),
    ...(isArchPlan(offered)
      ? plan !== offered
        ? { isSecondary: true }
        : {}
      : plan === "aox8"
        ? { isSecondary: true }
        : {}),
  }));

  const assumptions = [
    isArchPlan(offered)
      ? `Ви згадали, що вам пропонували ${ARCH_NAME[offered]} — показуємо його першим, інші схеми лишаємо для порівняння.`
      : "Кількість імплантів ви не обираєте: показуємо фінансові сценарії All-on-4 і All-on-6, а All-on-8 — як додатковий.",
    ARCH_NOT_QUALITY,
    STAGE_ASSUMPTION,
  ];
  if (teethRemain) {
    assumptions.push("Видалення зубів, що залишилися, показано окремо серед можливих додаткових витрат.");
  }

  return priced({
    scenarios,
    clinicalConfidence: isArchPlan(offered) ? higherConf(baseConf) : baseConf,
    title: "Повне відновлення однієї щелепи",
    assumptions,
    relevantExtras: archExtras({ extraction: teethRemain }),
    comparisonScope: "full_arch",
    flags: { massExtraction: mass },
  });
}

function bothScenario(upper: ArchPlan, lower: ArchPlan): Scenario {
  const same = upper === lower;
  return {
    id: `${ARCH_BASKET[upper].replace("FULL_ARCH_", "")}+${ARCH_BASKET[lower].replace("FULL_ARCH_", "")}`,
    label: `${ARCH_NAME[upper]} + ${ARCH_NAME[lower]}`,
    parts: [archPart(upper, "UPPER"), archPart(lower, "LOWER")],
    referenceNote: same
      ? `Референс для оцінки: ${ARCH_NAME[upper]} на кожній щелепі (${implantsWord(ARCH_IMPLANTS[upper] * 2)} разом)`
      : `Референс для оцінки: ${ARCH_NAME[upper]} на верхній щелепі + ${ARCH_NAME[lower]} на нижній`,
  };
}

function resolveBoth(a: Answers): Resolution {
  const situation = get(a, "both_situation") ?? "unknown";
  const hasPlan = get(a, "both_plan_exists") === "yes";
  const upperAns = get(a, "upper_plan") ?? "unknown";
  const lowerAns = get(a, "lower_plan") ?? "unknown";

  const baseConf: ClinicalConfidence =
    situation === "almost_none_both" || situation === "removable_dentures" ? "MEDIUM" : "LOW";
  const mass = situation === "many_problem_both";
  const teethRemain = mass || situation === "one_none_other_partial" || situation === "unknown";

  const common = {
    title: "Обидві щелепи",
    comparisonScope: "full_arch" as const,
    flags: { massExtraction: mass },
    relevantExtras: archExtras({ extraction: teethRemain }),
  };

  if (hasPlan && upperAns === "other" && lowerAns === "other") {
    return noBasket(
      "Обидві щелепи",
      "Для запропонованого вам плану немає співставного кошика, тому ми не показуємо ціну, щоб не вводити в оману. Найкращий наступний крок — перевірити цей план: якщо у вас є план чи кошторис, його можна розібрати в CheckMyPlan, або отримати консультацію.",
    );
  }

  // One jaw almost toothless, the other partly preserved: only a single-arch
  // reference can be priced; the other jaw is a partial-restoration plan.
  if (situation === "one_none_other_partial") {
    const known: ArchPlan[] = [];
    for (const p of [upperAns, lowerAns]) {
      if (isArchPlan(p) && !known.includes(p)) known.push(p);
    }
    const plans: ArchPlan[] = known.length > 0 ? known : ["aox4", "aox6"];
    const scenarios: Scenario[] = plans.map((p) => ({
      id: ARCH_BASKET[p].replace("FULL_ARCH_", ""),
      label: `${ARCH_NAME[p]} на одній щелепі`,
      parts: [archPart(p)],
      referenceNote: archRef(p),
    }));
    return priced({
      scenarios,
      clinicalConfidence: known.length > 0 ? "LOW_MEDIUM" : "LOW",
      assumptions: [
        "Ми оцінюємо лише щелепу, де майже немає зубів, — для неї показуємо типові сценарії All-on-X.",
        ARCH_NOT_QUALITY,
        STAGE_ASSUMPTION,
      ],
      directionNotes: ["Для другої щелепи вартість залежить від плану часткового відновлення."],
      ...common,
    });
  }

  const archAnswer = (v: string): "known" | "other" | "unknown" =>
    isArchPlan(v) ? "known" : v === "other" ? "other" : "unknown";

  let scenarios: Scenario[];
  let confidence: ClinicalConfidence;
  const assumptions: string[] = [];

  if (!hasPlan) {
    scenarios = [bothScenario("aox4", "aox4"), bothScenario("aox6", "aox6")];
    confidence = baseConf;
    assumptions.push(
      "Плану ще немає, тому показуємо типові фінансові сценарії: однакова схема на обох щелепах.",
      "Лікар може запропонувати змішаний варіант, наприклад All-on-4 зверху і All-on-6 знизу.",
    );
  } else {
    const uKind = archAnswer(upperAns);
    const lKind = archAnswer(lowerAns);
    if (uKind === "known" && lKind === "known") {
      scenarios = [bothScenario(upperAns as ArchPlan, lowerAns as ArchPlan)];
      confidence = higherConf(baseConf);
      assumptions.push("Показуємо сценарій, який вам запропонували: окремо для верхньої та нижньої щелепи.");
    } else if (uKind !== "known" && lKind !== "known") {
      scenarios = [bothScenario("aox4", "aox4"), bothScenario("aox6", "aox6")];
      confidence = baseConf;
      assumptions.push(
        "Для запропонованого плану немає точної відповідності, тому показуємо типові сценарії з однаковою схемою на обох щелепах.",
        "Лікар може запропонувати змішаний варіант, наприклад All-on-4 зверху і All-on-6 знизу.",
      );
    } else {
      const upperKnown = uKind === "known";
      const fixed = (upperKnown ? upperAns : lowerAns) as ArchPlan;
      scenarios = (["aox4", "aox6"] as const).map((fb) =>
        upperKnown ? bothScenario(fixed, fb) : bothScenario(fb, fixed),
      );
      confidence = baseConf;
      assumptions.push(
        `Для ${upperKnown ? "нижньої" : "верхньої"} щелепи плану немає або він невідомий — показуємо варіанти All-on-4 і All-on-6.`,
      );
    }
  }

  assumptions.push(ARCH_NOT_QUALITY, STAGE_ASSUMPTION);

  return priced({
    scenarios,
    clinicalConfidence: confidence,
    assumptions: assumptions.slice(0, 4),
    ...common,
  });
}

// ───────────────────────── entry point ─────────────────────────

export function resolve(answers: Answers): Resolution {
  const teeth = effectiveTeeth(answers);

  switch (teeth) {
    case "one":
      return resolveSingle(answers);
    case "adjacent_2_3":
      return resolveAdjacent(answers, "2_3");
    case "adjacent_4_6":
      return resolveAdjacent(answers, "4_6");
    case "separate":
      return resolveSeparate(answers);
    case "full_arch":
      return resolveArch(answers);
    case "both_jaws":
      return resolveBoth(answers);
    default:
      break;
  }

  // No branch: triage could not place the user (ТЗ §6.7) or answers are incomplete.
  if (get(answers, "triage") === "hard_to_say") {
    return noBasket(
      "Ситуацію важко описати",
      "Ми не вигадуватимемо ціну, коли сценарій неможливо визначити з відповідей. " + CONSULT_OR_CMP,
    );
  }
  if (get(answers, "triage_doctor") === "unknown") {
    return noBasket(
      "Лікар згадував імпланти",
      "Без відомостей про кількість зубів ми не можемо визначити сценарій і не будемо вигадувати ціну. " +
        CONSULT_OR_CMP,
    );
  }
  return noBasket(
    "Сценарій не визначено",
    "Ми не змогли визначити сценарій за наданими відповідями, тому не показуємо ціну. " + CONSULT_OR_CMP,
  );
}
