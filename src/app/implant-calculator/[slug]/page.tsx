import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityPage } from "@/components/seo/CityPage";
import { getCityPage, getCityPages, publishedOnly } from "@/lib/seo/data";
import { buildCityMetadata } from "@/lib/seo/metadata";

// Static export: only the slugs returned below exist; everything else is the static 404.
export const dynamicParams = false;

const NO_CITIES_SLUG = "_";

interface Params {
  slug: string;
}

/** Cities with status review / published / stale / removed (draft cities have no page at all). */
export async function generateStaticParams(): Promise<Params[]> {
  const pages = await getCityPages();
  // `output: "export"` rejects an empty list ("missing generateStaticParams"). With no cities (no
  // Supabase env, or every city still a draft) emit one placeholder path; CityRoute answers it
  // with notFound(), so it is never a real page.
  return pages.length > 0 ? pages.map((page) => ({ slug: page.location.slug })) : [{ slug: NO_CITIES_SLUG }];
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const page = await getCityPage((await params).slug);
  return page ? buildCityMetadata(page) : {};
}

export default async function CityRoute({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const [page, pages] = await Promise.all([getCityPage(slug), getCityPages()]);
  if (!page) notFound();
  return <CityPage page={page} published={publishedOnly(pages)} />;
}
