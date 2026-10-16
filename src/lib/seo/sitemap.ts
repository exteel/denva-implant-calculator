import type { MetadataRoute } from "next";
import type { CityPageData } from "@/lib/contracts";
import { publishedOnly } from "./data";
import { absoluteUrl, CATALOG_PATH, cityPath, METHODOLOGY_PATH, METHODOLOGY_UPDATED_AT, withBasePath } from "./site";

/**
 * Canonical indexable URLs only (ТЗ §11.7): the catalog, the methodology and
 * every PUBLISHED city. lastmod = last substantive change (CityPageData.updated_at).
 */
export function buildSitemap(pages: readonly CityPageData[]): MetadataRoute.Sitemap {
  const cities = publishedOnly(pages);
  const catalogLastmod = cities.map((page) => page.updated_at).sort().at(-1);
  return [
    { url: absoluteUrl(CATALOG_PATH), ...(catalogLastmod ? { lastModified: catalogLastmod } : {}) },
    { url: absoluteUrl(METHODOLOGY_PATH), lastModified: METHODOLOGY_UPDATED_AT },
    ...cities.map((page) => ({ url: absoluteUrl(cityPath(page.location.slug)), lastModified: page.updated_at })),
  ];
}

/** On GitHub Pages robots.txt is only honoured at the host root (see report); the paths include the base path so they stay correct on a custom domain. */
export function buildRobots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [withBasePath("/admin/")] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
