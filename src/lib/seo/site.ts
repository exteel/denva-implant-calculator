/**
 * Site-wide SEO constants (ТЗ §11). `SITE_URL` is the absolute origin + base
 * path the site is served from; it already contains the GitHub Pages project
 * path, so `absoluteUrl("/implant-calculator/")` is a full canonical URL.
 * When the site moves to its own domain set NEXT_PUBLIC_SITE_URL (and leave
 * NEXT_PUBLIC_BASE_PATH empty).
 */
export const DEFAULT_SITE_URL = "https://exteel.github.io/denva-implant-calculator";

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export const SITE_URL = stripTrailingSlashes(process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL);

/** Same value as next.config.ts `basePath` ("" or "/denva-implant-calculator"). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const SITE_NAME = "DENVA";

/** Path (no base path) of the calculator catalog and its children. */
export const CATALOG_PATH = "/implant-calculator/";
export const METHODOLOGY_PATH = "/implant-calculator/methodology/";

/** Slugs that must never be treated as a city (they are real routes). */
export const RESERVED_SLUGS: readonly string[] = ["methodology", "result"];

/** Date of the last substantive edit of the methodology page (sitemap lastmod, visible on the page). */
export const METHODOLOGY_UPDATED_AT = "2026-10-17";

export function cityPath(slug: string): string {
  return `${CATALOG_PATH}${slug}/`;
}

/** Absolute URL for a site path such as "/implant-calculator/kyiv/". */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Origin-relative URL including the base path (for raw <meta http-equiv="refresh">). */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
