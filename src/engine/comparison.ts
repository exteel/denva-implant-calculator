/**
 * Quote comparison module C00/R01 (ТЗ §14). Compares ONLY comparable scopes
 * and never states that the user "overpays".
 */

import type {
  ComparisonResult,
  ExtraCode,
  FullArchScope,
  PriceRange,
  PricedScenario,
  QuoteInput,
  QuotePosition,
  Resolution,
  Scenario,
  TeethScopeItem,
} from "./types";

/** Fixed demo rate; the UI uses it to normalise EUR input to UAH. */
export const EUR_UAH_RATE = 50.1385;

export function toUah(amount: number, currency: "UAH" | "EUR"): number {
  return currency === "EUR" ? Math.round(amount * EUR_UAH_RATE) : amount;
}

// ───────────────────────── options (ТЗ §14.1 / §14.2) ─────────────────────────

export const TEETH_SCOPE_OPTIONS: { id: TeethScopeItem; label: string; exclusive?: boolean }[] = [
  { id: "implants", label: "Імпланти" },
  { id: "crowns", label: "Коронки / міст" },
  { id: "extraction", label: "Видалення" },
  { id: "bone", label: "Кісткова пластика" },
  { id: "sinus", label: "Синус-ліфтинг" },
  { id: "temp", label: "Тимчасові зуби" },
  { id: "sedation", label: "Седація" },
  { id: "unknown", label: "Не знаю", exclusive: true },
];

export const FULL_ARCH_SCOPE_OPTIONS: { id: FullArchScope; label: string }[] = [
  { id: "implants_only", label: "Лише імплантація" },
  { id: "implants_temp", label: "Імпланти + тимчасові незнімні зуби" },
  { id: "full", label: "Повне лікування до постійних зубів" },
  { id: "unknown", label: "Не знаю" },
];

export const FULL_ARCH_INCLUDE_OPTIONS: { id: ExtraCode; label: string }[] = [
  { id: "EXTRACTION_SIMPLE", label: "Видалення зубів" },
  { id: "BONE_AUGMENTATION", label: "Кісткові процедури" },
  { id: "SINUS_LIFT", label: "Синус-ліфтинг" },
  { id: "SEDATION", label: "Седація" },
];

// ───────────────────────── context ─────────────────────────

export interface ComparisonContext {
  resolution: Resolution;
  /** The scenario/package the user is looking at. */
  priced: PricedScenario;
  /** Per-unit market ranges for extras. */
  extraUnitPrices: Partial<Record<ExtraCode, PriceRange>>;
}

// ───────────────────────── position ─────────────────────────

/** Band around the median (±5%) that counts as "typical" inside p25–p75. */
const TYPICAL_BAND = 0.05;

export function quotePosition(offer: number, range: PriceRange): QuotePosition {
  if (offer < range.p25) return "below";
  if (offer > range.p75) return "above";
  if (offer < range.median * (1 - TYPICAL_BAND)) return "within_low";
  if (offer > range.median * (1 + TYPICAL_BAND)) return "within_high";
  return "within_typical";
}

// ───────────────────────── internals ─────────────────────────

const TEETH_EXTRA: Partial<Record<TeethScopeItem, ExtraCode>> = {
  extraction: "EXTRACTION_SIMPLE",
  bone: "BONE_AUGMENTATION",
  sinus: "SINUS_LIFT",
  sedation: "SEDATION",
  temp: "TEMPORARY_CROWN",
};

const EXTRA_LABEL: Record<ExtraCode, string> = {
  EXTRACTION_SIMPLE: "видалення",
  EXTRACTION_COMPLEX: "складне видалення",
  BONE_AUGMENTATION: "кісткова пластика",
  SINUS_LIFT: "синус-ліфтинг",
  SOFT_TISSUE_GRAFT: "пластика м’яких тканин",
  SURGICAL_GUIDE: "хірургічний шаблон",
  SEDATION: "седація",
  TEMPORARY_CROWN: "тимчасові зуби",
};

const notComparable = (reason: string, unclearOffer: boolean): ComparisonResult => ({
  comparable: false,
  reason,
  unclearOffer,
});

const addRange = (a: PriceRange, b: PriceRange): PriceRange => ({
  p25: a.p25 + b.p25,
  median: a.median + b.median,
  p75: a.p75 + b.p75,
});

const scaleRange = (r: PriceRange, k: number): PriceRange => ({
  p25: r.p25 * k,
  median: r.median * k,
  p75: r.p75 * k,
});

function findScenario(ctx: ComparisonContext): Scenario | undefined {
  const { resolution, priced } = ctx;
  return (
    resolution.scenarios.find((s) => s.id === priced.scenarioId) ??
    resolution.scenarios.find((s) => s.id === resolution.defaultScenarioId) ??
    resolution.scenarios[0]
  );
}

function scenarioUnits(s: Scenario | undefined): number {
  if (!s) return 1;
  const units = s.parts.reduce((sum, p) => sum + p.modifiers.units, 0);
  return Math.max(units, 1);
}

function scenarioHasTemp(s: Scenario | undefined, priced: PricedScenario): boolean {
  return (
    priced.lines.some((l) => l.code === "TEMP_CROWN_PACKAGE") ||
    (s?.parts.some((p) => p.basket === "SINGLE_TOOTH_TEMP" || p.modifiers.tempCrowns > 0) ?? false)
  );
}

function suggestedQuantity(ctx: ComparisonContext, code: ExtraCode): number {
  return ctx.resolution.relevantExtras.find((e) => e.code === code)?.quantity ?? 1;
}

/**
 * Adds the market price of every extra the offer explicitly includes.
 * Returns `null` + the missing code when no unit price is known.
 */
function addExtras(
  base: PriceRange,
  codes: ExtraCode[],
  ctx: ComparisonContext,
  quantityOf: (code: ExtraCode) => number,
): { range: PriceRange; added: ExtraCode[] } | { missing: ExtraCode } {
  let range = base;
  const added: ExtraCode[] = [];
  for (const code of codes) {
    const unit = ctx.extraUnitPrices[code];
    if (!unit) return { missing: code };
    range = addRange(range, scaleRange(unit, quantityOf(code)));
    added.push(code);
  }
  return { range, added };
}

// ───────────────────────── wording (ТЗ §14.3) ─────────────────────────

function wording(position: QuotePosition): { headline: string; explanation: string } {
  switch (position) {
    case "above":
      return {
        headline: "Ваша пропозиція вища за типовий ринковий діапазон для співставного сценарію.",
        explanation:
          "Вища ціна може бути обґрунтована обсягом лікування, системою імплантів, матеріалом конструкції або додатковими процедурами. Варто спокійно пройти пропозицію по пунктах і уточнити, що саме в неї входить.",
      };
    case "below":
      return {
        headline: "Ваша пропозиція нижча за типовий ринковий діапазон для співставного сценарію.",
        explanation:
          "Це не добре й не погано саме по собі. Варто уточнити, що входить у вартість, яка система імплантів і матеріали, а також які гарантії та умови післялікувального супроводу.",
      };
    case "within_low":
      return {
        headline: "Ваша пропозиція — у межах типового ринкового діапазону, ближче до його нижньої межі.",
        explanation:
          "Ціна виглядає звичайною для такого лікування. Для повної картини все одно варто уточнити склад пропозиції, систему імплантів і гарантії.",
      };
    case "within_high":
      return {
        headline: "Ваша пропозиція — у межах типового ринкового діапазону, ближче до його верхньої межі.",
        explanation:
          "Ціна виглядає звичайною для такого лікування. Вона може відображати систему імплантів, матеріал конструкції або додаткові процедури — це можна уточнити в клініці.",
      };
    default:
      return {
        headline: "Ваша пропозиція — у межах типового ринкового діапазону.",
        explanation:
          "Ціна виглядає звичайною для такого лікування. Для повної картини варто уточнити склад пропозиції, систему імплантів і гарантії.",
      };
  }
}

function finish(
  offer: number,
  range: PriceRange,
  basisLabel: string,
  addedExtras: ExtraCode[],
): ComparisonResult {
  const deviationPct = range.median > 0 ? Math.round(((offer - range.median) / range.median) * 100) : 0;
  const position = quotePosition(offer, range);
  return {
    comparable: true,
    offerUah: offer,
    range,
    deviationPct,
    position,
    ...wording(position),
    basisLabel,
    addedExtras,
  };
}

const MISSING_PRICE_REASON =
  "Для однієї з позицій у пропозиції у нас поки немає ринкових даних, тому порівняння було б неточним.";

// ───────────────────────── main ─────────────────────────

export function compareQuote(input: QuoteInput, ctx: ComparisonContext): ComparisonResult {
  const { resolution, priced } = ctx;

  if (resolution.comparisonScope === null) {
    return notComparable(
      "Для цього сценарію ми не маємо стандартизованого кошика, з яким можна коректно порівняти пропозицію.",
      false,
    );
  }
  if (!Number.isFinite(input.amountUah) || input.amountUah <= 0) {
    return notComparable("Вкажіть суму пропозиції — вона має бути більшою за нуль.", false);
  }
  const offer = input.amountUah;

  if (resolution.comparisonScope === "teeth") {
    const scope = input.teethScope ?? [];
    // "Не знаю" or nothing selected: the user can't tell what the offer covers.
    if (scope.length === 0 || scope.includes("unknown")) {
      return notComparable(
        "Поки незрозуміло, що саме входить у пропозицію, — порівнювати її з повним лікуванням некоректно.",
        true,
      );
    }
    const hasImplants = scope.includes("implants");
    const hasCrowns = scope.includes("crowns");
    // A missing core part is also an "unclear what's included" situation
    // (ТЗ §15), so we route it to the line-by-line check: unclearOffer = true.
    if (!hasCrowns) {
      return notComparable(
        "У пропозиції немає коронок/мосту — порівнювати її з повним лікуванням некоректно.",
        true,
      );
    }
    if (!hasImplants) {
      return notComparable(
        "У пропозиції немає імплантів — порівнювати її з повним лікуванням некоректно.",
        true,
      );
    }

    const scenario = findScenario(ctx);
    const units = scenarioUnits(scenario);
    const hasTemp = scenarioHasTemp(scenario, priced);
    const codes: ExtraCode[] = [];
    for (const item of scope) {
      const code = TEETH_EXTRA[item];
      if (!code) continue;
      if (code === "TEMPORARY_CROWN" && hasTemp) continue; // already in the basket
      if (!codes.includes(code)) codes.push(code);
    }
    const result = addExtras(priced.total, codes, ctx, (code) =>
      code === "TEMPORARY_CROWN" ? units : suggestedQuantity(ctx, code),
    );
    if ("missing" in result) return notComparable(MISSING_PRICE_REASON, false);

    const basis = ["Імпланти + коронки / міст", ...result.added.map((c) => EXTRA_LABEL[c])].join(" + ");
    return finish(offer, result.range, basis, result.added);
  }

  // full_arch
  const archScope = input.fullArchScope ?? "unknown";
  switch (archScope) {
    case "implants_only":
      return notComparable(
        "Кошик Denva починається з імплантів і тимчасових незнімних зубів, а у вашій пропозиції лише імплантація, — тому порівняння було б некоректним.",
        false,
      );
    case "implants_temp": {
      if (!priced.stage1) {
        return notComparable(
          "Для цього сценарію ми не маємо окремого ринкового діапазону Етапу 1.",
          false,
        );
      }
      return finish(offer, priced.stage1, "Етап 1 — імпланти й тимчасові незнімні зуби", []);
    }
    case "full": {
      const result = addExtras(priced.total, input.fullArchIncludes ?? [], ctx, (code) =>
        suggestedQuantity(ctx, code),
      );
      if ("missing" in result) return notComparable(MISSING_PRICE_REASON, false);
      const basis = ["Повне лікування до постійних зубів", ...result.added.map((c) => EXTRA_LABEL[c])].join(
        " + ",
      );
      return finish(offer, result.range, basis, result.added);
    }
    default:
      return notComparable(
        "Поки незрозуміло, що саме входить у пропозицію, — порівнювати її з повним лікуванням некоректно.",
        true,
      );
  }
}
