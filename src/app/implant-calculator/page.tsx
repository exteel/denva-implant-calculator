import { CalculatorApp } from "@/components/calculator/CalculatorApp";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { CalculatorIsland } from "@/components/seo/CalculatorIsland";
import { CityCatalog } from "@/components/seo/CityCatalog";
import { MethodologySummary } from "@/components/seo/CityContentBlocks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Container, Section, SeoFooter, SeoHeader } from "@/components/seo/SeoChrome";
import { getPublishedCityPages } from "@/lib/seo/data";
import { catalogJsonLd } from "@/lib/seo/jsonld";
import { CATALOG_DESCRIPTION, CATALOG_TITLE, catalogMetadata } from "@/lib/seo/metadata";

export const metadata = catalogMetadata();

export default async function CatalogPage() {
  const cities = await getPublishedCityPages();
  return (
    <>
      <JsonLd data={catalogJsonLd({ title: CATALOG_TITLE, description: CATALOG_DESCRIPTION })} />
      {/* the calculator is `embedded` (no header, no <main>): the page owns both landmarks */}
      <SeoHeader />
      <main>
      <Container className="pt-5">
        <Breadcrumbs trail={[]} />
        <h1 className="mt-5 text-3xl leading-tight font-extrabold text-ink sm:text-4xl">{CATALOG_TITLE}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-soft">
          Дізнайтеся орієнтовну ринкову вартість імплантації у вашому місті: окремо для верхньої й нижньої щелепи, у трьох рівнях —
          мінімальному, класичному та преміальному. Без реєстрації та телефону; додаткові витрати показуємо окремо від суми.
        </p>
        <Section id="cities" title="Міста з актуальними цінами">
          <CityCatalog cities={cities} />
        </Section>
        <MethodologySummary />
      </Container>

      <CalculatorIsland>
        <CalculatorApp embedded />
      </CalculatorIsland>
      </main>
      <SeoFooter />
    </>
  );
}
