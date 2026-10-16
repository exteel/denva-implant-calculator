import type { MetadataRoute } from "next";
import { getCityPages } from "@/lib/seo/data";
import { buildSitemap } from "@/lib/seo/sitemap";

export const dynamic = "force-static";

/** Only canonical, indexable URLs: catalog, methodology and PUBLISHED cities (ТЗ §11.7). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap(await getCityPages());
}
