/**
 * Shared contracts for the Denva Implant Calculator engine (ТЗ v1.0 §18):
 *
 *   answers → resolver (basket + modifiers + clinical confidence)
 *           → price engine (geo fallback → p25/median/p75 per segment)
 *           → extras → comparison (C00/R01) → routing (one CTA)
 *
 * Everything in `src/engine` is framework-free TypeScript so it can be unit
 * tested in isolation and later moved to a backend unchanged.
 */

// ───────────────────────── Segments (ТЗ §10) ─────────────────────────

export type Segment = "BASIC" | "OPTIMAL" | "PREMIUM";
export const SEGMENTS: readonly Segment[] = ["BASIC", "OPTIMAL", "PREMIUM"];

/** ТЗ §13: implant segment × prosthetic segment, chosen independently. */
export interface PackageChoice {
  implant: Segment;
  prosthetic: Segment;
}

// ───────────────────────── Geography (ТЗ §3, §17) ─────────────────────────

export type GeoLevel = "city" | "oblast" | "macroregion" | "country";

export interface GeoScope {
  level: GeoLevel;
  /** e.g. "kyiv" (city), "lvivska" (oblast), "west" (macroregion), "UA". */
  id: string;
}

export interface City {
  id: string;
  name: string;
  oblastId: string;
  macroregionId: string;
  /** Extra search terms (latin spelling, old names). */
  aliases?: string[];
}

export interface Oblast {
  id: string;
  name: string;
  macroregionId: string;
}

export interface Macroregion {
  id: string;
  name: string;
}

// ───────────────────────── Catalog codes ─────────────────────────

/** ТЗ §8. */
export type BasketCode =
  | "SINGLE_TOOTH_STANDARD"
  | "SINGLE_TOOTH_TEMP"
  | "IMPLANT_ALREADY_PLACED"
  | "ADJACENT_2"
  | "ADJACENT_3_BRIDGE"
  | "ADJACENT_4_BRIDGE"
  | "ADJACENT_5_BRIDGE"
  | "ADJACENT_6_BRIDGE"
  | "MULTIPLE_SEPARATE"
  | "FULL_ARCH_AOX4"
  | "FULL_ARCH_AOX6"
  | "FULL_ARCH_AOX8";

/**
 * Priced building blocks baskets are composed of. A basket-level market
 * record (same code as the basket) takes precedence over composition when it
 * exists for the requested geo + an aligned package (B+B / O+O / P+P).
 */
export type ComponentCode =
  /** Implant + placement + local anaesthesia + healing abutment. Per implant. */
  | "IMPLANT_SURGICAL"
  /** Abutment/components + permanent crown on an implant. Per unit. */
  | "PROSTHETIC_ON_IMPLANT"
  /** Bridge unit without its own implant. Per unit. */
  | "BRIDGE_PONTIC"
  /** Healing abutment when an implant is already placed. Per implant. */
  | "HEALING_ABUTMENT"
  /** Consultation + scan/impression. Per treatment (never doubled). */
  | "DIAGNOSTICS_SCAN"
  /** Temporary crown + extra component + repeat scan. Per tooth. */
  | "TEMP_CROWN_PACKAGE"
  /** Multi-unit abutment/components for full arch. Per implant. */
  | "MULTI_UNIT"
  /** Temporary fixed full-arch prosthesis. Per arch. */
  | "ARCH_TEMP_FIXED"
  /** Scans/impressions for stage 1. Per arch. */
  | "ARCH_SCAN"
  /** Permanent full-arch prosthesis. Per arch. */
  | "ARCH_FINAL"
  /** Repeat scans/impressions for stage 2. Per arch. */
  | "ARCH_RESCAN";

/** ТЗ §9. */
export type ExtraCode =
  | "EXTRACTION_SIMPLE"
  | "EXTRACTION_COMPLEX"
  | "BONE_AUGMENTATION"
  | "SINUS_LIFT"
  | "SOFT_TISSUE_GRAFT"
  | "SURGICAL_GUIDE"
  | "SEDATION"
  | "TEMPORARY_CROWN";

export type PriceCode = BasketCode | ComponentCode | ExtraCode;

/** Which package axis drives a component's segment (ТЗ §13 3×3). */
export type SegmentAxis = "implant" | "prosthetic" | "none";

export type Arch = "UPPER" | "LOWER";

// ───────────────────────── Market data (ТЗ §17) ─────────────────────────

export type MarketConfidence = "HIGH" | "MEDIUM" | "LOW";

export type Currency = "UAH" | "EUR" | "USD";

export interface PriceRange {
  p25: number;
  median: number;
  p75: number;
}

/** One row of the regional price table, field names exactly as in ТЗ §17. */
export interface MarketPriceRecord {
  service_or_basket: PriceCode;
  geo_scope: GeoScope;
  /** null for services that are not segmented (diagnostics, extras). */
  segment: Segment | null;
  /** Normalised to UAH — the primary user currency. */
  p25: number;
  median: number;
  p75: number;
  /** Number of valid independent observations. */
  n: number;
  /** Optional precomputed level; the engine derives it from n/age if absent. */
  confidence?: MarketConfidence;
  source_mix: { clinics: number; sources: string[] };
  /** ISO date, e.g. "2026-09-01". */
  updated_at: string;
  /** Source currency and values before normalisation (ТЗ §17 last para). */
  original_currency: Currency;
  original?: PriceRange;
  is_demo: boolean;
}

// ───────────────────────── Scenarios / resolver ─────────────────────────

/** ТЗ §16.1, including the in-between levels used in §6.2–6.3 tables. */
export type ClinicalConfidence =
  | "HIGH"
  | "MEDIUM_HIGH"
  | "MEDIUM"
  | "LOW_MEDIUM"
  | "LOW";

export interface BasketModifiers {
  /** New implants to place. */
  implants: number;
  /** Implants already in the mouth that need the prosthetic stage. */
  existingImplants: number;
  /** Total prosthetic units (crowns + pontics). */
  units: number;
  /** Extra temporary crowns (SINGLE_TOOTH_TEMP). */
  tempCrowns: number;
}

export interface ScenarioPart {
  basket: BasketCode;
  modifiers: BasketModifiers;
  arch?: Arch;
}

export interface Scenario {
  /** Stable id, e.g. "ADJACENT_2", "AOX4+AOX4". */
  id: string;
  /** Tab label in the UI, e.g. "2 зуби", "All-on-4 + All-on-4". */
  label: string;
  /** One part normally; two for "both jaws" (dynamic UPPER + LOWER, ТЗ §6.6). */
  parts: ScenarioPart[];
  /** ТЗ P-05: "Референс: 2 імпланти + 3 ортопедичні одиниці". */
  referenceNote?: string;
  /** ТЗ §6.5: AO8 is available but secondary. */
  isSecondary?: boolean;
}

export interface RelevantExtra {
  code: ExtraCode;
  /** Shown next to the unit, e.g. "якщо видалення підтвердять". */
  note?: string;
  /** Suggested quantity for the indicative range (default 1 unit). */
  quantity?: number;
}

export type ComparisonScope = "teeth" | "full_arch";

export interface Resolution {
  kind: "priced" | "no_basket";
  /** Empty when kind = "no_basket". */
  scenarios: Scenario[];
  defaultScenarioId?: string;
  clinicalConfidence: ClinicalConfidence;
  /** R00-1 headline, e.g. "Один зуб, уже видалений". */
  title: string;
  /** R00-1/R00-3 assumptions, plain sentences. */
  assumptions: string[];
  /** ТЗ 1C: "Ціна актуальна лише якщо видалення справді необхідне". */
  conditionalNote?: string;
  /** ТЗ §6.4 >6: direction-only notes, no price assumed. */
  directionNotes?: string[];
  /** Shown instead of a price when kind = "no_basket". */
  noBasketMessage?: string;
  relevantExtras: RelevantExtra[];
  /** null when there is nothing comparable to compare against. */
  comparisonScope: ComparisonScope | null;
  flags: {
    /** ТЗ P-06 — show the plan-check message before the price. */
    massExtraction: boolean;
    /** ТЗ 1C / "не знаю, чи можна зберегти". */
    unsureSave: boolean;
    existingImplants: boolean;
    /** Single tooth: the "з тимчасовою коронкою" toggle is offered. */
    tempCrownOption: boolean;
  };
}

// ───────────────────────── Questions / flow ─────────────────────────

export type Answers = Record<string, string | string[]>;

export interface QuestionOption {
  id: string;
  label: string;
  hint?: string;
  /** Multi-select: picking this clears the others ("Нічого з цього"). */
  exclusive?: boolean;
  /**
   * Triage (ТЗ §6.7): answers implied by this choice, merged into the
   * answers so the user continues inside an existing branch.
   */
  sets?: Record<string, string>;
}

export interface Question {
  id: string;
  title: string;
  subtitle?: string;
  type: "single" | "multi";
  options: QuestionOption[];
  /** Q00 must never block the result (ТЗ §7). */
  skippable?: boolean;
}

export type FlowStep =
  | { type: "question"; questionId: string }
  | { type: "result" };

/** Signals from Q00 (ТЗ §7). */
export interface Qualification {
  hasCt: boolean;
  hasPlan: boolean;
  hasQuote: boolean;
}

// ───────────────────────── Pricing output ─────────────────────────

export interface PricedLine {
  code: ComponentCode;
  label: string;
  quantity: number;
  unitLabel: string;
  axis: SegmentAxis;
  /** Full-arch stage (ТЗ §12); undefined for non-arch baskets. */
  stage?: 1 | 2;
  arch?: Arch;
  /** Segment actually used for this line (null when unsegmented). */
  segment: Segment | null;
  /** Already multiplied by quantity. */
  range: PriceRange;
  geoScope: GeoScope;
}

export interface MarketMeta {
  confidence: MarketConfidence;
  /** Smallest n across the records used. */
  minN: number;
  /** Broadest geo scope that had to be used. */
  geoScope: GeoScope;
  /** True when at least one record came from a broader scope than the city. */
  usedFallback: boolean;
  isDemo: boolean;
  /** Oldest updated_at across the records used. */
  updatedAt: string;
}

export interface PricedScenario {
  scenarioId: string;
  package: PackageChoice;
  /** Whole treatment. For full arch = stage1 + stage2. */
  total: PriceRange;
  /** Full arch only (ТЗ §12). */
  stage1?: PriceRange;
  stage2?: PriceRange;
  lines: PricedLine[];
  market: MarketMeta;
  /** "basket_record" when a direct basket row was used instead of composing. */
  source: "basket_record" | "composed";
}

export interface PricedExtra {
  code: ExtraCode;
  label: string;
  unitLabel: string;
  /** Per single unit. */
  unitRange: PriceRange;
  quantity: number;
  /** unitRange × quantity. */
  range: PriceRange;
  note?: string;
  geoScope: GeoScope;
  confidence: MarketConfidence;
}

// ───────────────────────── Comparison (ТЗ §14) ─────────────────────────

export type TeethScopeItem =
  | "implants"
  | "crowns"
  | "extraction"
  | "bone"
  | "sinus"
  | "temp"
  | "sedation"
  | "unknown";

export type FullArchScope = "implants_only" | "implants_temp" | "full" | "unknown";

export interface QuoteInput {
  amountUah: number;
  /** Required when comparisonScope = "teeth". */
  teethScope?: TeethScopeItem[];
  /** Required when comparisonScope = "full_arch". */
  fullArchScope?: FullArchScope;
  /** "full" follow-up: which extras the offer explicitly includes. */
  fullArchIncludes?: ExtraCode[];
}

export type QuotePosition =
  | "below"
  | "within_low"
  | "within_typical"
  | "within_high"
  | "above";

export type ComparisonResult =
  | {
      comparable: false;
      /** Plain sentence explaining why it was not compared. */
      reason: string;
      /** True when the scope is unclear → "Розібрати мою пропозицію по пунктах". */
      unclearOffer: boolean;
    }
  | {
      comparable: true;
      offerUah: number;
      /** Market range for the comparable scope (extras the offer includes added). */
      range: PriceRange;
      /** (offer − median) / median × 100, rounded to an integer. */
      deviationPct: number;
      position: QuotePosition;
      /** ТЗ §14.3 wording; never "ви переплачуєте". */
      headline: string;
      explanation: string;
      /** What the market range was compared on, e.g. "Етап 1". */
      basisLabel: string;
      addedExtras: ExtraCode[];
    };

// ───────────────────────── Routing (ТЗ §15) ─────────────────────────

export type ServiceTarget = "checkmyplan" | "ct" | "consultation" | "tender";

export type CtaEvent =
  | "cta_checkmyplan"
  | "cta_ct"
  | "cta_consultation"
  | "cta_tender";

export interface Cta {
  service: ServiceTarget;
  /** Button text from ТЗ §15, e.g. "Перевірити мій план". */
  label: string;
  /** One sentence shown above the button explaining why this next step. */
  reason: string;
  event: CtaEvent;
}

// ───────────────────────── Analytics (ТЗ §19) ─────────────────────────

export type AnalyticsEvent =
  | "calculator_started"
  | "city_selected"
  | "scenario_selected"
  | "scenario_resolved"
  | "qualification_completed"
  | "result_viewed"
  | "segment_changed"
  | "package_customized"
  | "quote_entered"
  | "quote_compared"
  | CtaEvent;
