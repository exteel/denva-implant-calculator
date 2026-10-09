#!/usr/bin/env node
/**
 * Generates src/engine/market-data/demo-prices.json — DEMO market data only
 * (is_demo: true). Deterministic: a seeded hash gives every code × scope a
 * small stable jitter, so re-running yields an identical file.
 *
 *   node scripts/generate-demo-prices.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "engine",
  "market-data",
  "demo-prices.json",
);

const SEGMENTS = ["BASIC", "OPTIMAL", "PREMIUM"];

// Country-level medians, UAH. [BASIC, OPTIMAL, PREMIUM]
const SEGMENTED = {
  IMPLANT_SURGICAL: [14000, 20000, 30000],
  PROSTHETIC_ON_IMPLANT: [10000, 15000, 22000],
  BRIDGE_PONTIC: [6000, 9000, 13000],
  HEALING_ABUTMENT: [1500, 2000, 3000],
  TEMP_CROWN_PACKAGE: [3000, 4000, 5500],
  MULTI_UNIT: [4000, 6000, 9000],
  ARCH_TEMP_FIXED: [30000, 40000, 55000],
  ARCH_FINAL: [90000, 140000, 230000],
};
const UNSEGMENTED = {
  DIAGNOSTICS_SCAN: 2000,
  ARCH_SCAN: 2500,
  ARCH_RESCAN: 2500,
};
const EXTRAS = {
  EXTRACTION_SIMPLE: 1100,
  EXTRACTION_COMPLEX: 2500,
  BONE_AUGMENTATION: 12000,
  SINUS_LIFT: 18000,
  SOFT_TISSUE_GRAFT: 7500,
  SURGICAL_GUIDE: 4500,
  SEDATION: 4000,
  TEMPORARY_CROWN: 2500,
};

const MACRO = {
  kyiv: { mult: 1.15, n: 60 },
  west: { mult: 0.95, n: 40 },
  center: { mult: 0.92, n: 25 },
  south: { mult: 1.0, n: 30 },
  east: { mult: 0.95, n: 22 },
  north: { mult: 0.88, n: 12 },
};

const CITY = {
  kyiv: { mult: 1.15, n: 45 },
  lviv: { mult: 1.0, n: 32 },
  odesa: { mult: 1.02, n: 24, updated: "2026-03-15" },
  dnipro: { mult: 0.97, n: 22 },
  kharkiv: { mult: 0.95, n: 18 },
  "ivano-frankivsk": { mult: 0.93, n: 14 },
  chernivtsi: { mult: 0.9, n: 9 }, // deliberately insufficient
  vinnytsia: { mult: 0.92, n: 6, updated: "2025-11-20" }, // insufficient + older
};

const OBLAST = {
  lvivska: { mult: 0.97, n: 35 },
  chernivetska: { mult: 0.9, n: 11, updated: "2025-06-15" }, // stale
};

// Cities/oblasts only carry these codes; the rest fall back per line.
const LOCAL_EXTRAS = [
  "EXTRACTION_SIMPLE",
  "EXTRACTION_COMPLEX",
  "BONE_AUGMENTATION",
  "SINUS_LIFT",
];

const DEFAULT_UPDATED = "2026-09-01";
const SOURCES = ["clinic_sites", "price_lists", "patient_quotes"];

// ───────────── deterministic helpers ─────────────

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable factor in [1 - amp, 1 + amp]. */
function jitter(key, amp = 0.03) {
  return 1 + (mulberry32(hash(key))() * 2 - 1) * amp;
}

const round100 = (x) => Math.round(x / 100) * 100;

function record({ code, scope, segment, median, n, spread, updated }) {
  const [lo, hi] = spread;
  const m = round100(median);
  let p25 = round100(m * lo);
  let p75 = round100(m * hi);
  if (p25 >= m) p25 = m - 100;
  if (p75 <= m) p75 = m + 100;
  return {
    service_or_basket: code,
    geo_scope: scope,
    segment,
    p25,
    median: m,
    p75,
    n,
    source_mix: { clinics: Math.max(3, Math.round(n / 3)), sources: SOURCES },
    updated_at: updated ?? DEFAULT_UPDATED,
    original_currency: "UAH",
    is_demo: true,
  };
}

const PRICE_SPREAD = [0.85, 1.18];
const EXTRA_SPREAD = [0.75, 1.35];

/** All (code, segment, base median, spread) entries for the given code filter. */
function entries(filter) {
  const out = [];
  for (const [code, vals] of Object.entries(SEGMENTED)) {
    if (!filter(code)) continue;
    SEGMENTS.forEach((segment, i) =>
      out.push({ code, segment, base: vals[i], spread: PRICE_SPREAD }),
    );
  }
  for (const [code, base] of Object.entries(UNSEGMENTED)) {
    if (!filter(code)) continue;
    out.push({ code, segment: null, base, spread: PRICE_SPREAD });
  }
  for (const [code, base] of Object.entries(EXTRAS)) {
    if (!filter(code)) continue;
    out.push({ code, segment: null, base, spread: EXTRA_SPREAD });
  }
  return out;
}

const records = [];

// Country — exact medians, n = 120+.
for (const e of entries(() => true)) {
  const scope = { level: "country", id: "UA" };
  const n = 120 + (hash(`${e.code}|${e.segment}|UA`) % 40);
  records.push(
    record({ ...scopeArgs(e, scope, 1, n, null) }),
  );
}

function scopeArgs(e, scope, mult, n, updated) {
  const key = `${e.code}|${e.segment}|${scope.level}:${scope.id}`;
  const j = scope.level === "country" ? 1 : jitter(key);
  return {
    code: e.code,
    scope,
    segment: e.segment,
    median: e.base * mult * j,
    n,
    spread: e.spread,
    updated,
  };
}

// Macroregions — all codes.
for (const [id, cfg] of Object.entries(MACRO)) {
  for (const e of entries(() => true)) {
    records.push(
      record(scopeArgs(e, { level: "macroregion", id }, cfg.mult, cfg.n, cfg.updated)),
    );
  }
}

const localFilter = (code) =>
  code in SEGMENTED ||
  code === "DIAGNOSTICS_SCAN" ||
  LOCAL_EXTRAS.includes(code);

for (const [id, cfg] of Object.entries(CITY)) {
  for (const e of entries(localFilter)) {
    records.push(
      record(scopeArgs(e, { level: "city", id }, cfg.mult, cfg.n, cfg.updated)),
    );
  }
}
for (const [id, cfg] of Object.entries(OBLAST)) {
  for (const e of entries(localFilter)) {
    records.push(
      record(scopeArgs(e, { level: "oblast", id }, cfg.mult, cfg.n, cfg.updated)),
    );
  }
}

// Basket-level records (SINGLE_TOOTH_STANDARD) to exercise precedence.
// Median ≈ composed sum (1 implant + 1 prosthetic unit + diagnostics) × small jitter.
const basketScopes = [
  { scope: { level: "city", id: "kyiv" }, mult: CITY.kyiv.mult, n: CITY.kyiv.n },
  { scope: { level: "country", id: "UA" }, mult: 1, n: 135 },
];
for (const { scope, mult, n } of basketScopes) {
  SEGMENTS.forEach((segment, i) => {
    const composed =
      SEGMENTED.IMPLANT_SURGICAL[i] +
      SEGMENTED.PROSTHETIC_ON_IMPLANT[i] +
      UNSEGMENTED.DIAGNOSTICS_SCAN;
    const key = `SINGLE_TOOTH_STANDARD|${segment}|${scope.level}:${scope.id}`;
    records.push(
      record({
        code: "SINGLE_TOOTH_STANDARD",
        scope,
        segment,
        median: composed * mult * jitter(key, 0.02),
        n,
        spread: PRICE_SPREAD,
      }),
    );
  });
}

// One record per line keeps the file compact and diffs readable.
const body = records.map((r) => "  " + JSON.stringify(r)).join(",\n");
writeFileSync(OUT, `[\n${body}\n]\n`);
console.log(`Wrote ${records.length} demo records to ${OUT}`);
