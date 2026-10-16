/**
 * Fixture data source — local development and e2e ONLY.
 * Enabled by NEXT_PUBLIC_DATA_SOURCE=fixture; `index.ts` imports this module
 * dynamically behind that build-time constant, so normal production builds
 * never contain it. The values reproduce Appendix A of
 * docs/ARCHITECTURE_v3.md (the backend seeds the same), all `is_demo: true`.
 */
import type {
  CityPageData,
  GeoScope,
  LeadPayload,
  LocationKind,
  LocationPricesResponse,
  PublicLocation,
  PublicPrice,
  PublicService,
  ServiceRole,
  SourceType,
  SubmitLeadResponse,
  Tier,
  TierSource,
} from "../contracts";
import { FIXTURE_CITIES, FIXTURE_REGIONS } from "./fixture-geo";
import type { CalculatorDataSource } from "./types";

export const FIXTURE_MARKER = "denva-fixture-data-source";

export const FIXTURE_PUBLISHED_AT = "2026-10-09T08:00:00Z";
export const FIXTURE_CALCULATED_AT = "2026-10-08T03:00:00Z";
export const FIXTURE_EUR_RATE = { rate: 50.1385, date: "2026-10-09" };

// ───────────────────────── catalog (template «Довідник кодів») ─────────────────────────

type ServiceDef = [
  code: string,
  category: string,
  name: string,
  unit: string,
  role: ServiceRole,
  tierSource: TierSource,
  included: string | null,
];

const SERVICE_DEFS: ServiceDef[] = [
  ["IMPLANT_INSTALL", "Імплантація", "Встановлення імпланта", "за імплант", "implant", "implant_tier", "Імплант і його встановлення під місцевою анестезією"],
  ["HEALING_ABUTMENT", "Компоненти", "Формувач ясен", "за імплант", "healing", "implant_tier", "Формувач ясен — формує ясна навколо імпланта перед коронкою"],
  ["SCAN_JAW_STAGE", "Цифровий етап", "Сканування однієї щелепи", "за щелепу/етап", "scan", "common", "Цифрове сканування щелепи на етапі протезування"],
  ["REPEAT_SCAN_JAW", "Цифровий етап", "Повторне сканування однієї щелепи", "за щелепу/етап", "scan", "common", "Повторне сканування щелепи для наступного етапу"],
  ["SUPERSTRUCTURE_SET", "Компоненти", "Комплект супраструктур", "за імплант", "superstructure", "implant_tier", "Компоненти між імплантом і коронкою: аналог, трансфер і абатмент"],
  ["CROWN_IMPLANT", "Коронки", "Постійна коронка на імпланті", "за зуб", "crown", "crown_or_arch_tier", "Постійна коронка на імпланті; рівень визначає матеріал і лабораторію"],
  ["TEMP_CROWN_UNIT", "Тимчасові зуби", "Тимчасова коронка", "за зуб", "temporary", "common", "Тимчасова коронка на час приживлення імпланта"],
  ["ABUTMENT_FINAL", "Компоненти", "Фінальний абатмент після тимчасової коронки", "за імплант", "final_abutment", "implant_tier", "Фінальний абатмент, потрібний після тимчасової коронки"],
  ["MULTIUNIT", "Повна щелепа", "Мультиюніт", "за імплант", "multiunit", "implant_tier", "Мультиюніт — з’єднувальний компонент для конструкції на всю щелепу"],
  ["ARCH_TEMP", "Повна щелепа", "Тимчасова повнощелепна конструкція", "за щелепу", "arch", "common", "Тимчасова незнімна конструкція на всю щелепу (перший етап)"],
  ["ARCH_FINAL", "Повна щелепа", "Постійна повнощелепна конструкція", "за щелепу", "arch", "crown_or_arch_tier", "Постійна незнімна конструкція на всю щелепу"],
  ["IMPLANT_CONSULT", "Діагностика", "Консультація імплантолога", "за консультацію", "diagnostic", "common", "Консультація лікаря-імплантолога"],
  ["CT_ONE_JAW", "Діагностика", "КТ однієї щелепи", "за щелепу", "diagnostic", "common", "Комп’ютерна томографія однієї щелепи"],
  ["CT_BOTH_JAWS", "Діагностика", "КТ обох щелеп", "за дослідження", "diagnostic", "common", "Комп’ютерна томографія обох щелеп"],
  ["REMOVAL_SIMPLE", "Видалення", "Просте видалення зуба", "за зуб", "removal", "common", "Просте видалення зуба"],
  ["REMOVAL_COMPLEX", "Видалення", "Складне видалення зуба", "за зуб", "removal", "common", "Складне видалення зуба"],
  ["REMOVAL_WISDOM_SIMPLE", "Видалення", "Просте видалення зуба мудрості", "за зуб", "removal", "common", "Просте видалення зуба мудрості"],
  ["REMOVAL_WISDOM_COMPLEX", "Видалення", "Складне видалення зуба мудрості", "за зуб", "removal", "common", "Складне видалення зуба мудрості"],
  ["REMOVAL_RESORCIN", "Видалення", "Видалення резорцин-формалінового зуба", "за зуб", "removal", "common", "Видалення зуба, раніше лікованого резорцин-формаліновим методом"],
  ["REMOVAL_IMPACTED", "Видалення", "Видалення ретинованого зуба", "за зуб", "removal", "common", "Видалення ретинованого (непрорізаного) зуба"],
  ["ANESTHESIA_AREA", "Видалення", "Анестезія", "за ділянку", "removal", "common", "Місцева анестезія ділянки"],
  ["SUTURE_AREA", "Видалення", "Накладання шва", "за ділянку", "removal", "common", "Накладання шва після втручання"],
  ["HEMOSTATIC_SPONGE", "Видалення", "Гемостатична губка", "за одиницю", "removal", "common", "Гемостатична губка для зупинки кровотечі"],
  ["AUGMENT_SEGMENT", "Кісткові процедури", "Кісткова аугментація", "за сегмент", "addon", "common", "Нарощування кісткової тканини на ділянці"],
  ["SINUS_LIFT", "Кісткові процедури", "Синус-ліфтинг", "за операцію/сегмент", "addon", "common", "Синус-ліфтинг — нарощування кістки у верхній щелепі"],
  ["SOFT_TISSUE", "М’які тканини", "Пластика м’яких тканин", "за ділянку", "addon", "common", "Пластика ясен (м’яких тканин)"],
  ["SEDATION_30_MIN", "Седація", "Седація або лікування уві сні", "за 30 хвилин", "addon", "common", "Седація або лікування уві сні, за кожні 30 хвилин"],
  ["SURGICAL_GUIDE_STANDARD", "Навігація", "Стандартний хірургічний шаблон", "за шаблон", "addon", "common", "Хірургічний шаблон для точного встановлення імплантів"],
  ["CEMENT_RESTORATION_REMOVAL", "Протезування", "Зняття конструкції на цементній фіксації", "за зуб", "addon", "common", "Зняття старої конструкції на цементній фіксації"],
];

const ADDITIONAL_ROLES: ServiceRole[] = ["diagnostic", "removal", "addon"];

export const FIXTURE_SERVICES: PublicService[] = SERVICE_DEFS.map(
  ([service_code, category, name, unit, role, tier_source, included_text], i) => ({
    service_code,
    name,
    category,
    role,
    unit,
    tiered: tier_source !== "common",
    tier_source,
    additional: ADDITIONAL_ROLES.includes(role),
    included_text,
    sort: (i + 1) * 10,
  }),
);

/** Appendix A: national baseline (minimum / classic / premium). */
const TIERED_BASE: Record<string, [number, number, number]> = {
  IMPLANT_INSTALL: [12000, 18000, 28000],
  HEALING_ABUTMENT: [1500, 1800, 2500],
  SUPERSTRUCTURE_SET: [4500, 5500, 8000],
  ABUTMENT_FINAL: [3000, 4000, 6000],
  MULTIUNIT: [5000, 6500, 9000],
  CROWN_IMPLANT: [7000, 10000, 15000],
  ARCH_FINAL: [85000, 130000, 210000],
};

const COMMON_BASE: Record<string, number> = {
  SCAN_JAW_STAGE: 1200,
  REPEAT_SCAN_JAW: 1000,
  TEMP_CROWN_UNIT: 2500,
  ARCH_TEMP: 38000,
  IMPLANT_CONSULT: 600,
  CT_ONE_JAW: 900,
  CT_BOTH_JAWS: 1400,
  REMOVAL_SIMPLE: 1100,
  REMOVAL_COMPLEX: 2500,
  REMOVAL_WISDOM_SIMPLE: 1800,
  REMOVAL_WISDOM_COMPLEX: 3500,
  REMOVAL_RESORCIN: 2200,
  REMOVAL_IMPACTED: 4500,
  ANESTHESIA_AREA: 400,
  SUTURE_AREA: 300,
  HEMOSTATIC_SPONGE: 250,
  AUGMENT_SEGMENT: 12000,
  SINUS_LIFT: 18000,
  SOFT_TISSUE: 7500,
  SEDATION_30_MIN: 2500,
  SURGICAL_GUIDE_STANDARD: 4500,
  CEMENT_RESTORATION_REMOVAL: 500,
};

// ───────────────────────── geography ─────────────────────────

/** Macro-region multiplier of an oblast (Appendix A). */
const REGION_MULTIPLIER: Record<string, number> = {
  // kyiv 1.15
  "kyiv-city": 1.15,
  // west 0.95
  lvivska: 0.95, "ivano-frankivska": 0.95, ternopilska: 0.95, zakarpatska: 0.95,
  chernivetska: 0.95, volynska: 0.95, rivnenska: 0.95, khmelnytska: 0.95,
  // center 0.92
  vinnytska: 0.92, cherkaska: 0.92, kirovohradska: 0.92, poltavska: 0.92, kyivska: 0.92,
  // north 0.88
  zhytomyrska: 0.88, chernihivska: 0.88, sumska: 0.88,
  // south 1.0
  odeska: 1.0, mykolaivska: 1.0, khersonska: 1.0, zaporizka: 1.0,
  // east 0.95
  dnipropetrovska: 0.95, kharkivska: 0.95, donetska: 0.95, luhanska: 0.95,
};

/** No oblast prices → their cities get the national fallback. */
const NATIONAL_ONLY_REGIONS = new Set(["zakarpatska", "volynska"]);

const CITY_MULTIPLIER: Record<string, number> = {
  kyiv: 1.15,
  lviv: 1.0,
  odesa: 1.02,
  dnipro: 0.97,
  kharkiv: 0.95,
  "ivano-frankivsk": 0.93,
  chernivtsi: 0.9,
};

/** A city with no published prices at all: the «даних поки недостатньо» path. */
export const FIXTURE_EMPTY_CITY_ID = "kramatorsk";

const REGION_NAME = new Map<string, string>(FIXTURE_REGIONS.map(([id, name]) => [id, name]));

export const FIXTURE_LOCATIONS: PublicLocation[] = [
  ...FIXTURE_CITIES.map(([id, name, regionId, aliases]): PublicLocation => ({
    kind: "city",
    id,
    slug: id,
    name,
    region_id: REGION_NAME.has(regionId) ? regionId : null,
    region_name: REGION_NAME.get(regionId) ?? null,
    aliases: [...aliases],
  })),
  ...FIXTURE_REGIONS.map(([id, name]): PublicLocation => ({
    kind: "region",
    id,
    slug: id,
    name,
    region_id: null,
    region_name: null,
    aliases: [],
  })),
];

// ───────────────────────── prices ─────────────────────────

/** Appendix A rounding of demo values: Math.round(base * mult / 100) * 100. */
const scaled = (base: number, multiplier: number) => Math.round((base * multiplier) / 100) * 100;

interface Level {
  multiplier: number | null; // null → the raw national baseline
  source_type: SourceType;
  scope: GeoScope;
}

function levelPrices(level: Level): PublicPrice[] {
  const rows: PublicPrice[] = [];
  const push = (code: string, tier: Tier, base: number) => {
    rows.push({
      service_code: code,
      tier,
      value: level.multiplier === null ? base : scaled(base, level.multiplier),
      currency: "UAH",
      source_type: level.source_type,
      source_scope: level.scope,
      local_clinic_count: 0,
      baseline_scope: level.scope,
      blend_weights: null,
      calculated_at: null,
      published_at: FIXTURE_PUBLISHED_AT,
      is_demo: true,
    });
  };
  for (const def of SERVICE_DEFS) {
    const code = def[0];
    if (code in TIERED_BASE) {
      const [min, classic, premium] = TIERED_BASE[code];
      push(code, "minimum", min);
      push(code, "classic", classic);
      push(code, "premium", premium);
    } else {
      push(code, "common", COMMON_BASE[code]);
    }
  }
  return rows;
}

const NATIONAL: Level = { multiplier: null, source_type: "national_fallback", scope: "country" };

function replace(rows: PublicPrice[], code: string, tier: Tier, patch: Partial<PublicPrice>): PublicPrice[] {
  return rows.map((r) => (r.service_code === code && r.tier === tier ? { ...r, ...patch } : r));
}

function regionPrices(regionId: string): PublicPrice[] {
  if (NATIONAL_ONLY_REGIONS.has(regionId)) return levelPrices(NATIONAL);
  return levelPrices({ multiplier: REGION_MULTIPLIER[regionId], source_type: "regional_fallback", scope: "region" });
}

export function fixtureCityPrices(cityId: string): PublicPrice[] {
  const city = FIXTURE_LOCATIONS.find((l) => l.kind === "city" && l.id === cityId);
  if (!city || cityId === FIXTURE_EMPTY_CITY_ID) return [];

  const cityMultiplier = CITY_MULTIPLIER[cityId];
  if (cityMultiplier === undefined) {
    // No city baseline: the oblast baseline, or the national one.
    return city.region_id ? regionPrices(city.region_id) : levelPrices(NATIONAL);
  }

  const baseline = levelPrices({ multiplier: cityMultiplier, source_type: "manual_baseline", scope: "city" });
  switch (cityId) {
    case "kyiv":
      // 3 demo clinics (17 000, 18 500, 19 500) → aggregate = median.
      return replace(baseline, "IMPLANT_INSTALL", "classic", {
        value: 18500,
        source_type: "aggregate",
        source_scope: "city",
        local_clinic_count: 3,
        baseline_scope: null,
        blend_weights: null,
        calculated_at: FIXTURE_CALCULATED_AT,
      });
    case "lviv":
      // 2 demo clinics (17 500, 19 000): ⅔·18 250 + ⅓·18 000.
      return replace(baseline, "IMPLANT_INSTALL", "classic", {
        value: (2 * 18250 + 18000) / 3,
        source_type: "hybrid",
        source_scope: "city",
        local_clinic_count: 2,
        baseline_scope: "city",
        blend_weights: { local: 2 / 3, baseline: 1 / 3 },
        calculated_at: FIXTURE_CALCULATED_AT,
      });
    case "odesa":
      // 1 demo clinic (19 000): ⅓·19 000 + ⅔·18 400 (baseline 18 000×1.02 rounded).
      return replace(baseline, "IMPLANT_INSTALL", "classic", {
        value: (19000 + 2 * 18400) / 3,
        source_type: "hybrid",
        source_scope: "city",
        local_clinic_count: 1,
        baseline_scope: "city",
        blend_weights: { local: 1 / 3, baseline: 2 / 3 },
        calculated_at: FIXTURE_CALCULATED_AT,
      });
    default:
      return baseline;
  }
}

export function fixturePricesResponse(kind: LocationKind, id: string): LocationPricesResponse {
  const location = FIXTURE_LOCATIONS.find((l) => l.kind === kind && l.id === id);
  if (!location) throw new Error(`Unknown location ${kind}:${id}`);
  return {
    location,
    currency: "UAH",
    eur_rate: FIXTURE_EUR_RATE,
    services: FIXTURE_SERVICES,
    prices: kind === "region" ? regionPrices(id) : fixtureCityPrices(id),
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
    return FIXTURE_LOCATIONS;
  },

  async getLocationPrices(kind, id) {
    await delay(80);
    return fixturePricesResponse(kind, id);
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

// ───────────────────────── SEO city pages (build time) ─────────────────────────

/**
 * Mirrors RPC `get_city_pages()` in fixture mode: every NON-draft city. Per
 * Appendix A of docs/ARCHITECTURE_v3.md only `kyiv` is in `review` (demo
 * content), so only its page is generated. Server code only — it carries
 * the whole demo price set.
 */
export function getFixtureCityPages(): CityPageData[] {
  const kyiv = FIXTURE_LOCATIONS.find((l) => l.kind === "city" && l.id === "kyiv");
  if (!kyiv) return [];
  return [
    {
      location: kyiv,
      seo_status: "review",
      // Same demo content as supabase/seed.sql (Kyiv, review) — what get_city_pages() returns.
      content: {
        intro:
          "Демо-вступ: скільки коштує імплантація у Києві — орієнтовні ринкові ціни на основі перевірених прайсів клінік міста та ручних орієнтирів DENVA.",
        faq: [
          {
            q: "Демо-питання: чи входить КТ у вартість імплантації?",
            a: "Демо-відповідь: ні, КТ і консультація показуються окремо як можливі додаткові витрати.",
          },
          {
            q: "Демо-питання: чому ціна орієнтовна?",
            a: "Демо-відповідь: остаточну схему і ціну визначає лікар після консультації та КТ.",
          },
        ],
        local_notes: "Демо-нотатка про київський ринок: різниця між мінімальним і преміальним рівнями.",
        reviewer_name: "Ім’я рецензента",
        reviewer_url: null,
        reviewed_at: "2026-10-17T09:00:00+00:00",
      },
      prices: fixtureCityPrices("kyiv"),
      services: FIXTURE_SERVICES,
      eur_rate: FIXTURE_EUR_RATE,
      updated_at: FIXTURE_PUBLISHED_AT,
    },
  ];
}
