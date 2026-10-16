import type { Metadata } from "next";
import type { CityPageData, SeoStatus } from "@/lib/contracts";
import { rowRange, summarizeCityPrices, type CityPriceSummary } from "./prices";
import { absoluteUrl, CATALOG_PATH, cityPath, METHODOLOGY_PATH, SITE_NAME } from "./site";
import { formatDateUk, formatUah, inCity } from "./text";

/** Explicit locative form of the city name, if the database provides one (`content.name_locative`). */
export function explicitLocative(page: CityPageData): string | null {
  const value = (page.content as { name_locative?: unknown }).name_locative;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function cityInPhrase(page: CityPageData): string {
  return inCity(page.location, explicitLocative(page));
}

/** ТЗ §11.3: only `published` is indexable. Everything else is noindex,follow. */
export function robotsForStatus(status: SeoStatus): NonNullable<Metadata["robots"]> {
  return status === "published" ? { index: true, follow: true } : { index: false, follow: true };
}

/** Absolute self-canonical ONLY for published pages (ТЗ §11.6); otherwise none. */
export function canonicalForStatus(status: SeoStatus, path: string): string | undefined {
  return status === "published" ? absoluteUrl(path) : undefined;
}

/** ТЗ §11.6 title. */
export function cityTitle(page: CityPageData): string {
  return `Вартість імплантації ${cityInPhrase(page)} — калькулятор і середні ціни | ${SITE_NAME}`;
}

/** ТЗ §11.6 H1. */
export function cityH1(page: CityPageData): string {
  return `Калькулятор вартості імплантації ${cityInPhrase(page)}`;
}

/** Unique description: city, scenario ranges and the data date (ТЗ §11.6). */
export function cityDescription(page: CityPageData, summary: CityPriceSummary = summarizeCityPrices(page)): string {
  const where = cityInPhrase(page);
  const oneTooth = summary.rows.find((row) => row.id === "one-tooth");
  const allOn4 = summary.rows.find((row) => row.id === "aox4-first");
  const one = oneTooth ? rowRange(oneTooth) : null;
  const aox = allOn4 ? rowRange(allOn4) : null;
  const date = formatDateUk(summary.meta?.dataDate ?? page.updated_at);
  const parts: string[] = [`Орієнтовна вартість імплантації ${where}`];
  const scenarios: string[] = [];
  if (one) scenarios.push(`один зуб — ${formatUah(one.min)}–${formatUah(one.max)}`);
  if (aox) scenarios.push(`All-on-4 (перший етап, одна щелепа) — ${formatUah(aox.min)}–${formatUah(aox.max)}`);
  const head = scenarios.length ? `${parts[0]}: ${scenarios.join("; ")}.` : `${parts[0]}.`;
  const tail = [date ? `Дані станом на ${date}.` : "", "Калькулятор без реєстрації та телефону."].filter(Boolean).join(" ");
  return `${head} ${tail}`;
}

function openGraph(title: string, description: string, url: string | undefined): NonNullable<Metadata["openGraph"]> {
  return { title, description, url, locale: "uk_UA", type: "website", siteName: SITE_NAME };
}

export function buildCityMetadata(page: CityPageData): Metadata {
  const status = page.seo_status;
  const path = cityPath(page.location.slug);
  const canonical = canonicalForStatus(status, path);
  if (status === "removed") {
    const title = { absolute: `${page.location.name}: місто більше не підтримується | ${SITE_NAME}` };
    const description = `Калькулятор вартості імплантації більше не підтримує місто ${page.location.name}. Перегляньте міста, для яких доступні актуальні ціни.`;
    return { title, description, robots: robotsForStatus(status) };
  }
  const title = cityTitle(page);
  const description = cityDescription(page);
  return {
    title: { absolute: title },
    description,
    robots: robotsForStatus(status),
    alternates: canonical ? { canonical } : undefined,
    openGraph: openGraph(title, description, canonical),
  };
}

export const CATALOG_TITLE = "Калькулятор вартості імплантації за містами України";
export const CATALOG_DESCRIPTION =
  "Орієнтовна ринкова вартість імплантації за містами України: мінімальний, класичний і преміальний рівні, окремий розрахунок верхньої й нижньої щелепи. Без реєстрації та телефону.";

export function catalogMetadata(): Metadata {
  const canonical = absoluteUrl(CATALOG_PATH);
  return {
    title: { absolute: `${CATALOG_TITLE} | ${SITE_NAME}` },
    description: CATALOG_DESCRIPTION,
    robots: robotsForStatus("published"),
    alternates: { canonical },
    openGraph: openGraph(CATALOG_TITLE, CATALOG_DESCRIPTION, canonical),
  };
}

export const METHODOLOGY_TITLE = "Методологія калькулятора вартості імплантації";
export const METHODOLOGY_DESCRIPTION =
  "Як DENVA рахує орієнтовну вартість імплантації: формули для одного зуба, кількох зубів і All-on-4/6/8, джерела цін, медіана за прайсами клінік, обмеження та застереження.";

export function methodologyMetadata(): Metadata {
  const canonical = absoluteUrl(METHODOLOGY_PATH);
  return {
    title: { absolute: `${METHODOLOGY_TITLE} | ${SITE_NAME}` },
    description: METHODOLOGY_DESCRIPTION,
    robots: robotsForStatus("published"),
    alternates: { canonical },
    openGraph: openGraph(METHODOLOGY_TITLE, METHODOLOGY_DESCRIPTION, canonical),
  };
}

/**
 * `/` and `/calculator/`: static hosts have no redirects → canonical to the catalog + meta refresh
 * (rendered by RedirectNotice). Deliberately NOT noindex: a noindex next to a cross-page canonical
 * is a conflicting signal, and these URLs used to be the calculator itself.
 */
export function redirectMetadata(): Metadata {
  return {
    title: { absolute: `Калькулятор імплантації | ${SITE_NAME}` },
    description: CATALOG_DESCRIPTION,
    alternates: { canonical: absoluteUrl(CATALOG_PATH) },
  };
}
