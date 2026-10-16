"use client";

import type { CalcComponent, Jaw, JawCalculation, JawInput, JawScenarioChoice, MoneyRange, PatientTier } from "@/lib/contracts";
import { SCENARIO_CHOICES, type PriceBook } from "@/engine/v3";
import { formatNumber, teethText, type Currency } from "@/engine/v3/format";
import { JAW_NAME, SCENARIO_LABEL, TIER_LABEL, jawSummary, type JawTiers } from "./model";
import { Money, NO_DATA, inlineMoney } from "./Money";

interface Props {
  jaw: Jaw;
  input: JawInput;
  calc: JawCalculation;
  minCalc: JawCalculation | null;
  premCalc: JawCalculation | null;
  tiers: JawTiers;
  book: PriceBook;
  currency: Currency;
  onTiers: (patch: Partial<JawTiers>, which: "implant" | "crown") => void;
  onPreset: (tier: PatientTier) => void;
  onScenario: (scenario: JawScenarioChoice) => void;
}

const isAllOn = (scenario: string) => scenario === "aox4" || scenario === "aox6" || scenario === "aox8";

function rangeText(range: { low: number; high: number }): string {
  return range.low === range.high ? String(range.low) : `${range.low}–${range.high}`;
}

/** ТЗ §6.2: the result of ONE jaw — its own scenario, tiers, stages and total. */
export function JawBlock({ jaw, input, calc, minCalc, premCalc, tiers, book, currency, onTiers, onPreset, onScenario }: Props) {
  const name = JAW_NAME[jaw];
  const eurRate = book.eurRate;
  const available = calc.missing_codes.length === 0;
  const hasScenarios = input.tooth_count >= 7 && input.status !== "implants_installed";
  const arch = isAllOn(calc.scenario);
  const money = (range: MoneyRange | null, extra: Partial<React.ComponentProps<typeof Money>> = {}) => (
    <Money range={range} currency={currency} eurRate={eurRate} {...extra} />
  );

  return (
    <section
      aria-labelledby={`jaw-${jaw}-title`}
      data-testid={`jaw-${jaw}`}
      className="rounded-[var(--radius-card)] border border-line bg-paper p-4 sm:p-5"
    >
      <h2 id={`jaw-${jaw}-title`} className="text-[20px] font-extrabold">
        {name}
      </h2>
      <p className="mt-0.5 text-sm text-ink-soft" data-testid={`jaw-${jaw}-summary`}>
        {jawSummary(input, calc)}
      </p>

      {hasScenarios && (
        <ScenarioSection jaw={jaw} calc={calc} selected={input.scenario ?? "bridges"} currency={currency} eurRate={eurRate} onScenario={onScenario} />
      )}

      {!available ? (
        <p className="mt-4 rounded-xl bg-canvas p-3 text-sm leading-relaxed text-ink-soft" role="status" data-testid={`nodata-${jaw}`}>
          <span className="font-bold">{NO_DATA}.</span> Для цього міста ще немає всіх потрібних цін, тому ми не називаємо
          суму навмання. Координатор може підготувати розрахунок вручну.
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-brand bg-brand-soft/40 p-4" data-testid={`main-card-${jaw}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-brand">Основний результат</p>
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-ink-soft" data-testid={`tier-chip-${jaw}`}>
                {tiers.implant === tiers.crown ? `${TIER_LABEL[tiers.implant]} рівень` : "Свій набір рівнів"}
              </span>
            </div>

            <div className="mt-2">
              {arch && <p className="text-xs font-semibold text-ink-soft">Перший етап (з тимчасовими зубами)</p>}
              {money(arch ? calc.first_stage : calc.total, { testId: `main-${jaw}` })}
            </div>

            {arch && (
              <dl className="mt-3 space-y-1.5 rounded-xl bg-paper p-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-bold text-ink-soft">Постійна конструкція</dt>
                  <dd>{money(calc.permanent_stage, { mainClass: "text-[16px] font-extrabold", align: "right", testId: `permanent-${jaw}` })}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="font-extrabold">Повний бюджет лікування</dt>
                  <dd>{money(calc.total, { mainClass: "text-[16px] font-extrabold", align: "right", testId: `full-${jaw}` })}</dd>
                </div>
              </dl>
            )}

            <p className="mt-3 text-sm text-ink-soft" data-testid={`counts-${jaw}`}>
              Імплантів: <span className="font-bold text-ink">{rangeText(calc.implant_count)}</span>
              {!arch && (
                <>
                  {" · "}Коронкових одиниць: <span className="font-bold text-ink">{calc.prosthetic_units}</span>
                </>
              )}
            </p>
            {calc.scenario === "adjacent_or_separate" && (
              <p className="mt-2 text-xs leading-relaxed text-ink-soft" data-testid={`range-note-${jaw}`}>
                Не знаєте, як розташовані зуби, тому показано діапазон: від мосту на 2–3 імплантах до окремих імплантів.
                Схему визначає лікар після діагностики.
              </p>
            )}

            <div className="mt-4 grid gap-3">
              <TierToggle
                label={`${name}: рівень ${arch ? "імплантів" : "імпланта"}`}
                title={arch ? "Рівень імплантів" : "Рівень імпланта"}
                testId={`tier-${jaw}-implant`}
                value={tiers.implant}
                onChange={(tier) => onTiers({ implant: tier }, "implant")}
              />
              <TierToggle
                label={`${name}: рівень ${arch ? "постійної конструкції" : "коронки"}`}
                title={arch ? "Рівень постійної конструкції" : "Рівень коронки"}
                testId={`tier-${jaw}-crown`}
                value={tiers.crown}
                onChange={(tier) => onTiers({ crown: tier }, "crown")}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["minimum", "Мінімальний орієнтир", minCalc],
                ["premium", "Преміальний орієнтир", premCalc],
              ] as const
            ).map(([tier, title, preset]) => {
              const active = tiers.implant === tier && tiers.crown === tier;
              const range = preset && preset.missing_codes.length === 0 ? (arch ? preset.first_stage : preset.total) : null;
              return (
                <button
                  key={tier}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPreset(tier)}
                  data-testid={`preset-${jaw}-${tier}`}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors hover:border-brand ${
                    active ? "border-brand bg-brand-soft" : "border-line bg-paper"
                  }`}
                >
                  <span>
                    <span className="block font-bold">{title}</span>
                    <span className="block text-xs text-muted">
                      {tier === "minimum" ? "Нижній перевірений ринковий рівень" : "Вищий рівень систем і лабораторії"}
                    </span>
                  </span>
                  <span className="shrink-0">{money(range, { mainClass: "text-[15px] font-extrabold", align: "right", testId: `preset-${jaw}-${tier}-price` })}</span>
                </button>
              );
            })}
          </div>

          <Breakdown calc={calc} book={book} currency={currency} jaw={jaw} />
        </>
      )}
    </section>
  );
}

function ScenarioSection({
  jaw,
  calc,
  selected,
  currency,
  eurRate,
  onScenario,
}: {
  jaw: Jaw;
  calc: JawCalculation;
  selected: JawScenarioChoice;
  currency: Currency;
  eurRate: { rate: number } | null;
  onScenario: (scenario: JawScenarioChoice) => void;
}) {
  return (
    <div className="mt-4" data-testid={`scenarios-${jaw}`}>
      <p className="text-sm font-extrabold">Порівняння бюджетів для {teethText(calc.tooth_count)}</p>
      <ul className="mt-2 grid grid-cols-2 gap-2" data-testid={`strip-${jaw}`} aria-label="Порівняння чотирьох сценаріїв">
        {SCENARIO_CHOICES.map((choice) => {
          const alt = calc.alternatives.find((a) => a.scenario === choice);
          return (
            <li key={choice} className="rounded-xl bg-canvas px-3 py-2" data-testid={`strip-${jaw}-${choice}`}>
              <p className="text-xs font-bold text-ink-soft">{SCENARIO_LABEL[choice]}</p>
              <Money range={alt?.total ?? null} currency={currency} eurRate={eurRate} mainClass="text-[16px] font-extrabold" />
              <p className="text-[11px] text-muted">{choice === "bridges" ? "повний бюджет" : "повний бюджет, 2 етапи"}</p>
            </li>
          );
        })}
      </ul>

      <div
        role="tablist"
        aria-label={`${JAW_NAME[jaw]}: сценарій відновлення`}
        className="mt-3 grid grid-cols-4 gap-1 rounded-full bg-line/60 p-1"
        onKeyDown={(event) => {
          const index = SCENARIO_CHOICES.indexOf(selected);
          const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (delta === 0) return;
          event.preventDefault();
          const next = SCENARIO_CHOICES[(index + delta + SCENARIO_CHOICES.length) % SCENARIO_CHOICES.length];
          onScenario(next);
          document.getElementById(`tab-${jaw}-${next}`)?.focus();
        }}
      >
        {SCENARIO_CHOICES.map((choice) => {
          const active = selected === choice;
          return (
            <button
              key={choice}
              id={`tab-${jaw}-${choice}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`panel-${jaw}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onScenario(choice)}
              className={`min-h-11 rounded-full px-0.5 text-[13px] font-extrabold transition-colors sm:text-[15px] ${
                active ? "bg-paper text-brand shadow-sm" : "text-ink-soft hover:text-brand"
              }`}
            >
              {SCENARIO_LABEL[choice]}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted" id={`panel-${jaw}`} role="tabpanel" aria-labelledby={`tab-${jaw}-${selected}`}>
        Можливі різні варіанти відновлення. Відповідний варіант визначить лікар після діагностики
      </p>
    </div>
  );
}

function TierToggle({
  label,
  title,
  testId,
  value,
  onChange,
}: {
  label: string;
  title: string;
  testId: string;
  value: PatientTier;
  onChange: (tier: PatientTier) => void;
}) {
  return (
    <div>
      <p className="text-sm font-extrabold">{title}</p>
      <div role="group" aria-label={label} data-testid={testId} className="mt-1.5 grid grid-cols-3 gap-1 rounded-full bg-canvas p-1">
        {(["minimum", "classic", "premium"] as const).map((tier) => {
          const active = tier === value;
          return (
            <button
              key={tier}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(tier)}
              className={`min-h-10 rounded-full px-1 text-[13px] font-bold transition-colors sm:text-sm ${
                active ? "bg-brand text-white" : "text-ink-soft hover:bg-paper"
              }`}
            >
              {TIER_LABEL[tier]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STAGE_TITLE: Record<string, string> = {
  first: "Перший етап (з тимчасовими зубами)",
  permanent: "Постійна конструкція",
  temporary: "Тимчасове протезування",
  none: "Склад розрахунку",
};

function Breakdown({ calc, book, currency, jaw }: { calc: JawCalculation; book: PriceBook; currency: Currency; jaw: Jaw }) {
  const groups = new Map<string, CalcComponent[]>();
  for (const c of calc.components) {
    const key = c.stage ?? "none";
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const order = ["none", "first", "permanent", "temporary"].filter((k) => groups.has(k));
  const eurRate = book.eurRate;
  return (
    <div className="mt-4 space-y-3" data-testid={`breakdown-${jaw}`}>
      {order.map((key) => (
        <div key={key}>
          <p className="text-xs font-extrabold tracking-wide text-muted uppercase">{STAGE_TITLE[key]}</p>
          <ul className="mt-1 divide-y divide-line text-sm">
            {(groups.get(key) ?? []).map((c) => (
              <li key={`${c.service_code}|${c.stage}`} className="flex items-baseline justify-between gap-3 py-1.5" data-testid={`line-${jaw}-${c.service_code}`}>
                <span className="text-ink-soft">
                  {book.name(c.service_code)}
                  {(c.quantity.high > 1 || c.quantity.low !== c.quantity.high) && (
                    <span className="tabular font-bold"> × {c.quantity.low === c.quantity.high ? formatNumber(c.quantity.high) : `${c.quantity.low}–${c.quantity.high}`}</span>
                  )}
                </span>
                <span className="tabular font-semibold whitespace-nowrap">{inlineMoney(c.total, currency, eurRate)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
