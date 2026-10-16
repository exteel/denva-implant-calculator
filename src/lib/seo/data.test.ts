import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCityPages, getCityPages, normalizeCityPage, resetCityPagesCache } from "./data";
import { makeCityPage } from "./test-utils";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetchCityPages", () => {
  it("calls the anon RPC with the apikey header and returns normalised pages", async () => {
    const fetchImpl = vi.fn(async () => response([makeCityPage("published"), makeCityPage("review", { location: { ...makeCityPage().location, slug: "kyiv", name: "Київ" } })]));
    const pages = await fetchCityPages({ url: "https://x.supabase.co/", anonKey: "anon", fetchImpl: fetchImpl as unknown as typeof fetch });
    const [endpoint, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://x.supabase.co/rest/v1/rpc/get_city_pages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).apikey).toBe("anon");
    expect(pages.map((p) => p.location.slug)).toEqual(["kyiv", "lviv"]);
  });

  it("drops draft rows, reserved slugs and rows without a valid slug; fills missing content", async () => {
    const reserved = makeCityPage("published", { location: { ...makeCityPage().location, slug: "methodology" } });
    const rows = [makeCityPage("draft"), reserved, { seo_status: "published", location: { slug: "Bad Slug" } }, { seo_status: "published", location: makeCityPage().location }];
    const fetchImpl = vi.fn(async () => response(rows));
    const pages = await fetchCityPages({ url: "https://x", anonKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(pages).toHaveLength(1);
    expect(pages[0].content).toEqual({ intro: null, faq: [], local_notes: null, reviewer_name: null, reviewer_url: null, reviewed_at: null });
    expect(pages[0].prices).toEqual([]);
  });

  it("retries a transient failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response([makeCityPage()]));
    const pages = await fetchCityPages({ url: "https://x", anonKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, retryDelayMs: 0 });
    expect(pages).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails the build when the configured backend stays unreachable", async () => {
    const fetchImpl = vi.fn(async () => response({}, 500));
    await expect(fetchCityPages({ url: "https://x", anonKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, retryDelayMs: 0 })).rejects.toThrow(/HTTP 500/);
  });
});

describe("normalizeCityPage", () => {
  it("keeps only complete FAQ entries", () => {
    const page = normalizeCityPage({ ...makeCityPage(), content: { faq: [{ q: "Q", a: "A" }, { q: "", a: "B" }, { q: "C" }] } });
    expect(page?.content.faq).toEqual([{ q: "Q", a: "A" }]);
  });

  it("coerces numeric strings (PostgREST numerics) in prices, services and the EUR rate", () => {
    const base = makeCityPage();
    const raw = {
      ...base,
      eur_rate: { rate: "50.1385", date: "2026-10-09" },
      services: base.services.map((s) => ({ ...s, sort: String(s.sort) })),
      prices: base.prices.map((p) => ({ ...p, value: String(p.value), local_clinic_count: String(p.local_clinic_count) })),
    };
    const page = normalizeCityPage(raw)!;
    expect(page.eur_rate).toEqual({ rate: 50.1385, date: "2026-10-09" });
    expect(page.prices.every((p) => typeof p.value === "number" && typeof p.local_clinic_count === "number")).toBe(true);
    expect(page.prices.map((p) => p.value)).toEqual(base.prices.map((p) => p.value));
    expect(page.services.every((s) => typeof s.sort === "number")).toBe(true);
  });
});

describe("getCityPages", () => {
  beforeEach(() => {
    resetCityPagesCache();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetCityPagesCache();
  });

  it("returns an empty list (and does not fetch) when Supabase env is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(getCityPages()).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the fixture in fixture builds: Kyiv exists as a review (noindex) page", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "fixture");
    const pages = await getCityPages();
    const kyiv = pages.find((p) => p.location.slug === "kyiv");
    expect(kyiv?.seo_status).toBe("review");
    expect(pages.filter((p) => p.seo_status === "published")).toHaveLength(0);
  });

  it("loads from the RPC when Supabase env is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_SOURCE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubGlobal("fetch", vi.fn(async () => response([makeCityPage("published")])));
    const pages = await getCityPages();
    expect(pages.map((p) => p.location.slug)).toEqual(["lviv"]);
  });
});
