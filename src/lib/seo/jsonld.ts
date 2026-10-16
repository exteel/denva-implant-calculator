import type { CityPageData } from "@/lib/contracts";
import { absoluteUrl, CATALOG_PATH, cityPath, METHODOLOGY_PATH, SITE_NAME, SITE_URL } from "./site";

/**
 * JSON-LD builders (ТЗ §11.6). Generated from the same data as the visible
 * HTML. Never Product / AggregateRating / MedicalClinic: DENVA is a price
 * calculator, not a clinic.
 */

export type JsonLdNode = Record<string, unknown>;

export interface Crumb {
  name: string;
  /** Site path ("/implant-calculator/kyiv/") or an absolute URL. */
  path: string;
}

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export function organizationNode(): JsonLdNode {
  return { "@type": "Organization", "@id": ORGANIZATION_ID, name: SITE_NAME, url: `${SITE_URL}/` };
}

export function breadcrumbNode(crumbs: readonly Crumb[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: /^https?:\/\//.test(crumb.path) ? crumb.path : absoluteUrl(crumb.path),
    })),
  };
}

export interface WebPageInput {
  path: string;
  name: string;
  description: string;
  dateModified?: string | null;
  reviewedBy?: { name: string; url?: string | null } | null;
  lastReviewed?: string | null;
}

export function webPageNode(input: WebPageInput): JsonLdNode {
  const url = absoluteUrl(input.path);
  const node: JsonLdNode = {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: input.name,
    description: input.description,
    inLanguage: "uk",
    publisher: { "@id": ORGANIZATION_ID },
  };
  if (input.dateModified) node.dateModified = input.dateModified;
  if (input.reviewedBy?.name) {
    node.reviewedBy = { "@type": "Person", name: input.reviewedBy.name, ...(input.reviewedBy.url ? { url: input.reviewedBy.url } : {}) };
    if (input.lastReviewed) node.lastReviewed = input.lastReviewed;
  }
  return node;
}

/** FAQPage only from non-empty, fully visible Q&A; null otherwise. */
export function faqNode(faq: ReadonlyArray<{ q: string; a: string }>): JsonLdNode | null {
  const items = faq.filter((item) => item.q.trim() && item.a.trim());
  if (items.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function graph(nodes: ReadonlyArray<JsonLdNode | null>): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes.filter((node): node is JsonLdNode => node !== null) };
}

export const HOME_CRUMB: Crumb = { name: "Головна", path: "/" };
export const CATALOG_CRUMB: Crumb = { name: "Калькулятор імплантації", path: CATALOG_PATH };

export function cityJsonLd(page: CityPageData, meta: { title: string; description: string }): JsonLdNode {
  const path = cityPath(page.location.slug);
  return graph([
    organizationNode(),
    breadcrumbNode([HOME_CRUMB, CATALOG_CRUMB, { name: page.location.name, path }]),
    webPageNode({
      path,
      name: meta.title,
      description: meta.description,
      dateModified: page.updated_at,
      reviewedBy: page.content.reviewer_name ? { name: page.content.reviewer_name, url: page.content.reviewer_url } : null,
      lastReviewed: page.content.reviewed_at,
    }),
    faqNode(page.content.faq),
  ]);
}

export function catalogJsonLd(meta: { title: string; description: string }): JsonLdNode {
  return graph([
    organizationNode(),
    breadcrumbNode([HOME_CRUMB, CATALOG_CRUMB]),
    webPageNode({ path: CATALOG_PATH, name: meta.title, description: meta.description }),
  ]);
}

export function methodologyJsonLd(meta: { title: string; description: string; dateModified: string }): JsonLdNode {
  return graph([
    organizationNode(),
    breadcrumbNode([HOME_CRUMB, CATALOG_CRUMB, { name: "Методологія", path: METHODOLOGY_PATH }]),
    webPageNode({ path: METHODOLOGY_PATH, name: meta.title, description: meta.description, dateModified: meta.dateModified }),
  ]);
}

/** Safe for inline <script>: "<" is escaped so "</script>" in editable text cannot break out. */
export function serializeJsonLd(data: JsonLdNode): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}
