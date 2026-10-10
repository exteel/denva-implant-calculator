"use client";

import { SEGMENT_INFO } from "@/engine/segments";
import { formatRange, formatUah } from "@/engine/format";
import { SEGMENTS, type PackageChoice, type PricedScenario, type Segment } from "@/engine/types";

/** ТЗ §12: All-on-X is always shown as stage 1 / stage 2 / full. */
export function StageRows({ priced, showMedian }: { priced: PricedScenario; showMedian: boolean }) {
  if (!priced.stage1 || !priced.stage2) return null;
  const rows = [
    { label: "Етап 1", hint: "імпланти + тимчасові незнімні зуби", range: priced.stage1 },
    { label: "Етап 2", hint: "постійна конструкція", range: priced.stage2 },
  ];
  return (
    <span className="mt-3 block space-y-1.5 border-t border-line pt-3 text-sm">
      {rows.map((row) => (
        <span key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-ink-soft">
            <span className="font-bold text-ink">{row.label}</span>{" "}
            <span className="hidden sm:inline">· {row.hint}</span>
          </span>
          <span className="tabular ml-auto font-bold whitespace-nowrap">{formatRange(row.range)}</span>
        </span>
      ))}
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-dashed border-line pt-1.5">
        <span className="font-bold">Повне лікування</span>
        <span className="tabular ml-auto text-right font-extrabold">
          <span className="whitespace-nowrap">{formatRange(priced.total)}</span>
          {showMedian && (
            <span className="block font-semibold whitespace-nowrap text-muted">
              типова ~{formatUah(priced.total.median)}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

interface SegmentCardsProps {
  pricedBySegment: Record<Segment, PricedScenario>;
  selected: Segment;
  onSelect: (segment: Segment) => void;
  showMedian: boolean;
  dimmed: boolean;
}

/** ТЗ R00-2 + §13: three default packages B+B / O+O / P+P. */
export function SegmentCards({ pricedBySegment, selected, onSelect, showMedian, dimmed }: SegmentCardsProps) {
  const maxP75 = Math.max(...SEGMENTS.map((s) => pricedBySegment[s].total.p75));
  return (
    <div className={`grid gap-3 transition-opacity ${dimmed ? "opacity-55" : ""}`} role="radiogroup" aria-label="Ринковий сегмент">
      {SEGMENTS.map((segment) => {
        const priced = pricedBySegment[segment];
        const info = SEGMENT_INFO[segment];
        const isSelected = segment === selected && !dimmed;
        const isArch = Boolean(priced.stage1);
        const left = (priced.total.p25 / maxP75) * 100;
        const width = ((priced.total.p75 - priced.total.p25) / maxP75) * 100;
        const mid = (priced.total.median / maxP75) * 100;
        return (
          <button
            key={segment}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(segment)}
            className={`rounded-2xl border p-4 text-left transition-colors hover:border-brand ${
              isSelected ? "border-brand bg-brand-soft/60 ring-1 ring-brand" : "border-line bg-paper"
            }`}
          >
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-2 text-[16px] font-extrabold">
                <span
                  aria-hidden
                  className={`grid size-4.5 place-items-center rounded-full border-2 ${
                    isSelected ? "border-brand" : "border-line-strong"
                  }`}
                >
                  {isSelected && <span className="size-2 rounded-full bg-brand" />}
                </span>
                {info.label}
              </span>
              {!isArch && (
                <span className="tabular text-[17px] font-extrabold">{formatRange(priced.total)}</span>
              )}
            </span>
            {!isArch && showMedian && (
              <span className="tabular mt-0.5 block text-right text-sm font-semibold text-muted">
                типова ціна ~{formatUah(priced.total.median)}
              </span>
            )}
            {!isArch && (
              <span className="relative mt-3 block h-1.5 rounded-full bg-canvas" aria-hidden>
                <span
                  className="absolute h-1.5 rounded-full bg-brand/70"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
                <span
                  className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-brand-dark"
                  style={{ left: `${mid}%` }}
                />
              </span>
            )}
            <span className="mt-2.5 block text-sm leading-relaxed text-ink-soft">{info.description}</span>
            {isArch && <StageRows priced={priced} showMedian={showMedian} />}
          </button>
        );
      })}
    </div>
  );
}

interface CustomizerProps {
  pkg: PackageChoice;
  onChange: (pkg: PackageChoice) => void;
  priced: PricedScenario;
  showMedian: boolean;
}

/** ТЗ §13: independent implant × prosthetic choice — one price, never nine. */
export function PackageCustomizer({ pkg, onChange, priced, showMedian }: CustomizerProps) {
  const axes: { key: keyof PackageChoice; title: string; describe: (s: Segment) => string }[] = [
    { key: "implant", title: "Імплантаційна система", describe: (s) => SEGMENT_INFO[s].implantDescription },
    { key: "prosthetic", title: "Коронки / протезування", describe: (s) => SEGMENT_INFO[s].prostheticDescription },
  ];
  return (
    <div className="rounded-2xl border border-brand bg-paper p-4">
      {axes.map((axis) => (
        <fieldset key={axis.key} className="mb-4">
          <legend className="text-sm font-extrabold">{axis.title}</legend>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-full bg-canvas p-1">
            {SEGMENTS.map((segment) => {
              const active = pkg[axis.key] === segment;
              return (
                <button
                  key={segment}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...pkg, [axis.key]: segment })}
                  className={`min-h-10 rounded-full px-2 text-sm font-bold transition-colors ${
                    active ? "bg-paper text-brand shadow-sm" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {SEGMENT_INFO[segment].label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-sm text-muted">{axis.describe(pkg[axis.key])}</p>
        </fieldset>
      ))}
      <div className="rounded-xl bg-brand-soft p-3">
        <p className="text-sm font-bold text-ink-soft">Ваш варіант</p>
        {priced.stage1 ? (
          <StageRows priced={priced} showMedian={showMedian} />
        ) : (
          <p className="tabular text-[20px] font-extrabold">
            {formatRange(priced.total)}
            {showMedian && (
              <span className="ml-2 text-sm font-semibold text-muted">~{formatUah(priced.total.median)}</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
