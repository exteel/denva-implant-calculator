import type { GeoScope, PriceMeta } from "../../lib/contracts";

const SCOPE_GENITIVE: Record<GeoScope, string> = {
  city: "міста",
  region: "області",
  country: "України",
};

/**
 * "прайсів N клінік": the noun after N inside the genitive phrase —
 * "21 клініки", but "2 клінік", "3 клінік", "5 клінік".
 */
export function clinicsGenitive(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  return abs % 10 === 1 && abs % 100 !== 11 ? "клініки" : "клінік";
}

/**
 * ТЗ §6.1: the source of the prices, without clinic names.
 * 0 local clinics → market benchmark of the city / region / Ukraine;
 * 1–2 → verified prices of N clinics + market data of the baseline scope;
 * 3+  → computed from the verified prices of N clinics of the city.
 */
export function sourceSentence(meta: Pick<PriceMeta, "local_clinic_count" | "source_scope" | "baseline_scope">): string {
  const n = Math.max(0, Math.trunc(meta.local_clinic_count));
  if (n === 0) {
    return `Використано середній ринковий орієнтир ${SCOPE_GENITIVE[meta.source_scope]}`;
  }
  if (n <= 2) {
    const baseline = meta.baseline_scope ?? meta.source_scope;
    return `Враховано перевірені прайси ${n} ${clinicsGenitive(n)} міста та середні ринкові дані ${SCOPE_GENITIVE[baseline]}`;
  }
  return `Розраховано на основі перевірених прайсів ${n} ${clinicsGenitive(n)} міста`;
}
