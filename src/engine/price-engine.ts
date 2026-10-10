/**
 * Regional price engine (ТЗ §3, §8, §13, §17, §18).
 *
 *   lookupPrice   — geo fallback for a single (code, segment)
 *   priceScenario — compose baskets into lines, apply package (3×3), sum ranges
 *   priceExtras   — indicative ranges for optional procedures (never in total)
 */
import { BASKETS, COMPONENT_INFO, EXTRA_INFO } from "./catalog";
import type { BasketComponentLine } from "./catalog";
import { assessMarketRecord, isSufficientRecord, minMarketConfidence } from "./confidence";
import { GEO_LEVEL_RANK, geoChain } from "./geo";
import { isAlignedPackage } from "./segments";
import { MARKET_DATA } from "./market-data";
import type {
  BasketCode,
  MarketConfidenceReason,
  BasketModifiers,
  GeoScope,
  MarketConfidence,
  MarketMeta,
  MarketPriceRecord,
  PackageChoice,
  PriceCode,
  PriceRange,
  PricedExtra,
  PricedLine,
  PricedScenario,
  RelevantExtra,
  Scenario,
  Segment,
} from "./types";

export interface EngineOptions {
  data?: MarketPriceRecord[];
  now?: Date;
}

export interface ResolvedRecord {
  record: MarketPriceRecord;
  scope: GeoScope;
  usedFallback: boolean;
  confidence: MarketConfidence;
  /** ТЗ §16.2 factors that lowered the confidence of this record. */
  confidenceReasons: MarketConfidenceReason[];
}

// ───────────────────────── Lookup ─────────────────────────

type Index = Map<string, MarketPriceRecord>;
const INDEX_CACHE = new WeakMap<MarketPriceRecord[], Index>();

const recordKey = (
  code: PriceCode,
  segment: Segment | null,
  scope: GeoScope,
): string => `${code}|${segment ?? "-"}|${scope.level}:${scope.id}`;

function indexFor(data: MarketPriceRecord[]): Index {
  let idx = INDEX_CACHE.get(data);
  if (!idx) {
    idx = new Map();
    for (const r of data) {
      idx.set(recordKey(r.service_or_basket, r.segment, r.geo_scope), r);
    }
    INDEX_CACHE.set(data, idx);
  }
  return idx;
}

export function lookupPrice(
  code: PriceCode,
  segment: Segment | null,
  locationId: string,
  opts: EngineOptions = {},
): ResolvedRecord | null {
  const idx = indexFor(opts.data ?? MARKET_DATA);
  const now = opts.now ?? new Date();
  const chain = geoChain(locationId);

  let broadest: { record: MarketPriceRecord; scope: GeoScope } | null = null;
  let chosen: { record: MarketPriceRecord; scope: GeoScope } | null = null;
  for (const scope of chain) {
    const record = idx.get(recordKey(code, segment, scope));
    if (!record) continue;
    broadest = { record, scope };
    if (isSufficientRecord(record)) {
      chosen = { record, scope };
      break;
    }
  }
  const pick = chosen ?? broadest;
  if (!pick) return null;
  const assessment = assessMarketRecord(pick.record, now);
  return {
    record: pick.record,
    scope: pick.scope,
    usedFallback: pick.scope.level !== chain[0].level,
    confidence: pick.record.confidence ?? assessment.level,
    confidenceReasons: assessment.reasons,
  };
}

// ───────────────────────── Helpers ─────────────────────────

const round100 = (n: number) => Math.round(n / 100) * 100;

const ZERO: PriceRange = { p25: 0, median: 0, p75: 0 };

function addRange(a: PriceRange, b: PriceRange): PriceRange {
  return {
    p25: a.p25 + b.p25,
    median: a.median + b.median,
    p75: a.p75 + b.p75,
  };
}

function roundRange(r: PriceRange): PriceRange {
  return { p25: round100(r.p25), median: round100(r.median), p75: round100(r.p75) };
}

function scaleRange(r: PriceRange, q: number): PriceRange {
  return { p25: r.p25 * q, median: r.median * q, p75: r.p75 * q };
}

function broaderScope(a: GeoScope, b: GeoScope): GeoScope {
  return GEO_LEVEL_RANK[b.level] > GEO_LEVEL_RANK[a.level] ? b : a;
}

/**
 * Scales the composed breakdown so it sums exactly to a basket-level record
 * — the "Деталізація" table must never disagree with the total shown.
 * Rounding leftovers go to the largest line.
 */
function scaleLinesTo(lines: PricedLine[], target: PriceRange): Map<PricedLine, PricedLine> {
  const keys: (keyof PriceRange)[] = ["p25", "median", "p75"];
  const scaled = lines.map((l) => ({ ...l, range: { ...l.range } }));
  for (const key of keys) {
    const composed = lines.reduce((acc, l) => acc + l.range[key], 0);
    if (composed <= 0 || scaled.length === 0) continue;
    const factor = target[key] / composed;
    scaled.forEach((l, i) => (l.range[key] = Math.round((lines[i].range[key] * factor) / 100) * 100));
    const diff = target[key] - scaled.reduce((acc, l) => acc + l.range[key], 0);
    const largest = scaled.reduce((best, l) => (l.range[key] > best.range[key] ? l : best), scaled[0]);
    largest.range[key] += diff;
  }
  return new Map(lines.map((l, i) => [l, scaled[i]]));
}

function sameModifiers(a: BasketModifiers, b: BasketModifiers): boolean {
  return (
    a.implants === b.implants &&
    a.existingImplants === b.existingImplants &&
    a.units === b.units &&
    a.tempCrowns === b.tempCrowns
  );
}

function missing(code: PriceCode, segment: Segment | null, locationId: string): Error {
  return new Error(
    `Немає ринкових даних для ${code}${segment ? ` (${segment})` : ""} ` +
      `у жодному географічному рівні для "${locationId}"`,
  );
}

function buildMeta(resolved: ResolvedRecord[]): MarketMeta {
  const first = resolved[0];
  let geoScope = first.scope;
  let updatedAt = first.record.updated_at;
  let minN = first.record.n;
  for (const r of resolved) {
    geoScope = broaderScope(geoScope, r.scope);
    if (r.record.updated_at < updatedAt) updatedAt = r.record.updated_at;
    if (r.record.n < minN) minN = r.record.n;
  }
  const confidenceReasons = [...new Set(resolved.flatMap((r) => r.confidenceReasons))];
  return {
    confidence: minMarketConfidence(resolved.map((r) => r.confidence)),
    minN,
    geoScope,
    usedFallback: resolved.some((r) => r.usedFallback),
    isDemo: resolved.some((r) => r.record.is_demo),
    updatedAt,
    confidenceReasons,
  };
}

// ───────────────────────── Scenario pricing ─────────────────────────

export function priceScenario(
  scenario: Scenario,
  locationId: string,
  pkg: PackageChoice,
  opts: EngineOptions = {},
): PricedScenario {
  const multiPart = scenario.parts.length > 1;
  const seenPerTreatment = new Set<string>();
  let lines: PricedLine[] = [];
  const resolved: ResolvedRecord[] = [];
  let isFullArch = false;

  for (const part of scenario.parts) {
    const basket = BASKETS[part.basket];
    if (basket.isFullArch) isFullArch = true;
    const composed: BasketComponentLine[] = basket.compose(part.modifiers);

    for (const line of composed) {
      const info = COMPONENT_INFO[line.code];
      if (info.perTreatment) {
        if (seenPerTreatment.has(line.code)) continue;
        seenPerTreatment.add(line.code);
      }
      const segment: Segment | null =
        info.axis === "implant"
          ? pkg.implant
          : info.axis === "prosthetic"
            ? pkg.prosthetic
            : null;
      const res = lookupPrice(line.code, segment, locationId, opts);
      if (!res) throw missing(line.code, segment, locationId);
      resolved.push(res);

      const shared = info.perTreatment && multiPart;
      const priced: PricedLine = {
        code: line.code,
        label: info.label,
        quantity: line.quantity,
        unitLabel: info.unitLabel,
        axis: info.axis,
        segment,
        range: roundRange(
          scaleRange(
            { p25: res.record.p25, median: res.record.median, p75: res.record.p75 },
            line.quantity,
          ),
        ),
        geoScope: res.scope,
      };
      if (line.stage) priced.stage = line.stage;
      if (part.arch && !shared) priced.arch = part.arch;
      lines.push(priced);
    }
  }

  const sum = (ls: PricedLine[]) =>
    roundRange(ls.reduce((acc, l) => addRange(acc, l.range), ZERO));

  let total = sum(lines);
  let market = buildMeta(resolved);
  let source: PricedScenario["source"] = "composed";

  // Basket-level record takes precedence for the unmodified reference
  // scenario. SINGLE_TOOTH_TEMP is calibrated by the STANDARD record plus its
  // own temp-crown line, so toggling the temp crown adds exactly that line.
  // Full-arch records are never used as a single total because they carry no
  // per-stage values (ТЗ §12 requires stage 1 + stage 2 = full).
  if (scenario.parts.length === 1 && isAlignedPackage(pkg) && !isFullArch) {
    const part = scenario.parts[0];
    const isTemp = part.basket === "SINGLE_TOOTH_TEMP";
    const calibration: BasketCode = isTemp ? "SINGLE_TOOTH_STANDARD" : part.basket;
    const expected = BASKETS[calibration].defaultModifiers;
    const modifiers = isTemp ? { ...part.modifiers, tempCrowns: 0 } : part.modifiers;
    if (sameModifiers(modifiers, expected)) {
      const basketRes = lookupPrice(calibration, pkg.implant, locationId, opts);
      if (basketRes) {
        const broadestLine = resolved.reduce(
          (acc, r) => broaderScope(acc, r.scope),
          resolved[0].scope,
        );
        if (
          GEO_LEVEL_RANK[basketRes.scope.level] <=
          GEO_LEVEL_RANK[broadestLine.level]
        ) {
          const record = roundRange({
            p25: basketRes.record.p25,
            median: basketRes.record.median,
            p75: basketRes.record.p75,
          });
          const calibrated = lines.filter((l) => l.code !== "TEMP_CROWN_PACKAGE");
          const scaled = scaleLinesTo(calibrated, record);
          lines = lines.map((l) => scaled.get(l) ?? l);
          total = sum(lines);
          market = buildMeta(
            isTemp
              ? [basketRes, ...resolved.filter((_, i) => lines[i]?.code === "TEMP_CROWN_PACKAGE")]
              : [basketRes],
          );
          source = "basket_record";
        }
      }
    }
  }

  const result: PricedScenario = {
    scenarioId: scenario.id,
    package: { ...pkg },
    total,
    lines,
    market,
    source,
  };

  if (isFullArch) {
    // ТЗ §12: stage 1 + stage 2 = full treatment.
    result.stage1 = sum(lines.filter((l) => l.stage === 1));
    result.stage2 = sum(lines.filter((l) => l.stage === 2));
    if (source === "composed") {
      result.total = roundRange(addRange(result.stage1, result.stage2));
    }
  }
  return result;
}

// ───────────────────────── Extras ─────────────────────────

export function priceExtras(
  extras: RelevantExtra[],
  locationId: string,
  opts: EngineOptions = {},
): PricedExtra[] {
  return extras.map((extra) => {
    const res = lookupPrice(extra.code, null, locationId, opts);
    if (!res) throw missing(extra.code, null, locationId);
    const info = EXTRA_INFO[extra.code];
    const quantity = extra.quantity ?? 1;
    const unitRange = roundRange({
      p25: res.record.p25,
      median: res.record.median,
      p75: res.record.p75,
    });
    const priced: PricedExtra = {
      code: extra.code,
      label: info.label,
      unitLabel: info.unitLabel,
      unitRange,
      quantity,
      range: roundRange(scaleRange(unitRange, quantity)),
      geoScope: res.scope,
      confidence: res.confidence,
    };
    if (extra.note) priced.note = extra.note;
    return priced;
  });
}

// ───────────────────────── "What's included" ─────────────────────────

const ARCH_PREFIX = { UPPER: "Верхня щелепа", LOWER: "Нижня щелепа" } as const;

export function scenarioIncluded(scenario: Scenario): string[] {
  const parts = scenario.parts;
  const differ =
    parts.length > 1 && new Set(parts.map((p) => p.basket)).size > 1;
  const out: string[] = [];
  const seen = new Set<string>();
  if (parts.length > 1 && !differ) {
    out.push("Розрахунок для обох щелеп: склад нижче — для кожної щелепи окремо, спільна діагностика — один раз");
  }
  for (const part of parts) {
    const prefix = differ && part.arch ? `${ARCH_PREFIX[part.arch]}: ` : "";
    // A multi-tooth basket where every implant already exists is only the
    // prosthetic stage — describe it like IMPLANT_ALREADY_PLACED.
    const def = BASKETS[part.basket];
    const prostheticOnly = !def.isFullArch && part.modifiers.implants === 0;
    const bullets = prostheticOnly ? BASKETS.IMPLANT_ALREADY_PLACED.included : def.included;
    for (const bullet of bullets) {
      const text = prefix + bullet;
      if (!seen.has(text)) {
        seen.add(text);
        out.push(text);
      }
    }
  }
  return out;
}
