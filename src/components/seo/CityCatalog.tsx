import Link from "next/link";
import type { CityPageData } from "@/lib/contracts";
import { cityPath } from "@/lib/seo/site";

/**
 * Plain-HTML catalog of PUBLISHED cities (ТЗ §11.7): ordinary <a> links with
 * descriptive anchors, grouped by oblast, no search field required to reach a city.
 */
export function CityCatalog({ cities }: { cities: readonly CityPageData[] }) {
  if (cities.length === 0) {
    return (
      <p className="leading-relaxed text-ink-soft" data-testid="catalog-empty">
        Сторінки міст з’являться тут після редакційної перевірки. Калькулятор нижче вже працює: оберіть місто зі списку, щоб отримати
        орієнтовну суму.
      </p>
    );
  }
  const groups = new Map<string, CityPageData[]>();
  for (const city of cities) {
    const key = city.location.region_name ?? "Інші міста";
    groups.set(key, [...(groups.get(key) ?? []), city]);
  }
  return (
    <div className="space-y-5" data-testid="city-catalog">
      {[...groups]
        .sort(([a], [b]) => a.localeCompare(b, "uk"))
        .map(([region, list]) => (
          <div key={region}>
            <h3 className="font-bold text-ink">{region}</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {list.map((city) => (
                <li key={city.location.slug}>
                  <Link
                    href={cityPath(city.location.slug)}
                    className="inline-flex min-h-10 items-center rounded-full border border-line-strong bg-paper px-4 text-[15px] font-bold text-ink-soft hover:border-brand hover:text-brand"
                  >
                    {`Вартість імплантації — ${city.location.name}`}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
