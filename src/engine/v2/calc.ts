/**
 * DENVA AI v2 formulas — ТЗ §4. Pure functions: published prices in, totals
 * and a short breakdown out. A price that is not published is never
 * invented: the affected total becomes null ("Даних поки недостатньо").
 */
import { SERVICE_CODES, type PatientTier, type PublicPrice, type ServiceCode, type Tier } from "@/lib/contracts";
import { pluralUk } from "./format";
import { isArchLike, jawsOf, scenarioKind } from "./params";
import type { PriceBook } from "./prices";
import { computeSource } from "./source";
import type { AddonItem, Calculation, Group, Line, Params, Range, Scenario, Tiers } from "./types";

const C = SERVICE_CODES;

/** ТЗ §4.2: adjacent teeth → [implants, crowns]. */
export const ADJACENT_TABLE: Record<number, readonly [implants: number, crowns: number]> = {
  2: [2, 2],
  3: [2, 3],
  4: [2, 4],
  5: [3, 5],
  6: [3, 6],
};

interface Collector {
  used: Map<string, PublicPrice>;
  missing: Set<ServiceCode>;
}

function newCollector(): Collector {
  return { used: new Map(), missing: new Set() };
}

function makeLine(book: PriceBook, col: Collector, code: ServiceCode, tier: Tier, qty: number): Line {
  const price = book.get(code, tier);
  const label = book.name(code);
  if (!price) {
    col.missing.add(code);
    return { code, label, tier, qty, unitUah: null, totalUah: null, source: null, clinicCount: null };
  }
  col.used.set(`${code}|${tier}`, price);
  return {
    code,
    label,
    tier,
    qty,
    unitUah: price.value,
    totalUah: price.value * qty,
    source: price.source_type,
    clinicCount: price.clinic_count,
  };
}

function makeGroup(id: string, title: string, lines: Line[]): Group {
  const totalUah = lines.some((l) => l.totalUah === null)
    ? null
    : lines.reduce((sum, l) => sum + (l.totalUah ?? 0), 0);
  return { id, title, lines, totalUah };
}

const exact = (value: number): Range => ({ low: value, high: value });

// ───────────────────────── building blocks ─────────────────────────

/** Implant + healing + scan + superstructure + crown for `implants`/`crowns` (ТЗ §4.1–4.2). */
function implantGroup(
  book: PriceBook,
  col: Collector,
  tiers: Tiers,
  id: string,
  title: string,
  implants: number,
  crowns: number,
): Group {
  return makeGroup(id, title, [
    makeLine(book, col, C.IMPLANT_INSTALL, tiers.implant, implants),
    makeLine(book, col, C.HEALING_ABUTMENT, "common", implants),
    makeLine(book, col, C.SCAN_BOTH, "common", 1),
    makeLine(book, col, C.SUPERSTRUCTURE_SET, "common", implants),
    makeLine(book, col, C.CROWN_IMPLANT, tiers.crown, crowns),
  ]);
}

/** Prosthetics on an implant that is already in the bone (ТЗ §4.1). */
function placedImplantGroup(book: PriceBook, col: Collector, tiers: Tiers): Group {
  return makeGroup("placed", "Протезування на встановленому імпланті", [
    makeLine(book, col, C.SUPERSTRUCTURE_SET, "common", 1),
    makeLine(book, col, C.CROWN_IMPLANT, tiers.crown, 1),
    makeLine(book, col, C.SCAN_BOTH, "common", 1),
  ]);
}

/** Full arch, ТЗ §4.3: two groups = first stage and the permanent stage. */
function archGroups(book: PriceBook, col: Collector, tiers: Tiers, jaws: 1 | 2, implantsPerJaw: number): Group[] {
  const implants = implantsPerJaw * jaws;
  const first = makeGroup("first_stage", "Перший етап (з тимчасовими зубами)", [
    makeLine(book, col, C.IMPLANT_INSTALL, tiers.implant, implants),
    makeLine(book, col, C.MULTIUNIT, "common", implants),
    makeLine(book, col, C.ARCH_TEMP, "common", jaws),
    // One scan per stage, even for two jaws.
    makeLine(book, col, C.SCAN_BOTH, "common", 1),
  ]);
  const permanent = makeGroup("permanent", "Постійна конструкція", [
    makeLine(book, col, C.ARCH_FINAL, tiers.crown, jaws),
    makeLine(book, col, C.SCAN_BOTH, "common", 1),
  ]);
  return [first, permanent];
}

function implantsWord(n: number): string {
  return `${n} ${pluralUk(n, "імплант", "імпланти", "імплантів")}`;
}
function crownsWord(n: number): string {
  return `${n} ${pluralUk(n, "коронка", "коронки", "коронок")}`;
}

/**
 * TODO(owner): ТЗ §4.2 "7+ → порівняти сегментний міст і All-on-4/6/8".
 * The segmental-bridge formula has not been provided yet. Until it is, the
 * result shows only All-on plus a sentence that a segmental bridge may be
 * possible and the doctor decides the scheme. Return a Scenario here once
 * the formula is known; the UI already renders it next to All-on.
 */
export function sevenPlusSegmentScenario(): Scenario | null {
  return null;
}

// ───────────────────────── calculate ─────────────────────────

const EMPTY: Omit<Calculation, "kind" | "groups" | "missing" | "source"> = {
  main: null,
  permanent: null,
  full: null,
  implants: null,
  segment: null,
  rangeNote: null,
};

export function calculate(book: PriceBook, params: Params, tiers: Tiers): Calculation {
  const kind = scenarioKind(params);
  const col = newCollector();
  let result: Pick<Calculation, "groups" | "main" | "permanent" | "full" | "implants" | "segment" | "rangeNote">;

  if (kind === "single" || kind === "reference") {
    const group =
      kind === "single" && params.toothState === "implant_placed"
        ? placedImplantGroup(book, col, tiers)
        : implantGroup(book, col, tiers, "tooth", "Один зуб", 1, 1);
    result = {
      ...EMPTY,
      groups: [group],
      main: group.totalUah === null ? null : exact(group.totalUah),
      implants: group.id === "placed" ? 0 : 1,
    };
  } else if (kind === "multi") {
    const n = params.teeth;
    const [adjImplants, adjCrowns] = ADJACENT_TABLE[n];
    const adjacent = implantGroup(
      book,
      col,
      tiers,
      "adjacent",
      `Зуби поруч: ${implantsWord(adjImplants)} і ${crownsWord(adjCrowns)} (міст)`,
      adjImplants,
      adjCrowns,
    );
    const separate = implantGroup(
      book,
      col,
      tiers,
      "separate",
      `Окремі імпланти: ${implantsWord(n)} і ${crownsWord(n)}`,
      n,
      n,
    );
    if (params.arrangement === "adjacent") {
      result = { ...EMPTY, groups: [adjacent], main: toRange([adjacent]), implants: adjImplants };
    } else if (params.arrangement === "separate") {
      result = { ...EMPTY, groups: [separate], main: toRange([separate]), implants: n };
    } else {
      // Mixed / unknown: from the bridge (low) to separate implants (high).
      result = {
        ...EMPTY,
        groups: [adjacent, separate],
        main: toRange([adjacent, separate]),
        implants: null,
        rangeNote:
          "Остаточну схему — міст чи окремі імпланти — визначає лікар після огляду та КТ, тому показано діапазон: від варіанту «зуби поруч» до варіанту «окремі імпланти».",
      };
    }
  } else {
    // arch + seven_plus: All-on-N, one or two jaws.
    const jaws = jawsOf(params);
    const groups = archGroups(book, col, tiers, jaws, params.allOn);
    const [first, permanent] = groups;
    const full =
      first.totalUah === null || permanent.totalUah === null ? null : exact(first.totalUah + permanent.totalUah);
    result = {
      ...EMPTY,
      groups,
      main: first.totalUah === null ? null : exact(first.totalUah),
      permanent: permanent.totalUah === null ? null : exact(permanent.totalUah),
      full,
      implants: params.allOn * jaws,
      segment: kind === "seven_plus" ? sevenPlusSegmentScenario() : null,
    };
  }

  return {
    kind,
    ...result,
    missing: [...col.missing],
    source: computeSource([...col.used.values()], book.locationName),
  };
}

function toRange(groups: Group[]): Range | null {
  const totals = groups.map((g) => g.totalUah);
  if (totals.some((t) => t === null)) return null;
  const values = totals as number[];
  return { low: Math.min(...values), high: Math.max(...values) };
}

/** The three starting presets (ТЗ §6.1): both levels equal. */
export function presetTiers(tier: PatientTier): Tiers {
  return { implant: tier, crown: tier };
}

export function calculatePresets(book: PriceBook, params: Params): Record<PatientTier, Calculation> {
  return {
    minimum: calculate(book, params, presetTiers("minimum")),
    classic: calculate(book, params, presetTiers("classic")),
    premium: calculate(book, params, presetTiers("premium")),
  };
}

// ───────────────────────── add-ons (ТЗ §4, §5.4, §6.1) ─────────────────────────

const ADDON_CODES: readonly ServiceCode[] = [
  C.EXTRACTION_SIMPLE,
  C.EXTRACTION_COMPLEX,
  C.TEMP_CROWN_UNIT,
  C.AUGMENT,
  C.SINUS,
  C.SOFT_TISSUE,
  C.SEDATION,
  C.SURGICAL_GUIDE,
];
const EXTRACTION_CODES: readonly ServiceCode[] = [C.EXTRACTION_SIMPLE, C.EXTRACTION_COMPLEX];

/**
 * Possible extra costs. They are NEVER part of any total; a doctor confirms
 * them. Only add-ons with a published price are listed.
 */
export function listAddons(book: PriceBook, params: Params): AddonItem[] {
  const arch = isArchLike(scenarioKind(params));
  const items: AddonItem[] = [];
  for (const code of ADDON_CODES) {
    // A full arch carries its own temporary teeth (ARCH_TEMP).
    if (arch && code === C.TEMP_CROWN_UNIT) continue;
    const price = book.get(code, "common") ?? book.get(code, "classic");
    if (!price) continue;
    items.push({
      code,
      name: book.name(code),
      unit: book.service(code)?.unit ?? "",
      valueUah: price.value,
      highlight: params.teethPresent && EXTRACTION_CODES.includes(code),
    });
  }
  // Extraction first when the teeth are still there.
  return items.sort((a, b) => Number(b.highlight) - Number(a.highlight));
}
