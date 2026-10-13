import type { LocationPricesResponse, PublicPrice, SourceType, Tier } from "@/lib/contracts";
import { createPriceBook, type PriceBook } from "./prices";

const COMMON: Record<string, number> = {
  HEALING_ABUTMENT: 1800,
  SCAN_BOTH: 1500,
  SUPERSTRUCTURE_SET: 5500,
  TEMP_CROWN_UNIT: 2500,
  MULTIUNIT: 6500,
  ARCH_TEMP: 38000,
  EXTRACTION_SIMPLE: 1100,
  EXTRACTION_COMPLEX: 2500,
  AUGMENT: 12000,
  SINUS: 18000,
  SOFT_TISSUE: 7500,
  SEDATION: 4000,
  SURGICAL_GUIDE: 4500,
};
const TIERED: Record<string, [number, number, number]> = {
  IMPLANT_INSTALL: [12000, 18000, 28000],
  CROWN_IMPLANT: [7000, 10000, 15000],
  ARCH_FINAL: [85000, 130000, 210000],
};

export interface TestPriceOptions {
  source?: SourceType;
  clinicCount?: number;
  /** Drop these "CODE|tier" prices. */
  omit?: string[];
  /** Replace/patch these "CODE|tier" prices. */
  patch?: Record<string, Partial<PublicPrice>>;
  publishedAt?: string;
  calculatedAt?: string | null;
  demo?: boolean;
  eurRate?: { rate: number; date: string } | null;
}

/** Demo prices of the ТЗ (Львів ×1.0) with knobs for edge cases. */
export function makeBook(options: TestPriceOptions = {}): PriceBook {
  const source = options.source ?? "manual";
  const aggregate = source === "aggregate";
  const prices: PublicPrice[] = [];
  const push = (code: string, tier: Tier, value: number) => {
    if (options.omit?.includes(`${code}|${tier}`)) return;
    prices.push({
      service_code: code,
      tier,
      value,
      currency: "UAH",
      source_type: source,
      clinic_count: aggregate ? (options.clinicCount ?? 5) : null,
      calculated_at: aggregate ? (options.calculatedAt ?? "2026-10-08T03:00:00Z") : (options.calculatedAt ?? null),
      published_at: options.publishedAt ?? "2026-10-09T08:00:00Z",
      is_demo: options.demo ?? true,
      ...options.patch?.[`${code}|${tier}`],
    });
  };
  for (const [code, value] of Object.entries(COMMON)) push(code, "common", value);
  for (const [code, [min, classic, premium]] of Object.entries(TIERED)) {
    push(code, "minimum", min);
    push(code, "classic", classic);
    push(code, "premium", premium);
  }
  const response: LocationPricesResponse = {
    location: { kind: "city", id: "lviv", name: "Львів", region_id: null, region_name: null, aliases: [] },
    currency: "UAH",
    eur_rate: options.eurRate === undefined ? { rate: 50.1385, date: "2026-10-09" } : options.eurRate,
    services: [],
    prices,
  };
  return createPriceBook(response);
}
