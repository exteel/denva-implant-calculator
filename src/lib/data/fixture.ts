/**
 * Fixture data source — local development and e2e ONLY.
 * Enabled by NEXT_PUBLIC_DATA_SOURCE=fixture; `index.ts` imports this module
 * dynamically behind that build-time constant, so normal production builds
 * never contain it. The values mirror the backend's demo seed (all
 * `is_demo: true`).
 */
import {
  SERVICE_CODES,
  type LeadPayload,
  type LocationKind,
  type LocationPricesResponse,
  type PublicLocation,
  type PublicPrice,
  type PublicService,
  type SourceType,
  type SubmitLeadResponse,
  type Tier,
} from "@/lib/contracts";
import { FIXTURE_CITIES, FIXTURE_REGIONS } from "./fixture-geo";
import type { CalculatorDataSource } from "./types";

export const FIXTURE_MARKER = "denva-fixture-data-source";

const PUBLISHED_AT = "2026-10-09T08:00:00Z";
const CALCULATED_AT = "2026-10-08T03:00:00Z";
const EUR_RATE = { rate: 50.1385, date: "2026-10-09" };

const C = SERVICE_CODES;

/** Untiered ("common") base prices, UAH. */
const COMMON: Record<string, number> = {
  [C.HEALING_ABUTMENT]: 1800,
  [C.SCAN_BOTH]: 1500,
  [C.SUPERSTRUCTURE_SET]: 5500,
  [C.TEMP_CROWN_UNIT]: 2500,
  [C.MULTIUNIT]: 6500,
  [C.ARCH_TEMP]: 38000,
  [C.EXTRACTION_SIMPLE]: 1100,
  [C.EXTRACTION_COMPLEX]: 2500,
  [C.AUGMENT]: 12000,
  [C.SINUS]: 18000,
  [C.SOFT_TISSUE]: 7500,
  [C.SEDATION]: 4000,
  [C.SURGICAL_GUIDE]: 4500,
};

/** Tiered base prices, UAH. */
const TIERED: Record<string, Record<"minimum" | "classic" | "premium", number>> = {
  [C.IMPLANT_INSTALL]: { minimum: 12000, classic: 18000, premium: 28000 },
  [C.CROWN_IMPLANT]: { minimum: 7000, classic: 10000, premium: 15000 },
  [C.ARCH_FINAL]: { minimum: 85000, classic: 130000, premium: 210000 },
};

// Codes, roles, units, tiers, sort and included_text mirror supabase/seed.sql.
// Display names too, except IMPLANT_INSTALL / SCAN_BOTH / SUPERSTRUCTURE_SET /
// CROWN_IMPLANT, whose fixture wording the e2e suite asserts (in production names
// come from the admin-editable `services` table).
const SERVICES: PublicService[] = [
  { service_code: C.IMPLANT_INSTALL, name: "Встановлення імпланта", role: "implant", unit: "за імплант", tiered: true, included_text: "Імплант і його встановлення, місцева анестезія", sort: 10 },
  { service_code: C.HEALING_ABUTMENT, name: "Формувач ясен", role: "healing", unit: "за імплант", tiered: false, included_text: "Формувач ясен (хілінг-абатмент) і його встановлення", sort: 20 },
  { service_code: C.SCAN_BOTH, name: "Цифрове сканування", role: "scan", unit: "за етап", tiered: false, included_text: "Цифрове сканування обох щелеп (один запис на етап лікування)", sort: 30 },
  { service_code: C.SUPERSTRUCTURE_SET, name: "Абатмент і кріплення", role: "superstructure", unit: "за імплант", tiered: false, included_text: "Абатмент і компоненти для кріплення коронки", sort: 40 },
  { service_code: C.CROWN_IMPLANT, name: "Коронка на імпланті", role: "crown", unit: "за коронку", tiered: true, included_text: "Постійна коронка на імпланті з фіксацією", sort: 50 },
  { service_code: C.TEMP_CROWN_UNIT, name: "Тимчасова коронка", role: "temporary", unit: "за зуб", tiered: false, included_text: "Тимчасова коронка на період приживлення", sort: 60 },
  { service_code: C.MULTIUNIT, name: "Мультиюніт-абатмент", role: "multiunit", unit: "за імплант", tiered: false, included_text: "Мультиюніт-абатмент для конструкції на всю щелепу", sort: 70 },
  { service_code: C.ARCH_TEMP, name: "Тимчасова незнімна конструкція", role: "arch_temp", unit: "за щелепу", tiered: false, included_text: "Тимчасова незнімна конструкція на щелепу", sort: 80 },
  { service_code: C.ARCH_FINAL, name: "Постійна конструкція на щелепу", role: "arch_final", unit: "за щелепу", tiered: true, included_text: "Постійна незнімна конструкція на щелепу", sort: 90 },
  { service_code: C.EXTRACTION_SIMPLE, name: "Видалення зуба (просте)", role: "addon", unit: "за зуб", tiered: false, included_text: "Просте видалення зуба", sort: 100 },
  { service_code: C.EXTRACTION_COMPLEX, name: "Видалення зуба (складне)", role: "addon", unit: "за зуб", tiered: false, included_text: "Складне (хірургічне) видалення зуба", sort: 110 },
  { service_code: C.AUGMENT, name: "Кісткова пластика", role: "addon", unit: "за ділянку", tiered: false, included_text: "Збільшення об’єму кістки в ділянці імплантації", sort: 120 },
  { service_code: C.SINUS, name: "Синус-ліфтинг", role: "addon", unit: "за сторону", tiered: false, included_text: "Підсадка кістки в ділянці верхньої щелепної пазухи", sort: 130 },
  { service_code: C.SOFT_TISSUE, name: "Пластика м’яких тканин", role: "addon", unit: "за ділянку", tiered: false, included_text: "Пластика ясен навколо імпланта", sort: 140 },
  { service_code: C.SEDATION, name: "Седація", role: "addon", unit: "за годину", tiered: false, included_text: "Седація під контролем анестезіолога", sort: 150 },
  { service_code: C.SURGICAL_GUIDE, name: "Хірургічний шаблон", role: "addon", unit: "за щелепу", tiered: false, included_text: "Навігаційний хірургічний шаблон для встановлення імплантів", sort: 160 },
];

// ───────────────────────── locations ─────────────────────────

const REGION_NAME = new Map<string, string>(FIXTURE_REGIONS.map(([id, name]) => [id, name]));

const LOCATIONS: PublicLocation[] = [
  ...FIXTURE_CITIES.map(([id, name, regionId, aliases]): PublicLocation => ({
    kind: "city",
    id,
    name,
    region_id: REGION_NAME.has(regionId) ? regionId : null,
    region_name: REGION_NAME.get(regionId) ?? null,
    aliases: [...aliases],
  })),
  ...FIXTURE_REGIONS.map(([id, name]): PublicLocation => ({
    kind: "region",
    id,
    name,
    region_id: null,
    region_name: null,
    aliases: [],
  })),
];

// ───────────────────────── prices ─────────────────────────

type Rounded = (value: number) => number;
const scaled = (multiplier: number): Rounded => (value) => Math.round((value * multiplier) / 100) * 100;

interface PriceOptions {
  multiplier: number;
  source: SourceType;
  clinicCount?: (code: string, tier: Tier) => number;
  /** Per-(code|tier) replacement of the computed price. */
  overrides?: Record<string, Partial<PublicPrice>>;
}

function buildPrices(options: PriceOptions): PublicPrice[] {
  const round = scaled(options.multiplier);
  const prices: PublicPrice[] = [];
  const push = (code: string, tier: Tier, base: number) => {
    const aggregate = options.source === "aggregate";
    const price: PublicPrice = {
      service_code: code,
      tier,
      value: round(base),
      currency: "UAH",
      source_type: options.source,
      clinic_count: aggregate ? (options.clinicCount?.(code, tier) ?? 4) : null,
      calculated_at: aggregate ? CALCULATED_AT : null,
      published_at: PUBLISHED_AT,
      is_demo: true,
      ...options.overrides?.[`${code}|${tier}`],
    };
    prices.push(price);
  };
  for (const [code, base] of Object.entries(COMMON)) push(code, "common", base);
  for (const [code, tiers] of Object.entries(TIERED)) {
    for (const tier of ["minimum", "classic", "premium"] as const) push(code, tier, tiers[tier]);
  }
  return prices;
}

/** City manual benchmarks of supabase/seed.sql (city_manual_prices: base × multiplier). */
const CITY_MULT: Record<string, number> = {
  kyiv: 1.15,
  lviv: 1.0,
  odesa: 1.02,
  dnipro: 0.97,
  kharkiv: 0.95,
  "ivano-frankivsk": 0.93,
  chernivtsi: 0.9,
};

/** Macro-region multipliers of supabase/seed.sql (region_manual_prices). */
const REGION_MULT: Record<string, number> = {
  "kyiv-city": 1.15,
  lvivska: 0.95, "ivano-frankivska": 0.95, ternopilska: 0.95, zakarpatska: 0.95, chernivetska: 0.95,
  volynska: 0.95, rivnenska: 0.95, khmelnytska: 0.95,
  vinnytska: 0.92, cherkaska: 0.92, kirovohradska: 0.92, poltavska: 0.92, kyivska: 0.92,
  zhytomyrska: 0.88, chernihivska: 0.88, sumska: 0.88,
  odeska: 1.0, mykolaivska: 1.0, khersonska: 1.0, zaporizka: 1.0,
  dnipropetrovska: 0.95, kharkivska: 0.95, donetska: 0.95, luhanska: 0.95,
};

const regional = (regionId: string | null | undefined): PublicPrice[] =>
  regionId && REGION_MULT[regionId] !== undefined
    ? buildPrices({ multiplier: REGION_MULT[regionId], source: "regional_fallback" })
    : [];

function pricesFor(kind: LocationKind, id: string): PublicPrice[] {
  if (kind === "region") return regional(id);
  switch (id) {
    case "kyiv":
      // As published from the seed: 3 demo clinics → the one aggregate line.
      return buildPrices({
        multiplier: CITY_MULT.kyiv,
        source: "manual",
        overrides: {
          [`${C.IMPLANT_INSTALL}|classic`]: {
            value: 18500,
            source_type: "aggregate",
            clinic_count: 3,
            calculated_at: CALCULATED_AT,
          },
        },
      });
    case "dnipro":
      // FIXTURE-ONLY (the seed has Дніпро on manual ×0.97): every line is an
      // aggregate (4 clinics at the thinnest line) — exercises the
      // "на основі прайсів N клінік" label in e2e.
      return buildPrices({
        multiplier: 1.05,
        source: "aggregate",
        clinicCount: (code) => (code === C.IMPLANT_INSTALL ? 4 : code === C.CROWN_IMPLANT ? 6 : 5),
      });
    case "uzhhorod":
      // FIXTURE-ONLY (the seed falls back to Закарпатська ×0.95): no data at
      // all → "Даних поки недостатньо" in e2e.
      return [];
    default:
      if (CITY_MULT[id] !== undefined) return buildPrices({ multiplier: CITY_MULT[id], source: "manual" });
      // Cities without own benchmarks fall back to their region (publish_price).
      return regional(LOCATIONS.find((l) => l.kind === "city" && l.id === id)?.region_id);
  }
}

function pricesResponse(kind: LocationKind, id: string): LocationPricesResponse {
  const location = LOCATIONS.find((l) => l.kind === kind && l.id === id);
  if (!location) throw new Error(`Unknown location ${kind}:${id}`);
  return {
    location,
    currency: "UAH",
    eur_rate: EUR_RATE,
    services: SERVICES,
    prices: pricesFor(kind, id),
  };
}

// ───────────────────────── leads ─────────────────────────

interface StoredLead {
  lead_id: string;
  lead: LeadPayload;
  telegram: "sent" | "failed";
  attempts: number;
}

const storedLeads = new Map<string, StoredLead>();
let leadCounter = 0;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function exposeForTests() {
  if (typeof window !== "undefined") {
    (window as unknown as { __denvaFixtureLeads?: StoredLead[] }).__denvaFixtureLeads = [...storedLeads.values()];
  }
}

export const fixtureDataSource: CalculatorDataSource & { marker: string } = {
  marker: FIXTURE_MARKER,

  async listLocations() {
    await delay(60);
    return LOCATIONS;
  },

  async getLocationPrices(kind, id) {
    await delay(80);
    return pricesResponse(kind, id);
  },

  /**
   * Test hooks (fixture only): a phone whose digits end with 0000 → Telegram
   * "failed" (the lead is stored, retry succeeds); ending with 1111 → the
   * request itself fails (network error, no lead_id).
   */
  async submitLead(body): Promise<SubmitLeadResponse> {
    await delay(400);
    if ("retry_lead_id" in body) {
      const stored = storedLeads.get(body.retry_lead_id);
      if (!stored) throw new Error("Unknown lead");
      stored.telegram = "sent";
      stored.attempts += 1;
      exposeForTests();
      return { lead_id: stored.lead_id, telegram: "sent" };
    }
    const digits = body.lead.phone.replace(/\D/g, "");
    if (digits.endsWith("1111")) throw new Error("Network error (fixture)");
    leadCounter += 1;
    const lead_id = `fixture-lead-${leadCounter}`;
    const telegram = digits.endsWith("0000") ? "failed" : "sent";
    storedLeads.set(lead_id, { lead_id, lead: body.lead, telegram, attempts: 1 });
    exposeForTests();
    return { lead_id, telegram };
  },
};
