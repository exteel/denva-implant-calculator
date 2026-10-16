import type {
  GeoScope,
  JawInput,
  LocationPricesResponse,
  PublicPrice,
  PublicService,
  ServiceCode,
  SourceType,
  Tier,
} from "../../lib/contracts";
import { createPriceBook, type PriceBook } from "./prices";

/** Appendix A of ARCHITECTURE_v3 (national baseline), UAH. */
export const BASE_TIERED: Record<string, [number, number, number]> = {
  IMPLANT_INSTALL: [12000, 18000, 28000],
  HEALING_ABUTMENT: [1500, 1800, 2500],
  SUPERSTRUCTURE_SET: [4500, 5500, 8000],
  ABUTMENT_FINAL: [3000, 4000, 6000],
  MULTIUNIT: [5000, 6500, 9000],
  CROWN_IMPLANT: [7000, 10000, 15000],
  ARCH_FINAL: [85000, 130000, 210000],
};
export const BASE_COMMON: Record<string, number> = {
  SCAN_JAW_STAGE: 1200,
  REPEAT_SCAN_JAW: 1000,
  TEMP_CROWN_UNIT: 2500,
  ARCH_TEMP: 38000,
  IMPLANT_CONSULT: 600,
  CT_ONE_JAW: 900,
  CT_BOTH_JAWS: 1400,
  REMOVAL_SIMPLE: 1100,
  REMOVAL_COMPLEX: 2500,
};

const TIER_SOURCE: Record<string, PublicService["tier_source"]> = {
  IMPLANT_INSTALL: "implant_tier",
  HEALING_ABUTMENT: "implant_tier",
  SUPERSTRUCTURE_SET: "implant_tier",
  ABUTMENT_FINAL: "implant_tier",
  MULTIUNIT: "implant_tier",
  CROWN_IMPLANT: "crown_or_arch_tier",
  ARCH_FINAL: "crown_or_arch_tier",
};
const ROLE: Record<string, PublicService["role"]> = {
  IMPLANT_INSTALL: "implant",
  CROWN_IMPLANT: "crown",
  ARCH_FINAL: "arch",
  CT_ONE_JAW: "diagnostic",
  REMOVAL_SIMPLE: "removal",
};

export interface TestPriceOptions {
  source_type?: SourceType;
  source_scope?: GeoScope;
  baseline_scope?: GeoScope | null;
  local_clinic_count?: number;
  /** Drop these "CODE|tier" prices. */
  omit?: string[];
  /** Patch these "CODE|tier" prices. */
  patch?: Record<string, Partial<PublicPrice>>;
  published_at?: string;
  calculated_at?: string | null;
  demo?: boolean;
  eurRate?: { rate: number; date: string } | null;
}

/** Demo prices of a city at the national baseline with knobs for edge cases. */
export function makeBook(options: TestPriceOptions = {}): PriceBook {
  const prices: PublicPrice[] = [];
  const push = (code: string, tier: Tier, value: number) => {
    if (options.omit?.includes(`${code}|${tier}`)) return;
    prices.push({
      service_code: code,
      tier,
      value,
      currency: "UAH",
      source_type: options.source_type ?? "manual_baseline",
      source_scope: options.source_scope ?? "city",
      local_clinic_count: options.local_clinic_count ?? 0,
      baseline_scope: options.baseline_scope === undefined ? "city" : options.baseline_scope,
      blend_weights: null,
      calculated_at: options.calculated_at ?? null,
      published_at: options.published_at ?? "2026-10-09T08:00:00Z",
      is_demo: options.demo ?? true,
      ...options.patch?.[`${code}|${tier}`],
    });
  };
  for (const [code, [min, classic, premium]] of Object.entries(BASE_TIERED)) {
    push(code, "minimum", min);
    push(code, "classic", classic);
    push(code, "premium", premium);
  }
  for (const [code, value] of Object.entries(BASE_COMMON)) push(code, "common", value);

  const codes = new Set(prices.map((p) => p.service_code));
  const services: PublicService[] = [...codes].map((code, i) => ({
    service_code: code,
    name: code,
    category: "Тест",
    role: ROLE[code] ?? "addon",
    unit: "за одиницю",
    tiered: code in BASE_TIERED,
    tier_source: TIER_SOURCE[code] ?? "common",
    additional: !(code in BASE_TIERED) && !["SCAN_JAW_STAGE", "REPEAT_SCAN_JAW", "TEMP_CROWN_UNIT", "ARCH_TEMP"].includes(code),
    included_text: null,
    sort: i,
  }));

  const response: LocationPricesResponse = {
    location: { kind: "city", id: "lviv", slug: "lviv", name: "Львів", region_id: null, region_name: null, aliases: [] },
    currency: "UAH",
    eur_rate: options.eurRate === undefined ? { rate: 50.1385, date: "2026-10-09" } : options.eurRate,
    services,
    prices,
  };
  return createPriceBook(response);
}

export const jawInput = (patch: Partial<JawInput> = {}): JawInput => ({
  jaw: "upper",
  tooth_count: 1,
  location: null,
  status: "removed",
  installed_implant_count: null,
  scenario: null,
  implant_tier: "classic",
  crown_or_arch_tier: "classic",
  include_temporary: false,
  ...patch,
});

export const code = (c: string): ServiceCode => c;
