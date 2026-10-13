import { formatUah, type AddonItem } from "@/engine/v2";

/** ТЗ §6.1: possible extra costs — shown apart, never inside the total. */
export function AddonsBlock({ items, teethPresent }: { items: AddonItem[]; teethPresent: boolean }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="addons-title"
      data-testid="addons"
      className="rounded-[var(--radius-card)] border border-line bg-paper p-5"
    >
      <h2 id="addons-title" className="text-[17px] font-extrabold">
        Можливі додаткові витрати
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Не входять у суму вище. Чи знадобляться ці процедури, визначає лікар після огляду та КТ.
      </p>
      {teethPresent && (
        <p className="mt-3 rounded-xl bg-warn-soft p-3 text-sm leading-relaxed text-ink-soft">
          Ви вказали, що зуби ще є, — тому видалення, найімовірніше, знадобиться. Його вартість нижче.
        </p>
      )}
      <ul className="mt-3 divide-y divide-line text-sm">
        {items.map((item) => (
          <li
            key={item.code}
            data-testid={`addon-${item.code}`}
            data-highlight={item.highlight}
            className={`flex items-baseline justify-between gap-3 py-2 ${item.highlight ? "font-bold" : ""}`}
          >
            <span className={item.highlight ? "text-ink" : "text-ink-soft"}>
              {item.name}
              {item.unit && <span className="text-muted"> · {item.unit}</span>}
            </span>
            <span className="tabular whitespace-nowrap">{formatUah(item.valueUah)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
