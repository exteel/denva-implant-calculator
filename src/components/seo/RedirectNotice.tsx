import Link from "next/link";
import { CATALOG_PATH, withBasePath } from "@/lib/seo/site";
import { Container, SeoHeader } from "./SeoChrome";

/**
 * `/` and `/calculator/` (static host, no real redirects): canonical to the
 * catalog (via metadata), an instant meta refresh and a visible link.
 */
export function RedirectNotice() {
  return (
    <>
      {/* React 19 hoists <meta> into <head>. */}
      <meta httpEquiv="refresh" content={`0; url=${withBasePath(CATALOG_PATH)}`} />
      <SeoHeader />
      <main>
        <Container className="py-16">
          <h1 className="text-2xl font-extrabold text-ink">Калькулятор імплантації переїхав</h1>
          <p className="mt-3 text-ink-soft">
            Зараз ви будете перенаправлені автоматично. Якщо цього не сталося, перейдіть за{" "}
            <Link href={CATALOG_PATH} className="font-bold text-brand underline-offset-2 hover:underline">
              посиланням на калькулятор вартості імплантації
            </Link>
            .
          </p>
        </Container>
      </main>
    </>
  );
}
