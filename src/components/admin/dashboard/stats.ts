/**
 * Pure aggregation for the leads dashboard. Takes the `leads` rows as they come from
 * Supabase (payload = LeadPayload jsonb) and returns plain numbers — no React, no I/O.
 * Days are local-time days of the viewer's browser.
 */

export interface LeadRow {
  id: string;
  payload: Record<string, unknown> | null;
  phone: string | null;
  telegram_status: "pending" | "sent" | "failed" | string;
  attempts?: number | null;
  created_at: string;
}

export type Period = 7 | 30 | 90 | "all";
export const PERIODS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: 7, label: "7 днів" },
  { value: 30, label: "30 днів" },
  { value: 90, label: "90 днів" },
  { value: "all", label: "Усі" },
];

export const OTHER_LABEL = "Інші";
export const TOP_N = 10;
const MAX_DAY_BUCKETS = 120;

// ───────────── helpers ─────────────

const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function payloadOf(lead: LeadRow) {
  return obj(lead.payload);
}

/** Local YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// ───────────── test leads & period filter ─────────────

const TEST_PHONE_DIGITS = ["380000000000", "0000000000"];

/** Test lead: phone +380000000000 or scenario_label starting with "ТЕСТОВА". */
export function isTestLead(lead: LeadRow): boolean {
  const digits = (lead.phone ?? str(payloadOf(lead).phone) ?? "").replace(/\D/g, "");
  if (TEST_PHONE_DIGITS.includes(digits)) return true;
  const label = str(payloadOf(lead).scenario_label);
  return Boolean(label && label.toLocaleUpperCase("uk-UA").startsWith("ТЕСТОВА"));
}

export interface FilterOptions {
  period: Period;
  excludeTests: boolean;
  now?: Date;
}

/** First instant included by the period (null = no lower bound). */
export function periodStart(period: Period, now: Date): Date | null {
  return period === "all" ? null : addDays(startOfDay(now), -(period - 1));
}

export function filterLeads(leads: readonly LeadRow[], { period, excludeTests, now = new Date() }: FilterOptions): LeadRow[] {
  const from = periodStart(period, now);
  return leads.filter((l) => {
    const t = new Date(l.created_at);
    if (Number.isNaN(t.getTime())) return false;
    if (from && t < from) return false;
    if (excludeTests && isTestLead(l)) return false;
    return true;
  });
}

// ───────────── KPI ─────────────

export interface Summary {
  total: number;
  today: number;
  /** Mean of total_uah over leads that have a positive figure; null when none. */
  avgTotalUah: number | null;
  telegramSent: number;
  telegramFailed: number;
  telegramPending: number;
}

export function summarize(leads: readonly LeadRow[], now: Date = new Date()): Summary {
  const todayKey = dayKey(now);
  let sum = 0;
  let withSum = 0;
  let today = 0;
  let sent = 0;
  let failed = 0;
  let pending = 0;
  for (const l of leads) {
    if (dayKey(new Date(l.created_at)) === todayKey) today += 1;
    const total = payloadOf(l).total_uah;
    if (typeof total === "number" && total > 0) {
      sum += total;
      withSum += 1;
    }
    if (l.telegram_status === "sent") sent += 1;
    else if (l.telegram_status === "failed") failed += 1;
    else pending += 1;
  }
  return {
    total: leads.length,
    today,
    avgTotalUah: withSum ? Math.round(sum / withSum) : null,
    telegramSent: sent,
    telegramFailed: failed,
    telegramPending: pending,
  };
}

// ───────────── by day ─────────────

export interface Bucket {
  /** YYYY-MM-DD of the first day in the bucket. */
  start: string;
  /** YYYY-MM-DD of the last day in the bucket (= start for days). */
  end: string;
  count: number;
}

export interface TimeSeries {
  unit: "day" | "week";
  buckets: Bucket[];
}

function mondayOf(d: Date): Date {
  const shift = (d.getDay() + 6) % 7;
  return addDays(startOfDay(d), -shift);
}

/** Leads per day over the period; zero days stay as empty slots. "all" starts at the first lead. */
export function leadsPerDay(leads: readonly LeadRow[], period: Period, now: Date = new Date()): TimeSeries {
  const end = startOfDay(now);
  let start: Date;
  if (period === "all") {
    const first = leads.reduce<Date | null>((min, l) => {
      const t = new Date(l.created_at);
      return Number.isNaN(t.getTime()) || (min && min <= t) ? min : t;
    }, null);
    start = first ? startOfDay(first) : end;
  } else {
    start = addDays(end, -(period - 1));
  }

  const dayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const weekly = dayCount > MAX_DAY_BUCKETS;
  const buckets: Bucket[] = [];
  if (weekly) {
    for (let d = mondayOf(start); d <= end; d = addDays(d, 7)) {
      const last = addDays(d, 6);
      buckets.push({ start: dayKey(d), end: dayKey(last > end ? end : last), count: 0 });
    }
  } else {
    for (let d = start; d <= end; d = addDays(d, 1)) buckets.push({ start: dayKey(d), end: dayKey(d), count: 0 });
  }
  for (const l of leads) {
    const t = new Date(l.created_at);
    if (Number.isNaN(t.getTime())) continue;
    const key = dayKey(t);
    // buckets are sorted: the last one whose start <= key
    let lo = 0;
    let hi = buckets.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (buckets[mid].start <= key) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (found >= 0 && key <= buckets[found].end) buckets[found].count += 1;
  }
  return { unit: weekly ? "week" : "day", buckets };
}

// ───────────── breakdowns ─────────────

export interface BreakdownRow {
  label: string;
  count: number;
  /** Share of all leads in the breakdown, 0–100 (integer-rounded for display). */
  percent: number;
  /** True for the folded "Інші" row. */
  other?: boolean;
}

/** Counts by label, sorted desc (ties by label), top N + folded "Інші". */
export function countBy(leads: readonly LeadRow[], labelOf: (lead: LeadRow) => string, top: number = TOP_N): BreakdownRow[] {
  const counts = new Map<string, number>();
  for (const l of leads) {
    const label = labelOf(l);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = leads.length;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "uk"));
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const head = sorted.slice(0, top).map(([label, count]) => ({ label, count, percent: pct(count) }));
  const rest = sorted.slice(top).reduce((s, [, c]) => s + c, 0);
  return rest > 0 ? [...head, { label: OTHER_LABEL, count: rest, percent: pct(rest), other: true }] : head;
}

export const SCOPE_LABEL: Record<string, string> = {
  individual: "Окремі зуби",
  one_jaw: "Одна щелепа",
  both_jaws: "Обидві щелепи",
  unknown: "Не знаю",
};

export const INTENT_LABEL: Record<string, string> = {
  refine: "Уточнити розрахунок",
  send_calculation: "Надіслати розрахунок",
};

export const TIER_NAME: Record<string, string> = {
  minimum: "Мінімальний",
  classic: "Класичний",
  premium: "Преміальний",
};

export function cityOf(lead: LeadRow): string {
  return str(obj(payloadOf(lead).location).name) ?? "Не вказано";
}

/** scenario.scope → Ukrainian; falls back to scenario.kind and jaws count. */
export function scenarioOf(lead: LeadRow): string {
  const scenario = obj(payloadOf(lead).scenario);
  const scope = str(scenario.scope);
  if (scope && SCOPE_LABEL[scope]) return SCOPE_LABEL[scope];
  const kind = str(scenario.kind);
  if (kind && SCOPE_LABEL[kind]) return SCOPE_LABEL[kind];
  if (scenario.jaws === 2) return SCOPE_LABEL.both_jaws;
  if (scenario.jaws === 1) return SCOPE_LABEL.one_jaw;
  return "Не знаю";
}

export function intentOf(lead: LeadRow): string {
  const intent = str(payloadOf(lead).intent);
  return intent ? (INTENT_LABEL[intent] ?? intent) : "Не вказано";
}

/** "implant / crown-or-arch" tier pair, e.g. "Класичний / Мінімальний". */
export function tiersOf(lead: LeadRow): string {
  const p = payloadOf(lead);
  const imp = str(p.implant_tier);
  const crown = str(p.crown_or_arch_tier);
  const name = (t: string | null) => (t ? (TIER_NAME[t] ?? t) : "—");
  return `${name(imp)} / ${name(crown)}`;
}

export function sourceOf(lead: LeadRow): string {
  return str(obj(payloadOf(lead).utm).utm_source) ?? "без UTM";
}

export interface Breakdowns {
  cities: BreakdownRow[];
  scenarios: BreakdownRow[];
  intents: BreakdownRow[];
  tiers: BreakdownRow[];
  sources: BreakdownRow[];
}

export function breakdowns(leads: readonly LeadRow[]): Breakdowns {
  return {
    cities: countBy(leads, cityOf),
    scenarios: countBy(leads, scenarioOf),
    intents: countBy(leads, intentOf),
    tiers: countBy(leads, tiersOf),
    sources: countBy(leads, sourceOf),
  };
}

// ───────────── axis ─────────────

/** Round-number y-axis: ticks 0..max with a "nice" step (1, 2, 5 × 10ⁿ), at most ~4 intervals. */
export function niceTicks(maxValue: number, intervals = 4): number[] {
  const max = Math.max(1, Math.ceil(maxValue));
  const rough = max / intervals;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / pow;
  const step = Math.max(1, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pow); // counts are whole numbers
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) {
    ticks.push(v);
    if (v >= max) break;
  }
  return ticks;
}
