import Link from "next/link";
import type { CityPageData } from "@/lib/contracts";
import { additionalCostGroups, includedComponents } from "@/lib/seo/prices";
import { CATALOG_PATH, cityPath, METHODOLOGY_PATH } from "@/lib/seo/site";
import { formatDateUk, formatUah } from "@/lib/seo/text";
import { Paragraphs, Section } from "./SeoChrome";

/** «Що входить у розрахунок»: the ТЗ §4 composition, plus the catalog's own `included_text`. */
export function IncludedBlock({ page }: { page: CityPageData }) {
  const components = includedComponents(page.services);
  return (
    <Section id="included" title="Що входить у розрахунок">
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <b className="text-ink">Один зуб:</b> імплант, формувач ясен, цифрове сканування щелепи, супраструктура та коронка.
        </li>
        <li>
          <b className="text-ink">Від 2 до 6 зубів:</b> кількість імплантів залежить від розташування зубів (наприклад, для двох–чотирьох зубів
          поспіль — два імпланти, для п’яти–шести — три); сканування — один раз на щелепу, коронка — на кожен зуб.
        </li>
        <li>
          <b className="text-ink">Від 7 до 14 зубів:</b> порівнюються сегментне відновлення мостами (4 імпланти) та All-on-4, All-on-6 і
          All-on-8. Жоден варіант не є медичною рекомендацією.
        </li>
        <li>
          <b className="text-ink">All-on-4/6/8:</b> перший етап (імпланти, мультиюніти, тимчасова конструкція, сканування), постійна конструкція та
          повторне сканування.
        </li>
      </ul>
      {components.length > 0 && (
        <>
          <p className="pt-1 font-bold text-ink">Склад основних позицій у цінах міста</p>
          <ul className="space-y-1.5 text-[15px]">
            {components.map((component) => (
              <li key={component.name}>
                <b className="text-ink">{component.name}:</b> {component.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

/** ТЗ §5.5 / §11.2: possible extra costs with city prices; never part of a total. */
export function AdditionalCostsBlock({ page }: { page: CityPageData }) {
  const groups = additionalCostGroups(page);
  if (groups.length === 0) return null;
  return (
    <Section id="additional" title="Що може знадобитися додатково">
      <p>
        Ці послуги не входять у розрахунок і не додаються до підсумку. Чи потрібні вони, визначає лікар після діагностики; ціни — середні по
        місту.
      </p>
      {groups.map((group) => (
        <div key={group.category}>
          <h3 className="font-bold text-ink">{group.category}</h3>
          <ul className="mt-1 divide-y divide-line text-[15px]">
            {group.items.map((item) => (
              <li key={item.code} className="flex items-baseline justify-between gap-4 py-2">
                <span>
                  {item.name} <span className="text-muted">· {item.unit}</span>
                </span>
                <span className="tabular whitespace-nowrap font-bold text-ink">{formatUah(item.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}

export function MethodologySummary() {
  return (
    <Section id="methodology" title="Як ми рахуємо">
      <p>
        Калькулятор не зберігає ціни у коді: він читає опубліковані міські орієнтири. Якщо у місті є три й більше перевірених прайсів клінік,
        ціна — медіана цих прайсів; якщо один або два — вони змішуються з базовим орієнтиром (місто, потім область, потім Україна); без
        локальних прайсів показується базовий орієнтир. Одна клініка (або мережа з однаковим прайсом) має один голос.
      </p>
      <p>
        <Link href={METHODOLOGY_PATH} className="font-bold text-brand underline-offset-2 hover:underline">
          Повна методологія: формули, джерела та обмеження
        </Link>
      </p>
    </Section>
  );
}

export function LocalNotesBlock({ page, inCity }: { page: CityPageData; inCity: string }) {
  if (!page.content.local_notes) return null;
  return (
    <Section id="local" title={`Особливості ринку ${inCity}`}>
      <Paragraphs text={page.content.local_notes} />
    </Section>
  );
}

/** Visible local FAQ — the only source of the FAQPage JSON-LD. */
export function FaqBlock({ page, inCity }: { page: CityPageData; inCity: string }) {
  const { faq } = page.content;
  if (faq.length === 0) return null;
  return (
    <Section id="faq" title={`Часті запитання ${inCity}`}>
      <div className="space-y-4">
        {faq.map((item) => (
          <div key={item.q}>
            <h3 className="font-bold text-ink">{item.q}</h3>
            <p className="mt-1 whitespace-pre-line">{item.a}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Reviewer, review date and the date of the data (ТЗ §11.2). */
export function ReviewerBlock({ page }: { page: CityPageData }) {
  const { reviewer_name: name, reviewer_url: url, reviewed_at: reviewedAt } = page.content;
  const reviewed = formatDateUk(reviewedAt);
  const updated = formatDateUk(page.updated_at);
  if (!name && !reviewed && !updated) return null;
  return (
    <aside aria-label="Редакційна перевірка" className="mt-10 rounded-[var(--radius-card)] border border-line bg-paper p-5 text-[15px] text-ink-soft">
      <p className="font-bold text-ink">Редакційна перевірка</p>
      {name && (
        <p className="mt-1">
          Профільний рецензент:{" "}
          {url ? (
            <a href={url} rel="noopener" className="font-bold text-brand underline-offset-2 hover:underline">
              {name}
            </a>
          ) : (
            <b className="text-ink">{name}</b>
          )}
        </p>
      )}
      {reviewed && <p className="mt-1">Дата перевірки: {reviewed}</p>}
      {updated && <p className="mt-1">Сторінку оновлено: {updated}</p>}
    </aside>
  );
}

const MAX_RELATED = 6;

/** Related published cities: same oblast first, capped — no mass cross-linking (ТЗ §11.2, §11.8). */
export function pickRelatedCities(current: CityPageData, published: readonly CityPageData[], limit = MAX_RELATED): CityPageData[] {
  const others = published.filter((page) => page.location.slug !== current.location.slug);
  const sameRegion = (page: CityPageData) =>
    current.location.region_id !== null && page.location.region_id === current.location.region_id ? 0 : 1;
  return [...others]
    .sort((a, b) => sameRegion(a) - sameRegion(b) || a.location.name.localeCompare(b.location.name, "uk"))
    .slice(0, limit);
}

export function RelatedCities({ cities }: { cities: readonly CityPageData[] }) {
  return (
    <Section id="other-cities" title="Калькулятор в інших містах">
      {cities.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {cities.map((city) => (
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
      )}
      <p>
        <Link href={CATALOG_PATH} className="font-bold text-brand underline-offset-2 hover:underline">
          Усі міста калькулятора
        </Link>
      </p>
    </Section>
  );
}
