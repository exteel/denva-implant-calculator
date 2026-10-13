"use client";

import type { Option } from "@/engine/v2";

interface Props {
  options: Option[];
  selected?: string;
  onSelect: (id: string) => void;
  label: string;
}

/** Big single-choice buttons; one tap = one answer (ТЗ §10). */
export function OptionList({ options, selected, onSelect, label }: Props) {
  return (
    <ul className="mt-6 grid gap-2.5" aria-label={label}>
      {options.map((option) => {
        const isSelected = selected === option.id;
        return (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onSelect(option.id)}
              aria-pressed={isSelected}
              className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left text-[16px] font-bold transition-colors hover:border-brand hover:bg-brand-soft ${
                isSelected ? "border-brand bg-brand-soft" : "border-line bg-paper"
              }`}
            >
              {option.label}
              <span aria-hidden className="shrink-0 text-muted">
                →
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
