import { describe, expect, it } from "vitest";
import {
  OTHER_LABEL,
  breakdowns,
  countBy,
  filterLeads,
  isTestLead,
  leadsPerDay,
  niceTicks,
  scenarioOf,
  summarize,
  type LeadRow,
} from "./stats";

const NOW = new Date(2026, 9, 13, 15, 0, 0); // 13 Oct 2026, local

function lead(daysAgo: number, payload: Record<string, unknown> = {}, extra: Partial<LeadRow> = {}): LeadRow {
  const d = new Date(2026, 9, 13 - daysAgo, 10, 0, 0);
  return {
    id: `l${Math.random()}`,
    phone: "+380671234567",
    telegram_status: "sent",
    created_at: d.toISOString(),
    payload: { intent: "refine", location: { name: "Львів" }, scenario: { scope: "individual" }, ...payload },
    ...extra,
  };
}

describe("isTestLead", () => {
  it("detects the test phone and the ТЕСТОВА label", () => {
    expect(isTestLead(lead(0, {}, { phone: "+380000000000" }))).toBe(true);
    expect(isTestLead(lead(0, {}, { phone: "+38 (000) 000-00-00" }))).toBe(true);
    expect(isTestLead(lead(0, { scenario_label: "ТЕСТОВА заявка" }))).toBe(true);
    expect(isTestLead(lead(0, { scenario_label: "тестова" }))).toBe(true);
    expect(isTestLead(lead(0, { scenario_label: "3 зуби поруч" }))).toBe(false);
  });
});

describe("filterLeads", () => {
  const leads = [lead(0), lead(6), lead(7), lead(29), lead(30), lead(0, {}, { phone: "+380000000000" })];
  it("applies the period (n days = today + n-1 previous)", () => {
    expect(filterLeads(leads, { period: 7, excludeTests: false, now: NOW })).toHaveLength(3);
    expect(filterLeads(leads, { period: 30, excludeTests: false, now: NOW })).toHaveLength(5);
    expect(filterLeads(leads, { period: "all", excludeTests: false, now: NOW })).toHaveLength(6);
  });
  it("excludes tests when asked", () => {
    expect(filterLeads(leads, { period: 7, excludeTests: true, now: NOW })).toHaveLength(2);
  });
});

describe("summarize", () => {
  it("counts totals, today, average and Telegram states", () => {
    const s = summarize(
      [
        lead(0, { total_uah: 100000 }),
        lead(0, { total_uah: 200000 }, { telegram_status: "failed" }),
        lead(3, { total_uah: null }, { telegram_status: "pending" }),
      ],
      NOW,
    );
    expect(s).toEqual({ total: 3, today: 2, avgTotalUah: 150000, telegramSent: 1, telegramFailed: 1, telegramPending: 1 });
  });
  it("handles no leads and no sums", () => {
    expect(summarize([], NOW)).toMatchObject({ total: 0, today: 0, avgTotalUah: null });
  });
});

describe("leadsPerDay", () => {
  it("returns every day of the period, zero days included", () => {
    const series = leadsPerDay([lead(0), lead(0), lead(2)], 7, NOW);
    expect(series.unit).toBe("day");
    expect(series.buckets).toHaveLength(7);
    expect(series.buckets[6]).toMatchObject({ start: "2026-10-13", count: 2 });
    expect(series.buckets[4]).toMatchObject({ start: "2026-10-11", count: 1 });
    expect(series.buckets[5].count).toBe(0);
    expect(series.buckets.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
  it("'all' starts at the first lead and goes weekly when too long", () => {
    const short = leadsPerDay([lead(10), lead(0)], "all", NOW);
    expect(short.unit).toBe("day");
    expect(short.buckets).toHaveLength(11);
    const long = leadsPerDay([lead(300), lead(0), lead(1)], "all", NOW);
    expect(long.unit).toBe("week");
    expect(long.buckets.reduce((s, b) => s + b.count, 0)).toBe(3);
    expect(long.buckets[0].start <= "2025-12-17").toBe(true);
  });
  it("is a single empty slot with no leads", () => {
    expect(leadsPerDay([], "all", NOW).buckets).toEqual([{ start: "2026-10-13", end: "2026-10-13", count: 0 }]);
  });
});

describe("breakdowns", () => {
  it("sorts descending, folds the tail into Інші after top 10", () => {
    const leads: LeadRow[] = [];
    for (let i = 0; i < 12; i += 1) {
      for (let k = 0; k <= 12 - i; k += 1) leads.push(lead(0, { location: { name: `Місто ${i}` } }));
    }
    const rows = countBy(leads, (l) => (l.payload!.location as { name: string }).name);
    expect(rows).toHaveLength(11);
    expect(rows[0].count).toBeGreaterThanOrEqual(rows[1].count);
    expect(rows[10]).toMatchObject({ label: OTHER_LABEL, other: true, count: 3 + 2 });
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(leads.length);
  });

  it("maps scenarios, intents, tiers and sources to Ukrainian labels", () => {
    const b = breakdowns([
      lead(0, { scenario: { scope: "one_jaw" }, intent: "send_calculation", implant_tier: "classic", crown_or_arch_tier: "minimum", utm: { utm_source: "google" } }),
      lead(0, { scenario: { scope: "both_jaws" }, implant_tier: "classic", crown_or_arch_tier: "minimum", utm: {} }),
      lead(0, { scenario: {} }),
    ]);
    expect(b.scenarios.map((r) => r.label).sort()).toEqual(["Не знаю", "Обидві щелепи", "Одна щелепа"].sort());
    expect(b.intents.find((r) => r.label === "Надіслати розрахунок")?.count).toBe(1);
    expect(b.intents.find((r) => r.label === "Уточнити розрахунок")?.count).toBe(2);
    expect(b.tiers[0]).toMatchObject({ label: "Класичний / Мінімальний", count: 2 });
    expect(b.sources.map((r) => r.label).sort()).toEqual(["google", "без UTM"].sort());
    expect(b.sources.find((r) => r.label === "без UTM")?.count).toBe(2);
    expect(b.cities[0]).toMatchObject({ label: "Львів", count: 3, percent: 100 });
  });

  it("falls back for odd scenario shapes", () => {
    expect(scenarioOf(lead(0, { scenario: { jaws: 2 } }))).toBe("Обидві щелепи");
    expect(scenarioOf(lead(0, { scenario: { kind: "unknown" } }))).toBe("Не знаю");
    expect(scenarioOf({ ...lead(0), payload: null })).toBe("Не знаю");
  });
});

describe("niceTicks", () => {
  it("gives round ticks covering the max", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(100)).toEqual([0, 50, 100]);
    const t = niceTicks(37);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(37);
  });
});
