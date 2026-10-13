"use client";

import { useRef } from "react";
import { MAX_TEETH, teethValueLabel } from "@/engine/v2";

interface Props {
  value: number;
  onChange: (value: number) => void;
  label?: string;
}

const MARKS = Array.from({ length: MAX_TEETH }, (_, i) => i + 1);

/**
 * ТЗ §5.2 discrete 1·2·3·4·5·6·7+ slider. Pointer events cover mouse, touch
 * swipe/drag and tapping a mark; the track is one focusable `slider` for
 * keyboard and assistive tech.
 */
export function TeethSlider({ value, onChange, label = "Кількість зубів" }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const valueAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 0.9999);
    return Math.floor(ratio * MAX_TEETH) + 1;
  };

  const set = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), MAX_TEETH);
    if (clamped !== value) onChange(clamped);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const steps: Record<string, number> = {
      ArrowRight: value + 1,
      ArrowUp: value + 1,
      PageUp: value + 1,
      ArrowLeft: value - 1,
      ArrowDown: value - 1,
      PageDown: value - 1,
      Home: 1,
      End: MAX_TEETH,
    };
    if (event.key in steps) {
      event.preventDefault();
      set(steps[event.key]);
    }
  };

  const percent = ((value - 0.5) / MAX_TEETH) * 100;

  return (
    <div>
      <p className="text-center" data-testid="teeth-value">
        <span className="tabular text-[40px] leading-none font-extrabold text-brand">
          {value >= MAX_TEETH ? "7+" : value}
        </span>
        <span className="mt-1 block text-[15px] font-bold text-ink-soft">{teethValueLabel(value)}</span>
      </p>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={MAX_TEETH}
        aria-valuenow={value}
        aria-valuetext={teethValueLabel(value)}
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
        className="relative mt-4 h-[72px] cursor-pointer touch-pan-y select-none rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-brand-line"
      >
        {/* rail + progress, from the centre of the first mark to the last */}
        <div className="absolute top-[22px] right-[calc(100%/14)] left-[calc(100%/14)] h-1.5 rounded-full bg-line">
          <div
            className="h-1.5 rounded-full bg-brand transition-[width] duration-150"
            style={{ width: `${((value - 1) / (MAX_TEETH - 1)) * 100}%` }}
          />
        </div>
        <div className="absolute inset-x-0 top-0 grid h-full grid-cols-7" aria-hidden>
          {MARKS.map((mark) => (
            <div key={mark} data-mark={mark} className="flex flex-col items-center">
              <span
                className={`mt-[19px] size-3 rounded-full border-2 bg-paper ${
                  mark <= value ? "border-brand" : "border-line-strong"
                }`}
              />
              <span
                className={`tabular mt-3 text-[15px] font-bold ${mark === value ? "text-brand" : "text-muted"}`}
              >
                {mark === MAX_TEETH ? "7+" : mark}
              </span>
            </div>
          ))}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute top-[7px] size-9 -translate-x-1/2 rounded-full border-4 border-brand bg-paper shadow-md transition-[left] duration-150"
          style={{ left: `${percent}%` }}
        />
      </div>
    </div>
  );
}
