import type { LocationPricesResponse, PublicPrice, PublicService, ServiceCode, Tier } from "@/lib/contracts";

/** Read-only index over the published prices of one location. */
export interface PriceBook {
  readonly response: LocationPricesResponse;
  /** Exact (service, tier) lookup; undefined when nothing is published. */
  get(code: ServiceCode, tier: Tier): PublicPrice | undefined;
  service(code: ServiceCode): PublicService | undefined;
  /** Display name: the catalog name, or the code when the catalog lacks it. */
  name(code: ServiceCode): string;
  readonly locationName: string;
  readonly eurRate: { rate: number; date: string } | null;
}

export function createPriceBook(response: LocationPricesResponse): PriceBook {
  const prices = new Map<string, PublicPrice>();
  for (const price of response.prices) {
    prices.set(`${price.service_code}|${price.tier}`, price);
  }
  const services = new Map<string, PublicService>();
  for (const service of response.services) services.set(service.service_code, service);

  return {
    response,
    get: (code, tier) => prices.get(`${code}|${tier}`),
    service: (code) => services.get(code),
    name: (code) => services.get(code)?.name ?? code,
    locationName: response.location.name,
    eurRate: response.eur_rate,
  };
}
