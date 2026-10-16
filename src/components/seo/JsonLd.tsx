import { serializeJsonLd, type JsonLdNode } from "@/lib/seo/jsonld";

/** Inline JSON-LD, rendered into the static HTML. */
export function JsonLd({ data }: { data: JsonLdNode }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
