import Link from "next/link";
import { PATIENT_TIERS, type PatientTier } from "@/lib/contracts";
import type { CityPriceSummary } from "@/lib/seo/prices";
import { METHODOLOGY_PATH } from "@/lib/seo/site";
import { formatDateUk, formatUah } from "@/lib/seo/text";
import { Section } from "./SeoChrome";

const TIER_LABEL: Record<PatientTier, string> = {
  minimum: "Мінімальний",
  classic: "Класичний",
  premium: "Преміальний",
};

/** Server-rendered "Середні ціни у місті" (ТЗ §11.2): lives in the initial HTML, no client fetch. */
export function CityPriceBlock({ summary, cityName }: { summary: CityPriceSummary; cityName: string }) {
  const { meta } = summary;
  if (!meta) {
    return (
      <Section id="prices" title="Середні ціни у місті">
        <p>Для міста {cityName} даних про ціни поки недостатньо — ми не показуємо суму, яку не можемо підтвердити.</p>
      </Section>
    );
  }
  const date = formatDateUk(meta.dataDate);
  return (
    <Section id="prices" title="Середні ціни у місті">
      <p>
        Орієнтовні середні ринкові ціни для однієї щелепи в трьох рівнях. У кожному рядку всі компоненти взято з одного рівня; в
        калькуляторі рівень імпланта й коронки можна поєднувати.
      </p>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[15px]" data-testid="city-price-table">
          <caption className="sr-only">Середні ціни на імплантацію у місті {cityName} за рівнями</caption>
          <thead>
            <tr className="border-b border-line-strong text-sm text-muted">
              <th scope="col" className="py-2 pr-3 font-bold">
                Сценарій
              </th>
              {PATIENT_TIERS.map((tier) => (
                <th key={tier} scope="col" className="px-2 py-2 text-right font-bold">
                  {TIER_LABEL[tier]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.id} className="border-b border-line align-top">
                <th scope="row" className="py-3 pr-3 font-bold text-ink">
                  {row.label}
                  <span className="mt-0.5 block text-sm font-normal text-muted">{row.hint}</span>
                </th>
                {PATIENT_TIERS.map((tier) => {
                  const value = row.values[tier];
                  return (
                    <td key={tier} className="tabular whitespace-nowrap px-2 py-3 text-right font-bold text-ink">
                      {value === null ? <span title="Даних поки недостатньо">—</span> : formatUah(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!summary.complete && <p className="text-sm text-muted">«—» означає, що даних для цього сценарію поки недостатньо.</p>}
      <ul className="space-y-1 text-[15px]">
        {date && (
          <li>
            Дані станом на <time dateTime={meta.dataDate.slice(0, 10)}>{date}</time>.
          </li>
        )}
        <li>
          {meta.sourceText}. Перевірених клінік міста у вибірці: {meta.localClinicCount}.
        </li>
        {meta.isDemo && <li className="font-bold text-warn">Демонстраційні дані: ціни не є реальними.</li>}
      </ul>
      <p className="text-sm text-muted">
        Назви клінік не наводяться. Остаточну схему та вартість визначає лікар після консультації та КТ.{" "}
        <Link href={METHODOLOGY_PATH} className="font-bold text-brand underline-offset-2 hover:underline">
          Як ми рахуємо
        </Link>
      </p>
    </Section>
  );
}
