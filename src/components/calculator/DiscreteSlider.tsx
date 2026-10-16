"use client";

import { useRef } from "react";

interface Props {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Accessible name, e.g. "Верхня щелепа: кількість зубів". */
  label: string;
  /** Spoken value, e.g. "3 зуби". */
  valueText?: (value: number) => string;
  testId?: string;
}

/**
 * Discrete slider with −/+ buttons (ТЗ §5.2, §10). The track is one
 * focusable `slider`; pointer events cover mouse, touch drag/swipe and
 * tapping a mark. Fixed heights: moving the value never shifts the layout.
 */
export function DiscreteSlider({ value, min, max, onChange, label, valueText, testId }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const steps = max - min + 1;
  const marks = Array.from({ length: steps }, (_, i) => min + i);

  const clamp = (n: number) => Math.min(Math.max(n, min), max);
  const set = (next: number) => {
    const clamped = clamp(next);
    if (clamped !== value) onChange(clamped);
  };

  const valueAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 0.9999);
    return min + Math.floor(ratio * steps);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const targets: Record<string, number> = {
      ArrowRight: value + 1,
      ArrowUp: value + 1,
      PageUp: value + 1,
      ArrowLeft: value - 1,
      ArrowDown: value - 1,
      PageDown: value - 1,
      Home: min,
      End: max,
    };
    if (event.key in targets) {
      event.preventDefault();
      set(targets[event.key]);
    }
  };

  const percent = ((value - min + 0.5) / steps) * 100;
  const stepButton =
    "grid size-12 shrink-0 place-items-center rounded-full border border-line-strong bg-paper text-[26px] leading-none font-bold text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:border-line disabled:text-line-strong";

  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <button type="button" className={stepButton} aria-label={`${label}: менше`} disabled={value <= min} onClick={() => set(value - 1)}>
        <span aria-hidden>−</span>
      </button>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText ? valueText(value) : String(value)}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          set(valueAt(event.clientX));
        }}
        onPointerMove={(event) => {
          if (dragging.current) set(valueAt(event.clientX));
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        className="relative h-[68px] min-w-0 flex-1 cursor-pointer touch-pan-y rounded-2xl outline-none select-none focus-visible:ring-4 focus-visible:ring-brand-line"
      >
        {/* rail + progress, from the centre of the first mark to the last */}
        <div
          className="absolute top-[21px] h-1.5 rounded-full bg-line"
          style={{ left: `${50 / steps}%`, right: `${50 / steps}%` }}
        >
          <div
            className="h-1.5 rounded-full bg-brand transition-[width] duration-150"
            style={{ width: `${steps > 1 ? ((value - min) / (steps - 1)) * 100 : 0}%` }}
          />
        </div>
        <div className="absolute inset-0 flex" aria-hidden>
          {marks.map((mark) => (
            <div key={mark} data-mark={mark} className="flex flex-1 flex-col items-center">
              <span
                className={`mt-[18px] size-3 rounded-full border-2 bg-paper ${mark <= value ? "border-brand" : "border-line-strong"}`}
              />
              <span
                className={`tabular mt-3 h-4 text-[12px] leading-4 font-bold ${mark === value ? "text-brand" : "text-muted"}`}
              >
                {mark % 2 === 0 || mark === value ? mark : ""}
              </span>
            </div>
          ))}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute top-[6px] size-9 -translate-x-1/2 rounded-full border-4 border-brand bg-paper shadow-md transition-[left] duration-150"
          style={{ left: `${percent}%` }}
        />
      </div>

      <button type="button" className={stepButton} aria-label={`${label}: більше`} disabled={value >= max} onClick={() => set(value + 1)}>
        <span aria-hidden>+</span>
      </button>
    </div>
  );
}
