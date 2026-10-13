"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { listLeadsForDashboard } from "../api";
import { BarList, BreakdownTable, ChartCard, DayBarChart, SeriesTable } from "../dashboard/charts";
import {
  PERIODS,
  breakdowns,
  filterLeads,
  isTestLead,
  leadsPerDay,
  summarize,
  type BreakdownRow,
  type Period,
} from "../dashboard/stats";
import { formatMoney } from "../helpers";
import { useAsync } from "../hooks";
import { DataState, PageHeader } from "../ui";

function Tile({ label, children, footer }: { label: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="flex h-full flex-col">
      <p className="text-sm font-bold text-muted">{label}</p>
      <div className="mt-2 text-ink">{children}</div>
      {footer ? <div className="mt-auto pt-3 text-sm">{footer}</div> : null}
    </Card>
  );
}

function Breakdown({ title, subtitle, firstColumn, rows }: { title: string; subtitle?: string; firstColumn: string; rows: BreakdownRow[] }) {
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      chart={<BarList rows={rows} />}
      table={<BreakdownTable caption={title} firstColumn={firstColumn} rows={rows} />}
    />
  );
}

export default function LeadsDashboardPage() {
  const leads = useAsync(listLeadsForDashboard, []);
  const [period, setPeriod] = useState<Period>(30);
  const [excludeTests, setExcludeTests] = useState(true);

  const model = useMemo(() => {
    const all = leads.data ?? [];
    const now = new Date();
    const filtered = filterLeads(all, { period, excludeTests, now });
    const inPeriodWithTests = filterLeads(all, { period, excludeTests: false, now });
    return {
      summary: summarize(filtered, now),
      series: leadsPerDay(filtered, period, now),
      parts: breakdowns(filtered),
      hiddenTests: excludeTests ? inPeriodWithTests.filter(isTestLead).length : 0,
      count: filtered.length,
    };
  }, [leads.data, period, excludeTests]);

  const { summary, series, parts } = model;

  return (
    <>
      <PageHeader title="Дашборд заявок" description="Заявки з калькулятора: динаміка, географія, сценарії та джерела трафіку. Усі дані рахуються в браузері з таблиці заявок." />

      {/* one filter row above everything it scopes */}
      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="radiogroup" aria-label="Період" className="inline-flex rounded-lg border border-line-strong bg-paper p-0.5">
          {PERIODS.map((p) => {
            const selected = p.value === period;
            return (
              <button
                key={String(p.value)}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPeriod(p.value)}
                className={`min-h-9 rounded-md px-3 text-[13px] font-bold ${selected ? "bg-brand text-white" : "text-ink-soft hover:bg-canvas"}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink-soft">
          <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={excludeTests} onChange={(e) => setExcludeTests(e.target.checked)} />
          Без тестових
          {model.hiddenTests > 0 ? <span className="font-normal text-muted">(приховано {model.hiddenTests})</span> : null}
        </label>
      </div>

      <DataState loading={leads.loading && !leads.data} error={leads.error} onRetry={leads.reload}>
        <div className={leads.loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={leads.loading}>
          {model.count === 0 ? (
            <Card>
              <p className="font-bold text-ink">За цей період заявок немає</p>
              <p className="mt-1 text-sm text-muted">
                {excludeTests && model.hiddenTests > 0
                  ? "Є лише тестові заявки — зніміть позначку «Без тестових», щоб їх побачити."
                  : "Спробуйте довший період. Заявки з'являються тут одразу після відправки форми в калькуляторі."}
              </p>
            </Card>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Tile label="Усього заявок за період">
                  <p className="text-5xl font-extrabold leading-none">{summary.total.toLocaleString("uk-UA")}</p>
                </Tile>
                <Tile label="Сьогодні">
                  <p className="text-3xl font-extrabold">{summary.today.toLocaleString("uk-UA")}</p>
                </Tile>
                <Tile label="Середня сума розрахунку" footer={<span className="text-muted">за заявками з розрахованою сумою</span>}>
                  <p className="text-3xl font-extrabold">{summary.avgTotalUah === null ? "—" : formatMoney(summary.avgTotalUah, "UAH")}</p>
                </Tile>
                <Tile
                  label="Telegram"
                  footer={
                    <Link href="/admin/leads/?status=failed" className="font-bold text-brand no-underline hover:underline">
                      {summary.telegramFailed > 0 ? "Переглянути недоставлені →" : "Список заявок →"}
                    </Link>
                  }
                >
                  <ul className="space-y-1.5">
                    <li className="flex items-center gap-2">
                      <svg aria-hidden viewBox="0 0 20 20" className="size-5 shrink-0 text-good" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="10" cy="10" r="8" />
                        <path d="m6.5 10.2 2.4 2.4 4.6-5" />
                      </svg>
                      <span className="text-2xl font-extrabold">{summary.telegramSent}</span>
                      <span className="text-sm text-ink-soft">доставлено</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <svg aria-hidden viewBox="0 0 20 20" className={`size-5 shrink-0 ${summary.telegramFailed > 0 ? "text-bad" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 2.5 18 16.5H2L10 2.5Z" />
                        <path d="M10 8v4" />
                        <path d="M10 14.2v.1" />
                      </svg>
                      <span className="text-2xl font-extrabold">{summary.telegramFailed}</span>
                      <span className="text-sm text-ink-soft">не доставлено</span>
                    </li>
                    {summary.telegramPending > 0 ? <li className="pl-7 text-xs text-muted">очікує відправки: {summary.telegramPending}</li> : null}
                  </ul>
                </Tile>
              </div>

              <ChartCard
                title="Заявки по днях"
                subtitle={series.unit === "week" ? "Період довгий — заявки згруповано по тижнях" : undefined}
                chart={<DayBarChart series={series} />}
                table={<SeriesTable series={series} />}
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <Breakdown title="За містами" firstColumn="Місто" rows={parts.cities} />
                <Breakdown title="За сценаріями" firstColumn="Сценарій" rows={parts.scenarios} />
                <Breakdown title="За типом запиту" firstColumn="Тип запиту" rows={parts.intents} />
                <Breakdown title="За рівнями" subtitle="Рівень імпланта / рівень коронки або конструкції" firstColumn="Імплант / коронка" rows={parts.tiers} />
                <Breakdown title="За джерелом трафіку" subtitle="utm_source" firstColumn="Джерело" rows={parts.sources} />
              </div>
            </div>
          )}
        </div>
      </DataState>
    </>
  );
}
