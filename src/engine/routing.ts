/**
 * Routing module (ТЗ §15): exactly ONE primary CTA, chosen by priority.
 */

import type {
  ComparisonResult,
  Cta,
  CtaEvent,
  Qualification,
  Resolution,
  ServiceTarget,
} from "./types";

export interface RoutingInput {
  resolution: Resolution;
  qualification: Qualification;
  comparison?: ComparisonResult | null;
}

export const CTA_LABELS: Record<string, string> = {
  massExtraction: "Перевірити план перед лікуванням",
  unclearOffer: "Розібрати мою пропозицію по пунктах",
  plan: "Перевірити мій план",
  ct: "Перевірити ситуацію за КТ",
  consultation: "Розібрати мою ситуацію",
  tender: "Отримати пропозиції від клінік",
};

const EVENT: Record<ServiceTarget, CtaEvent> = {
  checkmyplan: "cta_checkmyplan",
  ct: "cta_ct",
  consultation: "cta_consultation",
  tender: "cta_tender",
};

function cta(service: ServiceTarget, labelKey: keyof typeof CTA_LABELS, reason: string): Cta {
  return { service, label: CTA_LABELS[labelKey], reason, event: EVENT[service] };
}

export function routeCta({ resolution, qualification, comparison }: RoutingInput): Cta {
  // 1. Irreversible decision (ТЗ P-06): independent plan check comes first.
  if (resolution.flags.massExtraction) {
    return cta(
      "checkmyplan",
      "massExtraction",
      "Видалення зубів незворотне, тому перед лікуванням варто спокійно перевірити план незалежно.",
    );
  }

  // 2. The offer can't be compared because it's unclear what it includes.
  if (comparison && !comparison.comparable && comparison.unclearOffer) {
    return cta(
      "checkmyplan",
      "unclearOffer",
      "Із пропозиції не зовсім зрозуміло, що входить у вартість, — ми допоможемо розібрати її по пунктах.",
    );
  }

  // 2b. Offer is above the market range for a comparable scope: the most
  // useful next step is a line-by-line review, not more clinic offers.
  if (comparison && comparison.comparable && comparison.position === "above") {
    return cta(
      "checkmyplan",
      "unclearOffer",
      "Пропозиція вища за типовий діапазон — варто розібрати по пунктах, чим саме обґрунтована різниця.",
    );
  }

  // 3. User already has a plan / estimate.
  if (qualification.hasPlan) {
    return cta(
      "checkmyplan",
      "plan",
      "У вас уже є план або кошторис — ми допоможемо перевірити, що в ньому враховано.",
    );
  }

  // 4. User has a CT scan.
  if (qualification.hasCt) {
    return cta(
      "ct",
      "ct",
      "Знімок КТ дає змогу точніше оцінити ситуацію, ніж орієнтовний розрахунок.",
    );
  }

  // 5. Scenario not reliably determined → talk it through.
  const lowConfidence =
    resolution.clinicalConfidence === "LOW" || resolution.clinicalConfidence === "LOW_MEDIUM";
  if (resolution.kind === "no_basket" || resolution.flags.unsureSave || lowConfidence) {
    return cta(
      "consultation",
      "consultation",
      "Щоб точно визначити сценарій, краще коротко розібрати вашу ситуацію зі спеціалістом.",
    );
  }

  // 6. Clear scenario → the patient can choose a clinic.
  return cta(
    "tender",
    "tender",
    "Сценарій зрозумілий — можна порівняти пропозиції клінік у вашому місті.",
  );
}
