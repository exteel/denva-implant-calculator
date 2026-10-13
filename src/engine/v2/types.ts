import type { PatientTier, ServiceCode, SourceType, Tier } from "@/lib/contracts";

/** ТЗ §5.2: the four options of the second screen. */
export type Scope = "individual" | "one_jaw" | "both_jaws" | "unknown";

/** ТЗ §5.3: one follow-up question per branch. */
export type FollowUpId = "tooth_state" | "arrangement" | "seven_where" | "jaw_state" | "approx";

/** The patient's raw answers — what the question screens show again on "Назад". */
export interface Answers {
  scope?: Scope;
  /** 1..7 where 7 means "7+". Only for scope === "individual". */
  count?: number;
  followUp?: { id: FollowUpId; value: string };
}

export type ToothState = "removed" | "present" | "implant_placed" | "unknown";
export type Arrangement = "adjacent" | "separate" | "mixed" | "unknown";
export type AllOn = 4 | 6 | 8;

/**
 * The normalised scenario input of the formulas. It is derived once from
 * {@link Answers} and can then be edited right on the result page (ТЗ §6),
 * so every field always holds a value.
 */
export interface Params {
  scope: "individual" | "one_jaw" | "both_jaws" | "reference";
  /** 1..7 (7 = "7+"); meaningful for scope "individual". */
  teeth: number;
  toothState: ToothState;
  arrangement: Arrangement;
  /** Jaws for "7+" teeth; arch scopes imply 1 or 2 by themselves. */
  jaws: 1 | 2;
  allOn: AllOn;
  /** The patient said the teeth are still there → highlight extraction. */
  teethPresent: boolean;
  /** "Кілька" on the "Не знаю точно" screen: the count 3 is an assumption. */
  approx?: "several";
}

export type ScenarioKind = "single" | "multi" | "seven_plus" | "arch" | "reference";

export interface Tiers {
  /** Implant level. */
  implant: PatientTier;
  /** Crown level, or permanent-prosthesis level for a full arch. */
  crown: PatientTier;
}

export interface Range {
  low: number;
  high: number;
}

export interface Line {
  code: ServiceCode;
  label: string;
  tier: Tier;
  qty: number;
  /** null → no published price (ТЗ §2.3: never invent a number). */
  unitUah: number | null;
  totalUah: number | null;
  source: SourceType | null;
  clinicCount: number | null;
}

export interface Group {
  id: string;
  title: string;
  lines: Line[];
  /** null when any line has no price. */
  totalUah: number | null;
}

export type SourceKind = "aggregate" | "manual" | "regional";

/** ТЗ §6.1: where the numbers behind a result come from. */
export interface SourceInfo {
  kind: SourceKind;
  /** "на основі прайсів 3 клінік" · "статистичний орієнтир Denva" · "середня ціна регіону". */
  label: string;
  /** More than one kind of source went into the result. */
  mixed: boolean;
  /** Smallest clinic count among aggregate lines. */
  clinicCount: number | null;
  /** YYYY-MM-DD of the oldest used price. */
  dateIso: string;
  city: string;
  demo: boolean;
}

/** A comparable alternative to All-on (the segmental bridge for 7+ teeth). */
export interface Scenario {
  id: string;
  label: string;
  main: Range | null;
  groups: Group[];
}

export interface Calculation {
  kind: ScenarioKind;
  /** Breakdown blocks in display order. */
  groups: Group[];
  /** Headline: the whole price, or the first stage for a full arch. */
  main: Range | null;
  /** Full arch only: the permanent prosthesis (+ second scan). */
  permanent: Range | null;
  /** Full arch only: first stage + permanent. */
  full: Range | null;
  /** Number of implants, when the scenario places them. */
  implants: number | null;
  /** Required service codes without a published price. */
  missing: ServiceCode[];
  source: SourceInfo | null;
  /** 7+ only: the segmental-bridge alternative, null until the formula exists. */
  segment: Scenario | null;
  /** Why a range is shown (mixed / unknown arrangement). */
  rangeNote: string | null;
}

export interface AddonItem {
  code: ServiceCode;
  name: string;
  unit: string;
  valueUah: number;
  /** Extraction rows are emphasised when the patient said teeth are still present. */
  highlight: boolean;
}
