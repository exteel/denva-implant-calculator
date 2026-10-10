"use client";

import { useId, useState } from "react";
import {
  FULL_ARCH_INCLUDE_OPTIONS,
  FULL_ARCH_OTHER_LABEL,
  FULL_ARCH_SCOPE_OPTIONS,
  TEETH_SCOPE_OPTIONS,
  compareQuote,
  toUah,
  type ComparisonContext,
} from "@/engine/comparison";
import { formatPct, formatRange, formatUah } from "@/engine/format";
import type { ComparisonResult, ExtraCode, FullArchScope, QuoteInput, TeethScopeItem } from "@/engine/types";
import { track } from "@/services/analytics";
import { Button } from "@/components/ui/Button";

interface Props {
  context: ComparisonContext;
  /** e.g. "All-on-6 · Оптимальний" — what the market range refers to. */
  comparedWith: string;
  /**
   * Computed by the parent from the stored quote, so it always matches the
   * scenario / package currently on screen (never a stale range).
   */
  result: ComparisonResult | null;
  onSubmit: (input: QuoteInput) => void;
  onReset: () => void;
}

/**
 * "68 000", "68.000", "68,000" → 68000; "1 250,50" → 1250.5. A dot or comma
 * followed by exactly three digits is a thousands separator, not a decimal.
 */
export function parseAmount(raw: string): number {
  const compact = raw.replace(/\s/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(compact)) return Number(compact.replace(/[.,]/g, ""));
  return Number(compact.replace(",", "."));
}

const MIN_AMOUNT = { UAH: 1000, EUR: 20 } as const;

const POSITION_TONE: Record<string, string> = {
  below: "bg-brand-soft text-brand-dark",
  within_low: "bg-good-soft text-good",
  within_typical: "bg-good-soft text-good",
  within_high: "bg-good-soft text-good",
  above: "bg-warn-soft text-warn",
};

/** ТЗ §14 (C00) + §14.3 (R01). */
export function ComparisonPanel({ context, comparedWith, result, onSubmit, onReset }: Props) {
  const scope = context.resolution.comparisonScope;
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"UAH" | "EUR">("UAH");
  const [teeth, setTeeth] = useState<TeethScopeItem[]>([]);
  const [arch, setArch] = useState<FullArchScope | null>(null);
  const [includes, setIncludes] = useState<ExtraCode[]>([]);
  const [includesOther, setIncludesOther] = useState(false);
  const [touched, setTouched] = useState(false);
  const amountId = useId();

  const numeric = parseAmount(amount);
  const amountOk = Number.isFinite(numeric) && numeric >= MIN_AMOUNT[currency];
  const scopeOk = scope === "teeth" ? teeth.length > 0 : arch !== null;

  const toggleTeeth = (id: TeethScopeItem, exclusive?: boolean) => {
    setTeeth((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (exclusive) return [id];
      const exclusiveIds = TEETH_SCOPE_OPTIONS.filter((o) => o.exclusive).map((o) => o.id);
      return [...prev.filter((v) => !exclusiveIds.includes(v)), id];
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!amountOk || !scopeOk || !scope) return;
    const amountUah = Math.round(toUah(numeric, currency));
    const input: QuoteInput =
      scope === "teeth"
        ? { amountUah, teethScope: teeth }
        : {
            amountUah,
            fullArchScope: arch ?? "unknown",
            fullArchIncludes: arch === "full" ? includes : [],
            fullArchIncludesOther: arch === "full" && includesOther,
          };
    track("quote_entered", { amount_uah: amountUah, currency, scope });
    const comparison = compareQuote(input, context);
    track("quote_compared", {
      comparable: comparison.comparable,
      position: comparison.comparable ? comparison.position : null,
      deviation_pct: comparison.comparable ? comparison.deviationPct : null,
    });
    onSubmit(input);
  };

  if (result) {
    return (
      <div className="space-y-3">
        {result.comparable ? (
          <>
            <dl className="divide-y divide-line rounded-2xl border border-line">
              <Row label="Ваша пропозиція" value={formatUah(result.offerUah)} strong />
              <Row label="Типовий ринковий діапазон" value={formatRange(result.range)} />
              <Row label="Медіана" value={formatUah(result.range.median)} />
              <Row label="Відхилення від медіани" value={formatPct(result.deviationPct)} strong />
            </dl>
            <p className="text-sm text-muted">Порівнюємо з: {result.basisLabel}, {comparedWith}.</p>
            <div className={`rounded-2xl p-4 ${POSITION_TONE[result.position]}`}>
              <p className="font-extrabold">{result.headline}</p>
            </div>
            <p className="text-[15px] leading-relaxed text-ink-soft">{result.explanation}</p>
          </>
        ) : (
          <div className="rounded-2xl bg-warn-soft p-4">
            <p className="font-extrabold text-warn">Цю пропозицію некоректно порівнювати напряму</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{result.reason}</p>
          </div>
        )}
        <Button variant="ghost" onClick={onReset}>
          Змінити дані пропозиції
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <label htmlFor={amountId} className="text-sm font-bold">
          Яку суму вам назвали?
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id={amountId}
            inputMode="decimal"
            placeholder="Наприклад, 68 000"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d\s.,]/g, "").slice(0, 12))}
            aria-invalid={touched && !amountOk}
            className="tabular h-12 min-w-0 flex-1 rounded-xl border border-line-strong px-3.5 text-[17px] font-bold focus:border-brand focus:outline-none aria-[invalid=true]:border-bad"
          />
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1" role="group" aria-label="Валюта">
            {(["UAH", "EUR"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={currency === c}
                onClick={() => setCurrency(c)}
                className={`min-w-12 rounded-lg px-2 text-sm font-bold ${
                  currency === c ? "bg-paper text-brand shadow-sm" : "text-ink-soft"
                }`}
              >
                {c === "UAH" ? "грн" : "€"}
              </button>
            ))}
          </div>
        </div>
        {touched && !amountOk && (
          <p className="mt-1 text-sm text-bad">
            {Number.isFinite(numeric) && numeric > 0
              ? "Сума виглядає замалою — вкажіть повну вартість лікування."
              : "Вкажіть суму пропозиції."}
          </p>
        )}
      </div>

      {scope === "teeth" ? (
        <fieldset>
          <legend className="text-sm font-bold">Що входить у цю суму?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TEETH_SCOPE_OPTIONS.map((option) => {
              const checked = teeth.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleTeeth(option.id, option.exclusive)}
                  className={`min-h-10 rounded-full border px-4 text-sm font-bold transition-colors ${
                    checked ? "border-brand bg-brand text-white" : "border-line-strong bg-paper hover:border-brand"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {touched && !scopeOk && <p className="mt-1 text-sm text-bad">Позначте, що входить у пропозицію.</p>}
        </fieldset>
      ) : (
        <fieldset>
          <legend className="text-sm font-bold">Що входить у цю суму?</legend>
          <div className="mt-2 grid gap-2">
            {FULL_ARCH_SCOPE_OPTIONS.map((option) => (
              <label
                key={option.id}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
                  arch === option.id ? "border-brand bg-brand-soft" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="arch-scope"
                  checked={arch === option.id}
                  onChange={() => setArch(option.id)}
                  className="size-4.5 accent-[var(--color-brand)]"
                />
                <span className="text-[15px] font-bold">{option.label}</span>
              </label>
            ))}
          </div>
          {arch === "full" && (
            <div className="mt-3 rounded-xl bg-canvas p-3">
              <p className="text-sm font-bold">Чи входять у суму також:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {FULL_ARCH_INCLUDE_OPTIONS.map((option) => {
                  const checked = includes.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() =>
                        setIncludes((prev) =>
                          checked ? prev.filter((v) => v !== option.id) : [...prev, option.id],
                        )
                      }
                      className={`min-h-10 rounded-full border px-4 text-sm font-bold ${
                        checked ? "border-brand bg-brand text-white" : "border-line-strong bg-paper"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={includesOther}
                  onClick={() => setIncludesOther((v) => !v)}
                  className={`min-h-10 rounded-full border px-4 text-sm font-bold ${
                    includesOther ? "border-brand bg-brand text-white" : "border-line-strong bg-paper"
                  }`}
                >
                  {FULL_ARCH_OTHER_LABEL}
                </button>
              </div>
            </div>
          )}
          {touched && !scopeOk && <p className="mt-1 text-sm text-bad">Оберіть, що входить у пропозицію.</p>}
        </fieldset>
      )}

      <p className="text-sm text-muted">Порівнюватимемо з: {comparedWith}.</p>
      <Button type="submit">Порівняти з ринком</Button>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <dt className="text-[15px] text-ink-soft">{label}</dt>
      <dd className={`tabular shrink-0 text-right whitespace-nowrap ${strong ? "text-[17px] font-extrabold" : "font-bold"}`}>{value}</dd>
    </div>
  );
}
