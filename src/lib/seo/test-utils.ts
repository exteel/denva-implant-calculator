import {
  SERVICE_CODES as C,
  type CityPageData,
  type PublicPrice,
  type PublicService,
  type ServiceRole,
  type SeoStatus,
  type Tier,
  type TierSource,
} from "@/lib/contracts";

type Def = [code: string, name: string, role: ServiceRole, tierSource: TierSource, additional: boolean, values: Partial<Record<Tier, number>>];

const DEFS: Def[] = [
  [C.IMPLANT_INSTALL, "Встановлення імпланта", "implant", "implant_tier", false, { minimum: 12000, classic: 18000, premium: 28000 }],
  [C.HEALING_ABUTMENT, "Формувач ясен", "healing", "implant_tier", false, { minimum: 1500, classic: 1800, premium: 2500 }],
  [C.SCAN_JAW_STAGE, "Сканування щелепи", "scan", "common", false, { common: 1200 }],
  [C.REPEAT_SCAN_JAW, "Повторне сканування", "scan", "common", false, { common: 1000 }],
  [C.SUPERSTRUCTURE_SET, "Супраструктура", "superstructure", "implant_tier", false, { minimum: 4500, classic: 5500, premium: 8000 }],
  [C.CROWN_IMPLANT, "Коронка на імпланті", "crown", "crown_or_arch_tier", false, { minimum: 7000, classic: 10000, premium: 15000 }],
  [C.MULTIUNIT, "Мультиюніт", "multiunit", "implant_tier", false, { minimum: 5000, classic: 6500, premium: 9000 }],
  [C.ARCH_TEMP, "Тимчасова конструкція", "arch", "common", false, { common: 38000 }],
  [C.ARCH_FINAL, "Постійна конструкція", "arch", "crown_or_arch_tier", false, { minimum: 85000, classic: 130000, premium: 210000 }],
  [C.CT_ONE_JAW, "КТ однієї щелепи", "diagnostic", "common", true, { common: 900 }],
  [C.SINUS_LIFT, "Синус-ліфтинг", "addon", "common", true, { common: 18000 }],
];

/** Expected one-tooth / All-on totals for these prices (hand-computed from ТЗ §4.2 / §4.5). */
export const EXPECTED = {
  oneTooth: { minimum: 26200, classic: 36500, premium: 54700 },
  aox4First: { classic: 137200 },
  aox4Full: { classic: 268200 },
  aox6First: { classic: 186200 },
  aox6Full: { classic: 317200 },
};

export function makePrices(overrides: Partial<PublicPrice> = {}): PublicPrice[] {
  return DEFS.flatMap(([service_code, , , , , values]) =>
    (Object.entries(values) as [Tier, number][]).map(([tier, value]) => ({
      service_code,
      tier,
      value,
      currency: "UAH" as const,
      source_type: "aggregate" as const,
      source_scope: "city" as const,
      local_clinic_count: 3,
      baseline_scope: null,
      blend_weights: null,
      calculated_at: "2026-10-08T03:00:00Z",
      published_at: "2026-10-09T08:00:00Z",
      is_demo: false,
      ...overrides,
    })),
  );
}

export function makeServices(): PublicService[] {
  return DEFS.map(([service_code, name, role, tier_source, additional, values], index) => ({
    service_code,
    name,
    category: additional ? (role === "diagnostic" ? "Діагностика" : "Додаткові втручання") : "Імплантація",
    role,
    unit: "за одиницю",
    tiered: !("common" in values),
    tier_source,
    additional,
    included_text: service_code === C.IMPLANT_INSTALL ? "Імплант і його встановлення" : null,
    sort: (index + 1) * 10,
  }));
}

export function makeCityPage(status: SeoStatus = "published", overrides: Partial<CityPageData> = {}): CityPageData {
  return {
    location: { kind: "city", id: "lviv", slug: "lviv", name: "Львів", region_id: "lvivska", region_name: "Львівська область", aliases: [] },
    seo_status: status,
    content: {
      intro: "Власний вступ про Львів.",
      faq: [{ q: "Скільки триває приживлення?", a: "Це визначає лікар." }],
      local_notes: null,
      reviewer_name: "Іван Петренко",
      reviewer_url: "https://example.com/doctors/petrenko",
      reviewed_at: "2026-10-05",
    },
    prices: makePrices(),
    services: makeServices(),
    eur_rate: { rate: 50.1385, date: "2026-10-09" },
    updated_at: "2026-10-09T08:00:00Z",
    ...overrides,
  };
}
