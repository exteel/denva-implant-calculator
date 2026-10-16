import type { CityPageContent, CityPageData, SeoStatus } from "@/lib/contracts";
import { normalizeEurRate, normalizePrice, normalizeService } from "@/lib/data/normalize";
import { RESERVED_SLUGS } from "./site";

/**
 * Build-time data for the SEO pages (ТЗ §11.4: the static price block and
 * JSON-LD are generated from published aggregates at build time).
 *
 * - normal build: anon RPC `get_city_pages()` over plain `fetch` (no client
 *   library, no browser storage). Missing env → empty list, the build still
 *   succeeds; a configured-but-failing backend FAILS the build, so a daily
 *   rebuild can never replace live city pages with an empty site.
 * - fixture build (NEXT_PUBLIC_DATA_SOURCE=fixture): `getFixtureCityPages()`
 *   from the calculator's fixture module (src/lib/data/fixture-city-pages.ts).
 */

const STATUSES: readonly SeoStatus[] = ["draft", "review", "published", "stale", "removed"];

export interface FetchCityPagesOptions {
  url: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
  /** Attempts before giving up (transient 5xx / network errors). */
  attempts?: number;
  /** Delay between attempts in ms (0 in tests). */
  retryDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeContent(raw: unknown): CityPageContent {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const faq = Array.isArray(c.faq)
    ? c.faq.flatMap((item) => {
        const entry = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const q = str(entry.q);
        const a = str(entry.a);
        return q && a ? [{ q: q.trim(), a: a.trim() }] : [];
      })
    : [];
  // Spread first so optional extension fields (e.g. `name_locative`) survive.
  return {
    ...(c as Partial<CityPageContent>),
    intro: str(c.intro),
    faq,
    local_notes: str(c.local_notes),
    reviewer_name: str(c.reviewer_name),
    reviewer_url: str(c.reviewer_url),
    reviewed_at: str(c.reviewed_at),
  };
}

/** Validates one RPC row; returns null (and warns) for rows the pages cannot use. */
export function normalizeCityPage(raw: unknown): CityPageData | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const location = row.location as CityPageData["location"] | undefined;
  const status = row.seo_status as SeoStatus;
  if (!location || typeof location.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(location.slug)) {
    console.warn("[seo] skipping city page without a valid slug");
    return null;
  }
  if (!STATUSES.includes(status) || status === "draft") return null;
  if (RESERVED_SLUGS.includes(location.slug)) {
    console.warn(`[seo] skipping city "${location.slug}": slug is reserved`);
    return null;
  }
  return {
    location,
    seo_status: status,
    content: normalizeContent(row.content),
    // PostgREST/jsonb numerics: coerce exactly like the calculator data source does.
    prices: Array.isArray(row.prices) ? (row.prices as CityPageData["prices"]).map(normalizePrice) : [],
    services: Array.isArray(row.services) ? (row.services as CityPageData["services"]).map(normalizeService) : [],
    eur_rate: normalizeEurRate(row.eur_rate as CityPageData["eur_rate"]),
    updated_at: str(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function normalizeList(raw: unknown): CityPageData[] {
  if (!Array.isArray(raw)) throw new Error("get_city_pages returned a non-array payload");
  const pages = raw.flatMap((row) => {
    const page = normalizeCityPage(row);
    return page ? [page] : [];
  });
  // Deterministic order → stable builds and stable sitemap.
  return pages.sort((a, b) => a.location.name.localeCompare(b.location.name, "uk") || a.location.slug.localeCompare(b.location.slug));
}

/** Anon RPC `get_city_pages()` over plain fetch. Throws when the backend is configured but unreachable. */
export async function fetchCityPages(options: FetchCityPagesOptions): Promise<CityPageData[]> {
  const { url, anonKey, fetchImpl = fetch, attempts = 3, retryDelayMs = 1500 } = options;
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/get_city_pages`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(`get_city_pages failed: HTTP ${response.status}`);
      return normalizeList(await response.json());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(retryDelayMs * attempt);
    }
  }
  throw new Error(`[seo] cannot load city pages from the backend: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function load(): Promise<CityPageData[]> {
  // Folded to a build-time constant by next.config.ts `env`.
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "fixture") {
    const { getFixtureCityPages } = await import("@/lib/data/fixture-city-pages");
    return normalizeList(await getFixtureCityPages());
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    console.warn("[seo] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set: no city pages will be generated");
    return [];
  }
  return fetchCityPages({ url, anonKey });
}

let cached: Promise<CityPageData[]> | null = null;

/** Every non-draft city page of this build (cached per build worker). */
export function getCityPages(): Promise<CityPageData[]> {
  cached ??= load().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

/** Test helper. */
export function resetCityPagesCache(): void {
  cached = null;
}

export async function getCityPage(slug: string): Promise<CityPageData | null> {
  const pages = await getCityPages();
  return pages.find((page) => page.location.slug === slug) ?? null;
}

export function publishedOnly(pages: readonly CityPageData[]): CityPageData[] {
  return pages.filter((page) => page.seo_status === "published");
}

export async function getPublishedCityPages(): Promise<CityPageData[]> {
  return publishedOnly(await getCityPages());
}
