import type { PublicPrice } from "@/lib/contracts";
import { clinicsGenitive } from "./format";
import type { Line, SourceInfo, SourceKind } from "./types";

export const SOURCE_LABEL = {
  manual: "статистичний орієнтир Denva",
  regional: "середня ціна регіону",
} as const;

/** ТЗ §6.1: "на основі прайсів 3 клінік" (the plural is Ukrainian-correct). */
export function aggregateLabel(clinicCount: number | null): string {
  if (clinicCount === null) return "на основі прайсів клінік";
  return `на основі прайсів ${clinicCount} ${clinicsGenitive(clinicCount)}`;
}

function kindOf(price: Pick<PublicPrice, "source_type">): SourceKind {
  switch (price.source_type) {
    case "aggregate":
      return "aggregate";
    case "regional_fallback":
      return "regional";
    default:
      // manual and manual_override are both "статистичний орієнтир Denva".
      return "manual";
  }
}

/** Oldest date a price is "as of": the aggregate snapshot, else publication. */
function priceDate(price: PublicPrice): string {
  return (price.calculated_at ?? price.published_at).slice(0, 10);
}

/**
 * Source label for the prices a result was built from (ТЗ §6.1).
 * Only when every line is an aggregate does the label name a clinic count;
 * any manual line downgrades it to "статистичний орієнтир Denva", and any
 * regional fallback to "середня ціна регіону" (the strongest caveat wins).
 */
export function computeSource(used: PublicPrice[], city: string): SourceInfo | null {
  if (used.length === 0) return null;
  const kinds = new Set(used.map(kindOf));
  const kind: SourceKind = kinds.has("regional") ? "regional" : kinds.has("manual") ? "manual" : "aggregate";

  const counts = used
    .filter((p) => kindOf(p) === "aggregate" && p.clinic_count !== null)
    .map((p) => p.clinic_count as number);
  const clinicCount = counts.length > 0 ? Math.min(...counts) : null;

  const label =
    kind === "aggregate" ? aggregateLabel(clinicCount) : kind === "manual" ? SOURCE_LABEL.manual : SOURCE_LABEL.regional;

  return {
    kind,
    label,
    mixed: kinds.size > 1,
    clinicCount,
    dateIso: used.map(priceDate).sort()[0],
    city,
    demo: used.some((p) => p.is_demo),
  };
}

/** Per-line hint in the breakdown; shown only when the sources are mixed. */
export function lineSourceLabel(line: Pick<Line, "source" | "clinicCount">): string | null {
  switch (line.source) {
    case "aggregate":
      return aggregateLabel(line.clinicCount);
    case "regional_fallback":
      return SOURCE_LABEL.regional;
    case "manual":
    case "manual_override":
      return SOURCE_LABEL.manual;
    default:
      return null;
  }
}
