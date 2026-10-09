"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { priceExtras, priceScenario, scenarioIncluded } from "@/engine/price-engine";
import { SEGMENT_INFO, alignedPackage, isAlignedPackage } from "@/engine/segments";
import {
  CLINICAL_CONFIDENCE_LABEL,
  MARKET_CONFIDENCE_EXPLANATION,
  MARKET_CONFIDENCE_LABEL,
  MIN_LOCAL_OBSERVATIONS,
} from "@/engine/confidence";
import { geoChain, geoScopeLabel, locationLabel } from "@/engine/geo";
import { formatRange, formatUah, pluralUk } from "@/engine/format";
import { routeCta } from "@/engine/routing";
import { compareQuote, type ComparisonContext } from "@/engine/comparison";
import {
  SEGMENTS,
  type Answers,
  type ClinicalConfidence,
  type ExtraCode,
  type PackageChoice,
  type PriceRange,
  type PricedScenario,
  type Qualification,
  type QuoteInput,
  type Resolution,
  type Scenario,
  type Segment,
} from "@/engine/types";
import { track } from "@/services/analytics";
import { readUtm, type LeadPayload } from "@/services/lead";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { PackageCustomizer, SegmentCards } from "./PriceCards";
import { ComparisonPanel } from "./ComparisonPanel";
import { LeadDialog } from "./LeadDialog";

const CLINICAL_EXPLANATION: Record<ClinicalConfidence, string> = {
  HIGH: "Для такої ситуації лікування зазвичай відповідає стандартному сценарію.",
  MEDIUM_HIGH: "Сценарій типовий, але деталі уточнить лікар після огляду.",
  MEDIUM: "Ми використали референсний сценарій — реальний план може відрізнятися.",
  LOW_MEDIUM: "Без огляду та знімка план може суттєво відрізнятися від нашого сценарію.",
  LOW: "Без огляду лікаря таку ситуацію неможливо оцінити точно — це лише напрям.",
};

const CONFIDENCE_TONE: Record<string, string> = {
  HIGH: "bg-good-soft text-good",
  MEDIUM_HIGH: "bg-good-soft text-good",
  MEDIUM: "bg-brand-soft text-brand-dark",
  LOW_MEDIUM: "bg-warn-soft text-warn",
  LOW: "bg-warn-soft text-warn",
};

/** Single tooth "з тимчасовою коронкою" → SINGLE_TOOTH_TEMP basket. */
function withTempCrown(scenario: Scenario): Scenario {
  return {
    ...scenario,
    parts: scenario.parts.map((part) =>
      part.basket === "SINGLE_TOOTH_STANDARD"
        ? { ...part, basket: "SINGLE_TOOTH_TEMP", modifiers: { ...part.modifiers, tempCrowns: 1 } }
        : part,
    ),
  };
}

function formatMonth(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
}

interface Props {
  resolution: Resolution;
  answers: Answers;
  locationId: string;
  qualification: Qualification;
  utmSearch: string;
}

export function ResultView({ resolution, answers, locationId, qualification, utmSearch }: Props) {
  const priced = resolution.kind === "priced" && resolution.scenarios.length > 0;
  const primaryScenarios = resolution.scenarios.filter((s) => !s.isSecondary);
  const secondaryScenarios = resolution.scenarios.filter((s) => s.isSecondary);

  const [showSecondary, setShowSecondary] = useState(false);
  const [scenarioId, setScenarioId] = useState(
    resolution.defaultScenarioId ?? resolution.scenarios[0]?.id ?? "",
  );
  const [segment, setSegment] = useState<Segment>("OPTIMAL");
  const [customizing, setCustomizing] = useState(false);
  const [customPkg, setCustomPkg] = useState<PackageChoice>(alignedPackage("OPTIMAL"));
  const [tempCrown, setTempCrown] = useState(false);
  const [compareOpen, setCompareOpen] = useState(qualification.hasQuote);
  const [quote, setQuote] = useState<QuoteInput | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);

  const visibleScenarios = showSecondary ? resolution.scenarios : primaryScenarios;
  const baseScenario = resolution.scenarios.find((s) => s.id === scenarioId) ?? resolution.scenarios[0];
  const scenario = baseScenario && tempCrown ? withTempCrown(baseScenario) : baseScenario;

  const pricedBySegment = useMemo(() => {
    if (!scenario) return null;
    return Object.fromEntries(
      SEGMENTS.map((s) => [s, priceScenario(scenario, locationId, alignedPackage(s))]),
    ) as Record<Segment, PricedScenario>;
  }, [scenario, locationId]);

  const activePkg = customizing ? customPkg : alignedPackage(segment);
  const activePriced = useMemo(
    () => (scenario ? priceScenario(scenario, locationId, activePkg) : null),
    [scenario, locationId, activePkg],
  );

  const extras = useMemo(
    () => (priced ? priceExtras(resolution.relevantExtras, locationId) : []),
    [priced, resolution.relevantExtras, locationId],
  );

  const extraUnitPrices = useMemo(() => {
    const map: Partial<Record<ExtraCode, PriceRange>> = {};
    const all = priceExtras(
      (
        [
          "EXTRACTION_SIMPLE",
          "EXTRACTION_COMPLEX",
          "BONE_AUGMENTATION",
          "SINUS_LIFT",
          "SOFT_TISSUE_GRAFT",
          "SURGICAL_GUIDE",
          "SEDATION",
          "TEMPORARY_CROWN",
        ] as ExtraCode[]
      ).map((code) => ({ code })),
      locationId,
    );
    all.forEach((e) => (map[e.code] = e.unitRange));
    return map;
  }, [locationId]);

  const comparisonContext: ComparisonContext | null = useMemo(
    () =>
      activePriced && resolution.comparisonScope
        ? { resolution, priced: activePriced, extraUnitPrices }
        : null,
    [activePriced, resolution, extraUnitPrices],
  );
  // Recomputed from the stored quote, so switching scenario / segment /
  // package / temp crown never leaves a stale comparison on screen.
  const comparison = useMemo(
    () => (quote && comparisonContext ? compareQuote(quote, comparisonContext) : null),
    [quote, comparisonContext],
  );
  const offerUah = quote?.amountUah ?? null;

  const cta = routeCta({ resolution, qualification, comparison });
  const hasImplantAxis = activePriced?.lines.some((l) => l.axis === "implant") ?? false;
  const showMedian = (activePriced?.market.minN ?? 0) >= MIN_LOCAL_OBSERVATIONS;
  const included = scenario ? scenarioIncluded(scenario) : [];
  const location = locationLabel(locationId);
  const requestedScope = geoChain(locationId)[0];

  // ТЗ §19 result_viewed — once per result.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    track("result_viewed", {
      kind: resolution.kind,
      scenario_id: scenarioId || null,
      location_id: locationId,
      clinical_confidence: resolution.clinicalConfidence,
      market_confidence: activePriced?.market.confidence ?? null,
      geo_scope: activePriced?.market.geoScope.id ?? null,
      used_fallback: activePriced?.market.usedFallback ?? null,
      cta: cta.service,
    });
  }, [resolution, scenarioId, locationId, activePriced, cta.service]);

  // Sticky CTA appears only while the main CTA card is off-screen.
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaVisible, setCtaVisible] = useState(false);
  useEffect(() => {
    const node = ctaRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCtaVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const selectSegment = (s: Segment) => {
    setCustomizing(false);
    setSegment(s);
    setCustomPkg(alignedPackage(s));
    if (s !== segment) track("segment_changed", { segment: s, scenario_id: scenarioId });
  };

  const changeCustom = (pkg: PackageChoice) => {
    setCustomPkg(pkg);
    track("package_customized", { implant: pkg.implant, prosthetic: pkg.prosthetic, scenario_id: scenarioId });
  };

  const openCta = () => {
    track(cta.event, { service: cta.service, label: cta.label, scenario_id: scenarioId || null });
    setLeadOpen(true);
  };

  const packageLabel = isAlignedPackage(activePkg)
    ? SEGMENT_INFO[activePkg.implant].label
    : `імплант ${SEGMENT_INFO[activePkg.implant].label.toLowerCase()}, протезування ${SEGMENT_INFO[activePkg.prosthetic].label.toLowerCase()}`;

  const buildPayload = (contact: LeadPayload["contact"]): LeadPayload => ({
    service: cta.service,
    ctaLabel: cta.label,
    contact,
    consent: true,
    location: { id: locationId, label: location },
    answers,
    calculation: {
      title: resolution.title,
      kind: resolution.kind,
      scenarioId: scenario?.id,
      scenarioLabel: scenario?.label,
      package: activePriced ? { ...activePkg } : undefined,
      totalUah: activePriced?.total,
      clinicalConfidence: resolution.clinicalConfidence,
      marketConfidence: activePriced?.market.confidence,
    },
    comparison:
      comparison && offerUah !== null
        ? {
            offerUah,
            comparable: comparison.comparable,
            deviationPct: comparison.comparable ? comparison.deviationPct : undefined,
            position: comparison.comparable ? comparison.position : undefined,
          }
        : undefined,
    utm: readUtm(utmSearch),
    createdAt: new Date().toISOString(),
  });

  return (
    <div className="space-y-4">
      {/* R00-1 */}
      <header className="pb-1">
        <p className="text-sm font-bold text-brand">
          {priced ? "Орієнтовний ринковий діапазон" : "Попередня оцінка"} · {location}
        </p>
        <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight text-balance sm:text-[32px]">
          {resolution.title}
        </h1>
        {resolution.assumptions.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-ink-soft">
            {resolution.assumptions.map((a) => (
              <li key={a} className="flex gap-2">
                <span aria-hidden className="text-muted">
                  •
                </span>
                {a}
              </li>
            ))}
          </ul>
        )}
      </header>

      {/* ТЗ P-06: plan check before the price */}
      {resolution.flags.massExtraction && (
        <div className="rounded-[var(--radius-card)] border border-warn-line bg-warn-soft p-5" role="note">
          <p className="font-extrabold text-warn">Спершу — перевірка плану</p>
          <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
            Якщо вам рекомендують видалити багато зубів, пам’ятайте: це незворотне рішення. Перш ніж
            порівнювати ціни, варто, щоб незалежний лікар переглянув ситуацію і підтвердив, які зуби
            справді неможливо зберегти. Як це зробити — внизу сторінки.
          </p>
        </div>
      )}

      {resolution.conditionalNote && (
        <div className="rounded-[var(--radius-card)] border border-warn-line bg-warn-soft p-4 text-[15px] leading-relaxed text-ink-soft" role="note">
          {resolution.conditionalNote}
        </div>
      )}

      {resolution.directionNotes && resolution.directionNotes.length > 0 && (
        <Card>
          <SectionTitle>Можливі напрями лікування</SectionTitle>
          <ul className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">
            {resolution.directionNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Card>
      )}

      {!priced && (
        <Card>
          <SectionTitle>Чому ми не показуємо ціну</SectionTitle>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            {resolution.noBasketMessage ??
              "Для вашої ситуації неможливо надійно визначити кошик лікування без огляду. Ми не вигадуватимемо ціну."}
          </p>
        </Card>
      )}

      {priced && scenario && pricedBySegment && activePriced && (
        <>
          {/* R00-2 market range */}
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <SectionTitle>Ринковий орієнтир</SectionTitle>
              {activePriced.market.isDemo && (
                <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn">
                  Демо-дані
                </span>
              )}
            </div>

            {visibleScenarios.length > 1 && (
              <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Сценарій">
                {visibleScenarios.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={s.id === scenario.id}
                    onClick={() => setScenarioId(s.id)}
                    className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-bold ${
                      s.id === scenario.id ? "border-ink bg-ink text-white" : "border-line-strong bg-paper hover:border-ink"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {secondaryScenarios.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (showSecondary && scenario.isSecondary) setScenarioId(primaryScenarios[0]?.id ?? scenarioId);
                  setShowSecondary((v) => !v);
                }}
                className="mt-2 text-sm font-bold text-brand underline-offset-4 hover:underline"
              >
                {showSecondary
                  ? "Сховати додаткові сценарії"
                  : `Показати також: ${secondaryScenarios.map((s) => s.label).join(", ")}`}
              </button>
            )}

            <p className="mt-3 mb-3 text-sm text-muted">
              {activePriced.stage1
                ? `Вартість ${scenario.parts.length > 1 ? "обох щелеп" : "однієї щелепи"} розділена на етапи — перший етап не є ціною «під ключ».`
                : "Повна вартість лікування за ринковими сегментами. Оберіть сегмент, щоб побачити деталі."}
            </p>

            <SegmentCards
              pricedBySegment={pricedBySegment}
              selected={segment}
              onSelect={selectSegment}
              showMedian={showMedian}
              dimmed={customizing}
            />

            {hasImplantAxis && (
              <div className="mt-3">
                {customizing ? (
                  <>
                    <PackageCustomizer pkg={customPkg} onChange={changeCustom} priced={activePriced} showMedian={showMedian} />
                    <Button variant="ghost" className="mt-2" onClick={() => selectSegment(segment)}>
                      Повернутися до стандартних пакетів
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setCustomizing(true)}>
                    Налаштувати варіант
                  </Button>
                )}
              </div>
            )}

            {resolution.flags.tempCrownOption && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-3.5">
                <input
                  type="checkbox"
                  checked={tempCrown}
                  onChange={(e) => setTempCrown(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand)]"
                />
                <span>
                  <span className="block text-[15px] font-bold">Потрібна тимчасова коронка</span>
                  <span className="block text-sm text-muted">
                    На час приживлення імпланта — додає тимчасову коронку, компонент і повторне сканування.
                  </span>
                </span>
              </label>
            )}
          </Card>

          {/* R00-3 scenario basis */}
          {scenario.referenceNote && (
            <Card>
              <SectionTitle>На чому базується оцінка</SectionTitle>
              <p className="mt-2 text-[15px] font-bold">{scenario.referenceNote}</p>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
                Це один із можливих сценаріїв для фінансової оцінки. Кількість і розташування
                імплантів визначає лікар після діагностики.
              </p>
            </Card>
          )}

          {/* R00-4 included */}
          <Card>
            <SectionTitle>Що входить у розрахунок</SectionTitle>
            <ul className="mt-3 space-y-2">
              {included.map((item) => (
                <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed">
                  <span aria-hidden className="mt-0.5 font-extrabold text-good">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <details className="group mt-4 rounded-xl bg-canvas p-3">
              <summary className="cursor-pointer list-none text-sm font-bold text-brand">
                Деталізація за складовими · {packageLabel}
              </summary>
              <table className="mt-3 w-full text-sm">
                <tbody className="divide-y divide-line">
                  {activePriced.lines.map((line, index) => (
                    <tr key={`${line.code}-${line.arch ?? ""}-${index}`}>
                      <td className="py-2 pr-3">
                        <span className="font-semibold">{line.label}</span>
                        <span className="text-muted">
                          {" "}
                          × {line.quantity}
                          {line.arch ? ` · ${line.arch === "UPPER" ? "верхня" : "нижня"}` : ""}
                          {line.stage ? ` · етап ${line.stage}` : ""}
                        </span>
                      </td>
                      <td className="tabular py-2 text-right font-bold whitespace-nowrap">{formatRange(line.range)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Card>

          {/* R00-5 extras */}
          {extras.length > 0 && (
            <Card>
              <SectionTitle>Можливі додаткові витрати</SectionTitle>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Не входять у суму вище. Потрібні лише тоді, коли їх підтвердить лікар за оглядом або КТ.
              </p>
              <ul className="mt-3 divide-y divide-line">
                {extras.map((extra) => (
                  <li key={extra.code} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
                    <span>
                      <span className="block text-[15px] font-bold">{extra.label}</span>
                      <span className="block text-sm text-muted">
                        {extra.unitLabel}
                        {extra.note ? ` · ${extra.note}` : ""}
                      </span>
                    </span>
                    <span className="tabular text-[15px] font-bold">{formatRange(extra.unitRange)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* R00-6 confidence */}
      <Card>
        <SectionTitle>Наскільки точна ця оцінка</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line p-3.5">
            <p className="text-sm font-bold text-muted">Клінічний сценарій</p>
            <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-sm font-extrabold ${CONFIDENCE_TONE[resolution.clinicalConfidence]}`}>
              {CLINICAL_CONFIDENCE_LABEL[resolution.clinicalConfidence]}
            </span>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{CLINICAL_EXPLANATION[resolution.clinicalConfidence]}</p>
          </div>
          {activePriced && (
            <div className="rounded-2xl border border-line p-3.5">
              <p className="text-sm font-bold text-muted">Ринкові дані</p>
              <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-sm font-extrabold ${CONFIDENCE_TONE[activePriced.market.confidence]}`}>
                {MARKET_CONFIDENCE_LABEL[activePriced.market.confidence]}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {MARKET_CONFIDENCE_EXPLANATION[activePriced.market.confidence]}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Дані: {geoScopeLabel(activePriced.market.geoScope)} · від {activePriced.market.minN}{" "}
                {pluralUk(activePriced.market.minN, "спостереження", "спостережень", "спостережень")} · оновлено:{" "}
                {formatMonth(activePriced.market.updatedAt)}
              </p>
              {activePriced.market.usedFallback && requestedScope && (
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Даних по території «{geoScopeLabel(requestedScope)}» поки замало, тому частину цін взято з
                  ширшої території: {geoScopeLabel(activePriced.market.geoScope)}.
                </p>
              )}
              {activePriced.market.isDemo && (
                <p className="mt-2 text-sm font-semibold text-warn">
                  Зараз використовуються демонстраційні ціни — не реальна ринкова статистика.
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* R00-7 comparison */}
      {priced && comparisonContext && (
        <Card>
          <SectionTitle>Вам уже назвали вартість?</SectionTitle>
          {compareOpen ? (
            <div className="mt-3">
              <ComparisonPanel
                context={comparisonContext}
                comparedWith={`${scenario?.label ?? ""} · ${packageLabel}`}
                result={comparison}
                onSubmit={setQuote}
                onReset={() => setQuote(null)}
              />
            </div>
          ) : (
            <>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
                Введіть суму та що в неї входить — порівняємо з ринком для співставного лікування.
              </p>
              <Button variant="secondary" className="mt-3" onClick={() => setCompareOpen(true)}>
                Порівняти пропозицію клініки
              </Button>
            </>
          )}
        </Card>
      )}

      {qualification.hasQuote && !comparisonContext && (
        <Card>
          <SectionTitle>Вам уже назвали вартість?</SectionTitle>
          <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
            Для цієї ситуації немає стандартизованого кошика, з яким можна чесно порівняти суму. Краще
            розібрати пропозицію по пунктах разом із лікарем — це наступний крок нижче.
          </p>
        </Card>
      )}

      {/* R00-8 single CTA */}
      <div ref={ctaRef} className="rounded-[var(--radius-card)] bg-ink p-5 text-white sm:p-6">
        <p className="text-sm font-bold text-white/70">Що робити далі</p>
        <p className="mt-1 text-[17px] leading-relaxed font-semibold">{cta.reason}</p>
        <Button className="mt-4 w-full bg-white !text-ink hover:bg-brand-soft sm:w-auto" onClick={openCta}>
          {cta.label} <span aria-hidden>→</span>
        </Button>
      </div>

      <p className="px-1 pt-2 text-xs leading-relaxed text-muted">
        Калькулятор показує орієнтовні ринкові діапазони для стандартизованого кошика лікування і не є
        медичною консультацією, діагнозом чи планом лікування. Остаточний обсяг і вартість визначає
        лікар після огляду та діагностики.
      </p>

      {!ctaVisible && !leadOpen && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 p-3 backdrop-blur sm:hidden">
          <Button className="w-full" onClick={openCta}>
            {cta.label}
          </Button>
        </div>
      )}

      <LeadDialog cta={cta} open={leadOpen} onClose={() => setLeadOpen(false)} buildPayload={buildPayload} />

      {priced && activePriced && (
        <p className="sr-only" aria-live="polite">
          {SEGMENT_INFO[activePkg.implant].label}: {formatRange(activePriced.total)}, типова ціна {formatUah(activePriced.total.median)}
        </p>
      )}
    </div>
  );
}
