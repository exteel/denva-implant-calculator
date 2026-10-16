import { describe, expect, it } from "vitest";
import type { SeoStatus } from "@/lib/contracts";
import { buildRobots, buildSitemap } from "./sitemap";
import { absoluteUrl, SITE_URL } from "./site";
import { makeCityPage } from "./test-utils";

function city(slug: string, status: SeoStatus, updated: string) {
  const base = makeCityPage(status);
  return { ...base, location: { ...base.location, slug, id: slug, name: slug }, updated_at: updated };
}

describe("buildSitemap", () => {
  const pages = [
    city("lviv", "published", "2026-10-09T08:00:00Z"),
    city("kyiv", "review", "2026-10-10T08:00:00Z"),
    city("odesa", "stale", "2026-10-11T08:00:00Z"),
    city("kherson", "removed", "2026-10-12T08:00:00Z"),
    city("poltava", "published", "2026-10-07T08:00:00Z"),
  ];
  const sitemap = buildSitemap(pages);

  it("lists the catalog, the methodology and only published cities", () => {
    expect(sitemap.map((entry) => entry.url)).toEqual([
      absoluteUrl("/implant-calculator/"),
      absoluteUrl("/implant-calculator/methodology/"),
      absoluteUrl("/implant-calculator/lviv/"),
      absoluteUrl("/implant-calculator/poltava/"),
    ]);
  });

  it("uses absolute URLs and CityPageData.updated_at as lastmod", () => {
    expect(sitemap.every((entry) => entry.url.startsWith(SITE_URL))).toBe(true);
    expect(sitemap.find((e) => e.url.endsWith("/lviv/"))?.lastModified).toBe("2026-10-09T08:00:00Z");
    // catalog changes when any published city changes
    expect(sitemap[0].lastModified).toBe("2026-10-09T08:00:00Z");
  });

  it("has no city entries when nothing is published", () => {
    expect(buildSitemap([city("kyiv", "review", "2026-10-10T08:00:00Z")])).toHaveLength(2);
  });
});

describe("buildRobots", () => {
  it("allows everything, blocks /admin/ and points to the sitemap", () => {
    const robots = buildRobots();
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual([expect.stringMatching(/\/admin\/$/)]);
    expect(robots.sitemap).toBe(absoluteUrl("/sitemap.xml"));
  });
});
