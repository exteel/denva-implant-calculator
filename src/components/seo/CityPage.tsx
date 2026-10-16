import Link from "next/link";
import { CalculatorApp } from "@/components/calculator/CalculatorApp";
import type { CityPageData } from "@/lib/contracts";
import { cityDescription, cityH1, cityInPhrase, cityTitle } from "@/lib/seo/metadata";
import { cityJsonLd } from "@/lib/seo/jsonld";
import { summarizeCityPrices } from "@/lib/seo/prices";
import { CATALOG_PATH } from "@/lib/seo/site";
import { Breadcrumbs } from "./Breadcrumbs";
import { CalculatorIsland } from "./CalculatorIsland";
import { CityPriceBlock } from "./CityPriceBlock";
import {
  AdditionalCostsBlock,
  FaqBlock,
  IncludedBlock,
  LocalNotesBlock,
  MethodologySummary,
  pickRelatedCities,
  RelatedCities,
  ReviewerBlock,
} from "./CityContentBlocks";
import { JsonLd } from "./JsonLd";
import { Container, Paragraphs, SeoFooter, SeoHeader } from "./SeoChrome";

/** `removed` (ТЗ §11.3): noindex page; 301/410 are impossible on GitHub Pages. */
export function RemovedCityPage({ page }: { page: CityPageData }) {
  // TODO(custom domain): replace this page with a 301 to the oblast page (or 410 if there is no replacement).
  const { name, region_name: region } = page.location;
  return (
    <>
      <SeoHeader />
      <main>
        <Container className="pt-6 pb-16">
          <Breadcrumbs trail={[{ name }]} />
          <h1 className="mt-5 text-3xl leading-tight font-extrabold text-ink">Місто {name} більше не підтримується</h1>
          <p className="mt-4 leading-relaxed text-ink-soft">
            Калькулятор більше не показує ціни на імплантацію для міста {name}
            {region ? ` (${region})` : ""}: актуальних даних для нього немає. Оберіть інше місто в каталозі — там зібрані всі міста, для яких
            доступні перевірені ринкові орієнтири.
          </p>
          <p className="mt-6">
            <Link href={CATALOG_PATH} className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 text-[15px] font-bold text-white hover:bg-brand-dark">
              Каталог міст калькулятора
            </Link>
          </p>
        </Container>
      </main>
      <SeoFooter />
    </>
  );
}

/** ТЗ §11.2: the full city page. Everything but the calculator is server-rendered. */
export function CityPage({ page, published }: { page: CityPageData; published: readonly CityPageData[] }) {
  if (page.seo_status === "removed") return <RemovedCityPage page={page} />;

  const summary = summarizeCityPrices(page);
  const inCity = cityInPhrase(page);
  const intro = page.content.intro;
  const jsonLd = cityJsonLd(page, { title: cityTitle(page), description: cityDescription(page, summary) });

  // The calculator is `embedded`: it renders neither the site header nor a <main>, so the page owns both.
  return (
    <>
      <JsonLd data={jsonLd} />
      <SeoHeader />
      <main>
      <Container className="pt-5">
        <Breadcrumbs trail={[{ name: page.location.name }]} />
        <h1 className="mt-5 text-3xl leading-tight font-extrabold text-ink sm:text-4xl">{cityH1(page)}</h1>
        {page.seo_status === "stale" && (
          <p role="status" className="mt-4 rounded-2xl border border-warn-line bg-warn-soft p-4 text-[15px] font-bold text-warn">
            Дані оновлюються. Ціни для цього міста можуть бути неактуальними — ми перевіряємо джерела.
          </p>
        )}
        {intro && (
          <div className="mt-4 space-y-3 text-lg leading-relaxed text-ink-soft">
            <Paragraphs text={intro} />
          </div>
        )}
      </Container>

      <CalculatorIsland>
        <CalculatorApp initialLocation={page.location} embedded />
      </CalculatorIsland>

      <Container className="pb-16">
        <CityPriceBlock summary={summary} cityName={page.location.name} />
        <IncludedBlock page={page} />
        <AdditionalCostsBlock page={page} />
        <LocalNotesBlock page={page} inCity={inCity} />
        <MethodologySummary />
        <FaqBlock page={page} inCity={inCity} />
        <ReviewerBlock page={page} />
        <RelatedCities cities={pickRelatedCities(page, published)} />
      </Container>
      </main>
      <SeoFooter />
    </>
  );
}
