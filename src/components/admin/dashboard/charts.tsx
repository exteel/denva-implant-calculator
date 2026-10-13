"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { niceTicks, type Bucket, type BreakdownRow, type TimeSeries } from "./stats";

// ───────────── formatting ─────────────

/** "2026-10-13" → "13.10.2026" */
function fullDate(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}
function shortDate(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}.${m}`;
}
export function bucketLabel(b: Bucket): string {
  return b.start === b.end ? fullDate(b.start) : `${fullDate(b.start)} – ${fullDate(b.end)}`;
}
const plural = (n: number) => {
  const last = n % 10;
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return "заявок";
  if (last === 1) return "заявка";
  if (last >= 2 && last <= 4) return "заявки";
  return "заявок";
};

// ───────────── card with chart / table toggle ─────────────

/** Chart card: title, optional subtitle, and a "Таблиця" toggle that swaps the chart for the same numbers as a table. */
export function ChartCard({
  title,
  subtitle,
  chart,
  table,
}: {
  title: string;
  subtitle?: string;
  chart: ReactNode;
  table: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-paper p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className={`min-h-8 shrink-0 rounded-lg border px-3 text-xs font-bold ${
            asTable ? "border-brand bg-brand-soft text-brand" : "border-line-strong text-ink-soft hover:border-brand"
          }`}
        >
          Таблиця
        </button>
      </div>
      {asTable ? table : chart}
    </section>
  );
}

// ───────────── tables ─────────────

const th = "border-b border-line px-2 py-1.5 text-left text-xs font-bold text-muted";
const td = "border-b border-line px-2 py-1.5 text-sm text-ink";

export function BreakdownTable({ caption, firstColumn, rows }: { caption: string; firstColumn: string; rows: BreakdownRow[] }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>{firstColumn}</th>
            <th scope="col" className={`${th} text-right`}>Заявок</th>
            <th scope="col" className={`${th} text-right`}>Частка</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className={`${td} text-left font-normal`}>{r.label}</th>
              <td className={`${td} tabular text-right`}>{r.count}</td>
              <td className={`${td} tabular text-right`}>{r.percent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SeriesTable({ series }: { series: TimeSeries }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">Заявки {series.unit === "week" ? "по тижнях" : "по днях"}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>{series.unit === "week" ? "Тиждень" : "Дата"}</th>
            <th scope="col" className={`${th} text-right`}>Заявок</th>
          </tr>
        </thead>
        <tbody>
          {[...series.buckets].reverse().map((b) => (
            <tr key={b.start}>
              <th scope="row" className={`${td} text-left font-normal`}>{bucketLabel(b)}</th>
              <td className={`${td} tabular text-right`}>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────── horizontal bar list ─────────────

/** Single-colour horizontal bars; value in text ink at the bar tip; "Інші" in the de-emphasis gray. */
export function BarList({ rows }: { rows: BreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.label}
          title={`${r.label}: ${r.count} ${plural(r.count)} (${r.percent}%)`}
          className="group grid grid-cols-[minmax(6rem,36%)_1fr] items-center gap-3"
        >
          <span className="truncate text-sm text-ink-soft" title={r.label}>{r.label}</span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              style={{ width: `${Math.max(1, (r.count / max) * 78)}%` }}
              className={`h-3 rounded-r-[4px] transition-colors ${r.other ? "bg-line-strong" : "bg-brand group-hover:bg-brand-dark"}`}
            />
            <span className="tabular shrink-0 text-sm font-bold text-ink">
              {r.count} <span className="font-normal text-muted">· {r.percent}%</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ───────────── column chart: leads per day ─────────────

const W = 720;
const H = 220;
const PAD = { left: 34, right: 8, top: 10, bottom: 24 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

function barPath(x: number, w: number, top: number, base: number): string {
  const r = Math.min(RADIUS, w / 2, base - top);
  return `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${base} Z`;
}

/** Single-series column chart: one brand colour, hairline grid, 4px rounded tops, 2px gaps, tooltip per bar. */
export function DayBarChart({ series }: { series: TimeSeries }) {
  const { buckets } = series;
  const [active, setActive] = useState<number | null>(null);
  const descId = useId();

  const n = buckets.length;
  const max = Math.max(0, ...buckets.map((b) => b.count));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1];
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  const slot = plotW / n;
  const barW = Math.max(1, Math.min(MAX_BAR, slot - GAP));
  const y = (v: number) => base - (v / yMax) * plotH;
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((cur) => {
        const from = cur ?? (e.key === "ArrowRight" ? -1 : n);
        return Math.min(n - 1, Math.max(0, from + (e.key === "ArrowRight" ? 1 : -1)));
      });
    } else if (e.key === "Escape") setActive(null);
  }

  const tip = active !== null ? buckets[active] : null;
  const tipLeft = active !== null ? Math.min(88, Math.max(12, ((PAD.left + slot * (active + 0.5)) / W) * 100)) : 0;

  return (
    <div
      className="relative rounded-lg outline-offset-4"
      tabIndex={0}
      role="group"
      aria-label={`Заявки ${series.unit === "week" ? "по тижнях" : "по днях"}: стрілки вліво і вправо переглядають значення`}
      aria-describedby={descId}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
    >
      <p id={descId} className="sr-only">Те саме у вигляді таблиці — кнопка «Таблиця».</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" className="tabular fill-muted" fontSize={11}>
              {t.toLocaleString("uk-UA")}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const cx = PAD.left + slot * (i + 0.5);
          const isActive = active === i;
          return (
            <g key={b.start}>
              {b.count > 0 ? (
                <path
                  d={barPath(cx - barW / 2, barW, y(b.count), base)}
                  className={isActive ? "fill-brand-dark" : "fill-brand"}
                />
              ) : null}
              {i % labelEvery === 0 ? (
                <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted" fontSize={11}>
                  {shortDate(b.start)}
                </text>
              ) : null}
              {/* hit target: the whole slot, full plot height */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerMove={() => setActive(i)}
              />
            </g>
          );
        })}
      </svg>
      {tip ? (
        <div
          role="status"
          style={{ left: `${tipLeft}%` }}
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-paper px-3 py-1.5 text-xs shadow-md"
        >
          <p className="text-muted">{bucketLabel(tip)}</p>
          <p className="flex items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden className="inline-block h-0.5 w-3 rounded bg-brand" />
            <span className="text-sm font-extrabold text-ink">{tip.count}</span>
            <span className="text-muted">{plural(tip.count)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
