import { moneyLines, type Currency } from "@/engine/v3/format";
import type { MoneyRange } from "@/lib/contracts";

export const NO_DATA = "Даних поки недостатньо";

interface Props {
  range: MoneyRange | null;
  currency: Currency;
  eurRate: { rate: number } | null;
  /** Tailwind classes of the main figure. */
  mainClass?: string;
  testId?: string;
  align?: "left" | "right";
}

/** The amount in the chosen main currency with the other one below (ТЗ §4.7). */
export function Money({ range, currency, eurRate, mainClass = "text-[26px] font-extrabold", testId, align = "left" }: Props) {
  if (!range) {
    return (
      <span data-testid={testId} className={`block text-[15px] font-bold text-muted ${align === "right" ? "text-right" : ""}`}>
        {NO_DATA}
      </span>
    );
  }
  const { main, second } = moneyLines(range, currency, eurRate);
  return (
    <span className={`tabular block ${align === "right" ? "text-right" : ""}`}>
      <span data-testid={testId} className={`block leading-tight ${mainClass}`}>
        {main}
      </span>
      {second && (
        <span data-testid={testId ? `${testId}-second` : undefined} className="block text-sm font-semibold text-muted">
          {second}
        </span>
      )}
    </span>
  );
}

/** Inline amount (breakdown rows) — main currency only. */
export function inlineMoney(range: MoneyRange, currency: Currency, eurRate: { rate: number } | null): string {
  return moneyLines(range, currency, eurRate).main;
}
