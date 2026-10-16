import { buildPriceMeta, calculateJaw, createPriceBook, sourceSentence, type PriceBook } from "@/engine/v3";
import {
  PATIENT_TIERS,
  SERVICE_CODES as C,
  type CityPageData,
  type GeoScope,
  type JawCalculation,
  type JawInput,
  type JawScenarioChoice,
  type PatientTier,
  type PublicService,
} from "@/lib/contracts";

/**
 * Static "Середні ціни у місті" block (ТЗ §11.2): one tooth and All-on-4 /
 * All-on-6 for ONE jaw at the same tier for every component. The numbers come
 * from the shared engine (`calculateJaw`, ТЗ §4.2 / §4.5) applied to the
 * published city prices — the same function the calculator runs.
 */

export function bookFromPage(page: Pick<CityPageData, "location" | "services" | "prices" | "eur_rate">): PriceBook {
  return createPriceBook({
    location: page.location,
    currency: "UAH",
    eur_rate: page.eur_rate,
    services: page.services,
    prices: page.prices,
  });
}

function jawInput(teeth: number, scenario: JawScenarioChoice | null, tier: PatientTier): JawInput {
  return {
    jaw: "upper",
    tooth_count: teeth,
    location: null,
    status: "removed",
    installed_implant_count: null,
    scenario,
    implant_tier: tier,
    crown_or_arch_tier: tier,
    include_temporary: false,
  };
}

/** The exact value of a calculation, or null when a required price is not published. */
function exactTotal(calc: JawCalculation): number | null {
  return calc.missing_codes.length === 0 ? calc.total.low : null;
}

/** ТЗ §4.2: one tooth, every component at `tier`. */
export function oneTooth(book: PriceBook, tier: PatientTier): JawCalculation {
  return calculateJaw(jawInput(1, null, tier), book);
}

/** ТЗ §4.5: All-on-4 / All-on-6 of one jaw (the 14-teeth jaw selects the scenario). */
export function allOn(book: PriceBook, scenario: "aox4" | "aox6", tier: PatientTier): JawCalculation {
  return calculateJaw(jawInput(14, scenario, tier), book);
}

export type PriceRowId = "one-tooth" | "aox4-first" | "aox4-full" | "aox6-first" | "aox6-full";

export interface PriceRow {
  id: PriceRowId;
  label: string;
  hint: string;
  values: Record<PatientTier, number | null>;
}

export interface PriceSourceMeta {
  /** Smallest verified-clinic count across the main tiered lines. */
  localClinicCount: number;
  /** ТЗ §6.1 source sentence (no clinic names), same wording as the calculator. */
  sourceText: string;
  /** Oldest calculated_at / published_at among the used prices (ISO). */
  dataDate: string;
  isDemo: boolean;
  scope: GeoScope;
}

export interface CityPriceSummary {
  rows: PriceRow[];
  /** null when no price at all could be used. */
  meta: PriceSourceMeta | null;
  /** True when every cell of every row has a value. */
  complete: boolean;
}

const ROW_DEFS: ReadonlyArray<Pick<PriceRow, "id" | "label" | "hint">> = [
  { id: "one-tooth", label: "Один зуб", hint: "імплант, формувач ясен, сканування, супраструктура і коронка" },
  { id: "aox4-first", label: "All-on-4, одна щелепа: перший етап", hint: "імпланти, мультиюніти, тимчасова конструкція, сканування" },
  { id: "aox4-full", label: "All-on-4, одна щелепа: повна вартість", hint: "перший етап, постійна конструкція і повторне сканування" },
  { id: "aox6-first", label: "All-on-6, одна щелепа: перший етап", hint: "імпланти, мультиюніти, тимчасова конструкція, сканування" },
  { id: "aox6-full", label: "All-on-6, одна щелепа: повна вартість", hint: "перший етап, постійна конструкція і повторне сканування" },
];

export function summarizeCityPrices(page: Pick<CityPageData, "location" | "services" | "prices" | "eur_rate" | "updated_at">): CityPriceSummary {
  const book = bookFromPage(page);
  const values = Object.fromEntries(
    ROW_DEFS.map((def) => [def.id, { minimum: null, classic: null, premium: null } as Record<PatientTier, number | null>]),
  ) as Record<PriceRowId, Record<PatientTier, number | null>>;
  const calcs: JawCalculation[] = [];

  for (const tier of PATIENT_TIERS) {
    const tooth = oneTooth(book, tier);
    const four = allOn(book, "aox4", tier);
    const six = allOn(book, "aox6", tier);
    calcs.push(tooth, four, six);
    values["one-tooth"][tier] = exactTotal(tooth);
    values["aox4-first"][tier] = four.missing_codes.length === 0 ? (four.first_stage?.low ?? null) : null;
    values["aox4-full"][tier] = exactTotal(four);
    values["aox6-first"][tier] = six.missing_codes.length === 0 ? (six.first_stage?.low ?? null) : null;
    values["aox6-full"][tier] = exactTotal(six);
  }

  const rows: PriceRow[] = ROW_DEFS.map((def) => ({ ...def, values: values[def.id] }));
  const complete = rows.every((row) => PATIENT_TIERS.every((tier) => row.values[tier] !== null));
  if (!calcs.some((calc) => calc.components.length > 0)) return { rows, meta: null, complete };

  const priceMeta = buildPriceMeta(book, calcs);
  return {
    rows,
    complete,
    meta: {
      localClinicCount: priceMeta.local_clinic_count,
      sourceText: sourceSentence(priceMeta),
      dataDate: priceMeta.calculated_at ?? page.updated_at,
      isDemo: priceMeta.is_demo,
      scope: priceMeta.source_scope,
    },
  };
}

/** Cheapest ("від") and dearest value of one row, for meta descriptions. */
export function rowRange(row: PriceRow): { min: number; max: number } | null {
  const values = PATIENT_TIERS.map((tier) => row.values[tier]).filter((v): v is number => v !== null);
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
}

export interface AdditionalCostItem {
  code: string;
  name: string;
  unit: string;
  value: number;
}

export interface AdditionalCostGroup {
  category: string;
  items: AdditionalCostItem[];
}

/** ТЗ §5.5: additional services with their city price; shown, never added to a total. */
export function additionalCostGroups(page: Pick<CityPageData, "services" | "prices">): AdditionalCostGroup[] {
  const groups = new Map<string, AdditionalCostItem[]>();
  const services: PublicService[] = [...page.services].filter((s) => s.additional).sort((a, b) => a.sort - b.sort);
  for (const service of services) {
    const price = page.prices.find((p) => p.service_code === service.service_code && p.tier === "common");
    if (!price) continue;
    const list = groups.get(service.category) ?? [];
    list.push({ code: service.service_code, name: service.name, unit: service.unit, value: price.value });
    groups.set(service.category, list);
  }
  return [...groups].map(([category, items]) => ({ category, items }));
}

/** "included_text" of the main components, for the «що входить» block. */
export function includedComponents(services: readonly PublicService[]): Array<{ name: string; text: string }> {
  const order: string[] = [C.IMPLANT_INSTALL, C.HEALING_ABUTMENT, C.SCAN_JAW_STAGE, C.SUPERSTRUCTURE_SET, C.CROWN_IMPLANT, C.MULTIUNIT, C.ARCH_TEMP, C.ARCH_FINAL];
  return order.flatMap((code) => {
    const service = services.find((s) => s.service_code === code);
    return service?.included_text ? [{ name: service.name, text: service.included_text }] : [];
  });
}
