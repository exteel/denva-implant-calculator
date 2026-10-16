import type { PriceMode, Tier } from "@/lib/contracts";
import type { BenchmarkChange, BenchmarkScope } from "./api";
import { cellKey, parseDecimal } from "./helpers";

/** Pending edit of one grid cell (strings straight from the inputs). */
export interface CellEdit {
  value?: string;
  mode?: PriceMode;
  override?: string;
}

export interface Original {
  values: ReadonlyMap<string, number>;
  modes: ReadonlyMap<string, { mode: PriceMode; override_value: number | null }>;
}

export interface ComputedChanges {
  changes: BenchmarkChange[];
  /** cell key → message for cells that block saving. */
  invalid: Map<string, string>;
  /** manual_override among the changes → a reason is mandatory (ТЗ §2.3). */
  needsReason: boolean;
}

/** Diffs the edits against the stored values and validates them. Pure. */
export function computeChanges(edits: Record<string, CellEdit>, original: Original, scope: BenchmarkScope): ComputedChanges {
  const changes: BenchmarkChange[] = [];
  const invalid = new Map<string, string>();
  for (const [key, edit] of Object.entries(edits)) {
    const [service_code, tier] = key.split("|") as [string, Tier];
    const change: BenchmarkChange = { service_code, tier };

    if (edit.value !== undefined) {
      const parsed = parseDecimal(edit.value);
      const was = original.values.get(key);
      if (parsed !== null && (Number.isNaN(parsed) || parsed <= 0)) invalid.set(key, "Значення має бути числом більше нуля.");
      else if (parsed === null && was !== undefined) change.value = null;
      else if (parsed !== null && parsed !== was) change.value = parsed;
    }

    if (scope === "city") {
      const stored = original.modes.get(key);
      const mode = edit.mode ?? stored?.mode ?? "auto";
      const storedOverride = stored?.override_value ?? null;
      if (mode === "manual_override") {
        const raw = edit.override ?? (storedOverride === null ? "" : String(storedOverride));
        const parsed = parseDecimal(raw);
        if (parsed === null || Number.isNaN(parsed) || parsed <= 0) {
          invalid.set(key, "Override потребує значення більше нуля.");
        } else if ((stored?.mode ?? "auto") !== "manual_override" || parsed !== storedOverride) {
          change.mode = "manual_override";
          change.overrideValue = parsed;
        }
      } else if ((stored?.mode ?? "auto") !== mode) {
        change.mode = mode;
      }
    }

    if (change.value !== undefined || change.mode !== undefined) changes.push(change);
  }
  return { changes, invalid, needsReason: changes.some((c) => c.mode === "manual_override") };
}

export { cellKey };
