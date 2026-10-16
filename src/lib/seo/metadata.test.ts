import { describe, expect, it } from "vitest";
import type { SeoStatus } from "@/lib/contracts";
import { buildCityMetadata, canonicalForStatus, cityDescription, cityH1, cityTitle, redirectMetadata, robotsForStatus } from "./metadata";
import { absoluteUrl, SITE_URL } from "./site";
import { inCity } from "./text";
import { makeCityPage } from "./test-utils";

describe("robots per status (ТЗ §11.3)", () => {
  it("indexes only published pages", () => {
    expect(robotsForStatus("published")).toEqual({ index: true, follow: true });
    for (const status of ["review", "stale", "removed", "draft"] as SeoStatus[]) {
      expect(robotsForStatus(status)).toEqual({ index: false, follow: true });
    }
  });
});

describe("canonical per status", () => {
  it("is an absolute self-canonical only for published", () => {
    expect(canonicalForStatus("published", "/implant-calculator/lviv/")).toBe(`${SITE_URL}/implant-calculator/lviv/`);
    expect(canonicalForStatus("published", "/implant-calculator/lviv/")).toMatch(/^https?:\/\//);
    for (const status of ["review", "stale", "removed", "draft"] as SeoStatus[]) {
      expect(canonicalForStatus(status, "/implant-calculator/lviv/")).toBeUndefined();
    }
  });
});

describe("buildCityMetadata", () => {
  it("published: index,follow + self canonical + ТЗ §11.6 title", () => {
    const meta = buildCityMetadata(makeCityPage("published"));
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.alternates?.canonical).toBe(absoluteUrl("/implant-calculator/lviv/"));
    expect(meta.title).toEqual({ absolute: "Вартість імплантації у Львові — калькулятор і середні ціни | DENVA" });
  });

  it("review and stale: noindex,follow without canonical", () => {
    for (const status of ["review", "stale"] as SeoStatus[]) {
      const meta = buildCityMetadata(makeCityPage(status));
      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(meta.alternates).toBeUndefined();
    }
  });

  it("removed: noindex page about an unsupported city", () => {
    const meta = buildCityMetadata(makeCityPage("removed"));
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toBeUndefined();
    expect(JSON.stringify(meta.title)).toContain("більше не підтримується");
  });

  it("description names the city, the scenarios and the data date", () => {
    const description = cityDescription(makeCityPage());
    expect(description).toContain("у Львові");
    expect(description).toContain("один зуб");
    expect(description).toContain("All-on-4");
    expect(description).toContain("8 жовтня 2026");
  });

  it("falls back to a text without numbers when there are no prices", () => {
    const description = cityDescription(makeCityPage("review", { prices: [] }));
    expect(description).not.toMatch(/₴/);
    expect(description).toContain("Орієнтовна вартість імплантації у Львові");
  });
});

describe("city names", () => {
  it("uses a known locative, an explicit one, or the 'у місті' fallback", () => {
    expect(inCity({ name: "Київ" })).toBe("у Києві");
    expect(inCity({ name: "Одеса" })).toBe("в Одесі");
    expect(inCity({ name: "Умань" })).toBe("в Умані");
    expect(inCity({ name: "Тростянець" })).toBe("у місті Тростянець");
    expect(inCity({ name: "Тростянець" }, "Тростянці")).toBe("у Тростянці");
    const page = makeCityPage("published", { location: { ...makeCityPage().location, name: "Тростянець", slug: "trostianets" } });
    expect(cityH1(page)).toBe("Калькулятор вартості імплантації у місті Тростянець");
    expect(cityTitle(page)).toBe("Вартість імплантації у місті Тростянець — калькулятор і середні ціни | DENVA");
  });
});

describe("redirect pages", () => {
  it("canonicalise to the catalog without a conflicting noindex", () => {
    const meta = redirectMetadata();
    expect(meta.alternates?.canonical).toBe(absoluteUrl("/implant-calculator/"));
    expect(meta.robots).toBeUndefined();
  });
});
