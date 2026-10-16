import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { makeCityPage } from "@/lib/seo/test-utils";
import { formatUah } from "@/lib/seo/text";
import { CityPage } from "./CityPage";

vi.mock("@/components/calculator/CalculatorApp", () => ({
  CalculatorApp: ({ initialLocation, embedded }: { initialLocation?: { name: string }; embedded?: boolean }) => (
    <div data-testid="calc">calc:{initialLocation?.name}{embedded ? ":embedded" : ""}</div>
  ),
}));

const render = (status: Parameters<typeof makeCityPage>[0], overrides: Parameters<typeof makeCityPage>[1] = {}) => {
  const page = makeCityPage(status, overrides);
  return renderToStaticMarkup(<CityPage page={page} published={[page]} />);
};

describe("CityPage (static HTML)", () => {
  it("renders H1, intro, price numbers, additional costs, FAQ and reviewer in the HTML", () => {
    const html = render("published");
    expect(html).toContain("<h1");
    expect(html).toContain("Калькулятор вартості імплантації у Львові");
    expect(html).toContain("Власний вступ про Львів.");
    expect(html).toContain("Середні ціни у місті");
    expect(html).toContain(formatUah(36500));
    expect(html).toContain(formatUah(268200));
    expect(html).toContain("Що може знадобитися додатково");
    expect(html).toContain(formatUah(900));
    expect(html).toContain("Скільки триває приживлення?");
    expect(html).toContain("Іван Петренко");
    expect(html).toContain("calc:Львів");
    expect(html).toContain("min-h-[720px]");
    expect(html).toContain("application/ld+json");
    expect(html).toContain("FAQPage");
  });

  it("hides the FAQ block and FAQPage JSON-LD when the FAQ is empty", () => {
    const page = makeCityPage("published");
    const html = renderToStaticMarkup(<CityPage page={{ ...page, content: { ...page.content, faq: [] } }} published={[page]} />);
    expect(html).not.toContain("Часті запитання");
    expect(html).not.toContain("FAQPage");
  });

  it("shows the update notice for stale pages only", () => {
    expect(render("stale")).toContain("Дані оновлюються");
    expect(render("published")).not.toContain("Дані оновлюються");
  });

  it("removed: no calculator, a link to the catalog", () => {
    const html = render("removed");
    expect(html).toContain("більше не підтримується");
    expect(html).not.toContain("calc:");
    expect(html).toContain("/implant-calculator/");
  });

  it("links to other published cities but not to itself", () => {
    const lviv = makeCityPage("published");
    const other = makeCityPage("published", { location: { ...lviv.location, slug: "poltava", name: "Полтава" } });
    const html = renderToStaticMarkup(<CityPage page={lviv} published={[lviv, other]} />);
    // next/link adds the trailing slash from next.config (trailingSlash) at build time only.
    expect(html).toContain('href="/implant-calculator/poltava');
    expect(html).not.toContain('href="/implant-calculator/lviv');
  });
  it("owns the landmarks: one site header and one <main> around the embedded calculator", () => {
    const html = render("published");
    expect(html).toContain("calc:Львів:embedded");
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html.indexOf("<main")).toBeLessThan(html.indexOf("calc:Львів"));
    expect(html.indexOf("calc:Львів")).toBeLessThan(html.indexOf("</main>"));
  });
});
