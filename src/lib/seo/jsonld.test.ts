import { describe, expect, it } from "vitest";
import { cityJsonLd, faqNode, serializeJsonLd } from "./jsonld";
import { absoluteUrl } from "./site";
import { makeCityPage } from "./test-utils";

const meta = { title: "Тест", description: "Опис" };

function types(data: Record<string, unknown>): string[] {
  return (data["@graph"] as Array<{ "@type": string }>).map((node) => node["@type"]);
}

describe("cityJsonLd", () => {
  it("emits Organization, BreadcrumbList, WebPage and FAQPage when the FAQ is non-empty", () => {
    const data = cityJsonLd(makeCityPage(), meta);
    expect(types(data)).toEqual(["Organization", "BreadcrumbList", "WebPage", "FAQPage"]);
  });

  it("omits FAQPage when there is no FAQ", () => {
    const page = makeCityPage("published");
    const data = cityJsonLd({ ...page, content: { ...page.content, faq: [] } }, meta);
    expect(types(data)).not.toContain("FAQPage");
  });

  it("never emits Product, AggregateRating or MedicalClinic", () => {
    const text = JSON.stringify(cityJsonLd(makeCityPage(), meta));
    for (const forbidden of ["Product", "AggregateRating", "MedicalClinic", "LocalBusiness"]) expect(text).not.toContain(forbidden);
  });

  it("breadcrumbs go Головна → Калькулятор імплантації → місто with absolute URLs", () => {
    const data = cityJsonLd(makeCityPage(), meta);
    const crumbs = (data["@graph"] as Array<Record<string, unknown>>).find((n) => n["@type"] === "BreadcrumbList");
    const items = crumbs?.itemListElement as Array<{ position: number; name: string; item: string }>;
    expect(items.map((i) => i.name)).toEqual(["Головна", "Калькулятор імплантації", "Львів"]);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[2].item).toBe(absoluteUrl("/implant-calculator/lviv/"));
  });

  it("describes DENVA as an Organization and carries the reviewer on the WebPage", () => {
    const graph = cityJsonLd(makeCityPage(), meta)["@graph"] as Array<Record<string, unknown>>;
    expect(graph.find((n) => n["@type"] === "Organization")?.name).toBe("DENVA");
    const webPage = graph.find((n) => n["@type"] === "WebPage");
    expect(webPage?.reviewedBy).toMatchObject({ "@type": "Person", name: "Іван Петренко" });
    expect(webPage?.lastReviewed).toBe("2026-10-05");
  });
});

describe("faqNode", () => {
  it("returns null for an empty or blank FAQ", () => {
    expect(faqNode([])).toBeNull();
    expect(faqNode([{ q: " ", a: "x" }])).toBeNull();
  });
});

describe("serializeJsonLd", () => {
  it("cannot be broken out of the script tag", () => {
    const json = serializeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).text).toBe("</script><script>alert(1)</script>");
  });
});
