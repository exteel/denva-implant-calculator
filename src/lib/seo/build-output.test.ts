// @vitest-environment node
/**
 * Build check (ТЗ §11.9) over the static export. Skipped unless SEO_BUILD_CHECK=1:
 *
 *   NEXT_PUBLIC_DATA_SOURCE=fixture NEXT_PUBLIC_BASE_PATH= npm run build
 *   SEO_BUILD_CHECK=1 npx vitest run src/lib/seo/build-output.test.ts
 *
 * SEO_OUT_DIR overrides the export directory (default: ./out).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCityPages } from "./data";
import { summarizeCityPrices } from "./prices";
import { formatUah } from "./text";

const OUT = path.resolve(process.env.SEO_OUT_DIR ?? "out");
const read = (file: string) => readFileSync(path.join(OUT, file), "utf8");

describe.skipIf(!process.env.SEO_BUILD_CHECK)("static export (fixture build)", () => {
  it("Kyiv (status review) is noindex with H1, price numbers and JSON-LD", async () => {
    process.env.NEXT_PUBLIC_DATA_SOURCE = "fixture";
    const kyiv = (await getCityPages()).find((page) => page.location.slug === "kyiv");
    expect(kyiv?.seo_status).toBe("review");
    const html = read("implant-calculator/kyiv/index.html");

    expect(html).toContain("Калькулятор вартості імплантації у Києві");
    expect(html).toContain("<title>Вартість імплантації у Києві — калькулятор і середні ціни | DENVA</title>");
    expect(html).toContain('name="robots" content="noindex, follow"');
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain("Середні ціни у місті");
    expect(html).toContain("Що може знадобитися додатково");

    const summary = summarizeCityPrices(kyiv!);
    for (const row of summary.rows) {
      for (const value of Object.values(row.values)) {
        expect(value, `${row.id} must be computable from the fixture`).not.toBeNull();
        expect(html).toContain(formatUah(value as number));
      }
    }

    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    expect(blocks.length).toBeGreaterThan(0);
    const types = blocks.flatMap((b) => (b["@graph"] as Array<{ "@type": string }>).map((n) => n["@type"]));
    expect(types).toEqual(expect.arrayContaining(["BreadcrumbList", "WebPage", "Organization"]));
    expect(types).not.toEqual(expect.arrayContaining(["Product"]));
  });

  it("sitemap.xml has no review/draft cities; robots.txt blocks /admin/ and points to the sitemap", () => {
    const sitemap = read("sitemap.xml");
    expect(sitemap).toContain("/implant-calculator/</loc>");
    expect(sitemap).toContain("/implant-calculator/methodology/</loc>");
    expect(sitemap).not.toContain("/kyiv/");
    const robots = read("robots.txt");
    expect(robots).toContain("Disallow: /admin/");
    expect(robots).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  it("the catalog and methodology are indexable with a self-canonical", () => {
    for (const file of ["implant-calculator/index.html", "implant-calculator/methodology/index.html"]) {
      const html = read(file);
      expect(html).toContain('name="robots" content="index, follow"');
      expect(html).toMatch(/rel="canonical" href="https?:\/\/[^"]+\/implant-calculator\/(methodology\/)?"/);
    }
  });

  it("/ and /calculator/ canonicalise to the catalog with a meta refresh and a visible link", () => {
    for (const file of ["index.html", "calculator/index.html"]) {
      const html = read(file);
      expect(html).toMatch(/rel="canonical" href="https?:\/\/[^"]+\/implant-calculator\/"/);
      expect(html).toMatch(/http-equiv="refresh" content="0; url=[^"]*\/implant-calculator\/"/);
      expect(html).toMatch(/<a [^>]*href="[^"]*\/implant-calculator\/"/);
    }
  });

  it("unknown slugs have no page (static 404)", () => {
    expect(existsSync(path.join(OUT, "implant-calculator/atlantis/index.html"))).toBe(false);
    expect(existsSync(path.join(OUT, "404.html"))).toBe(true);
  });
});
