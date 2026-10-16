import type { GeoScope, JawCalculation, PriceMeta, PublicPrice } from "../../lib/contracts";
import type { PriceBook } from "./prices";

const SCOPE_RANK: Record<GeoScope, number> = { city: 0, region: 1, country: 2 };

/** The weaker (less local) of two scopes. */
function weakest(a: GeoScope, b: GeoScope): GeoScope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

function priceDate(price: PublicPrice): string {
  return price.calculated_at ?? price.published_at;
}

/**
 * ТЗ §8.1 priceMeta for the prices a quote actually used:
 * - source_scope / baseline_scope: the weakest (city < region < country);
 * - local_clinic_count: the smallest among the main lines — the implant
 *   price (the key driver), else the crown / arch construction, else any;
 * - blend_weights: of that main line when it is a hybrid;
 * - calculated_at: the oldest calculated_at / published_at.
 * With nothing used (no prices at all) a conservative default is returned.
 */
export function buildPriceMeta(book: PriceBook, calcs: JawCalculation[]): PriceMeta {
  const used = new Map<string, PublicPrice>();
  for (const calc of calcs) {
    for (const component of calc.components) {
      const price = book.get(component.service_code, component.tier);
      if (price) used.set(`${component.service_code}|${component.tier}`, price);
    }
  }
  const prices = [...used.values()];
  const base = { currency: "UAH" as const, eur_rate: book.eurRate };

  if (prices.length === 0) {
    return {
      ...base,
      source_scope: "country",
      baseline_scope: null,
      local_clinic_count: 0,
      blend_weights: null,
      calculated_at: null,
      is_demo: false,
    };
  }

  const roleOf = (p: PublicPrice) => book.role(p.service_code);
  const implantLines = prices.filter((p) => roleOf(p) === "implant");
  const constructionLines = prices.filter((p) => roleOf(p) === "crown" || roleOf(p) === "arch");
  const mainLines = implantLines.length > 0 ? implantLines : constructionLines.length > 0 ? constructionLines : prices;

  const weakestMain = mainLines.reduce((min, p) => (p.local_clinic_count < min.local_clinic_count ? p : min));
  const baselineScopes = prices.map((p) => p.baseline_scope).filter((s): s is GeoScope => s !== null);

  return {
    ...base,
    source_scope: prices.map((p) => p.source_scope).reduce(weakest),
    baseline_scope: baselineScopes.length > 0 ? baselineScopes.reduce(weakest) : null,
    local_clinic_count: weakestMain.local_clinic_count,
    blend_weights: weakestMain.blend_weights,
    calculated_at: prices.map(priceDate).sort()[0] ?? null,
    is_demo: prices.some((p) => p.is_demo),
  };
}
