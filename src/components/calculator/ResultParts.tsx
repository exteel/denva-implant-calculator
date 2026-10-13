import { formatDateUk, lineSourceLabel, type Group, type SourceInfo } from "@/engine/v2";
import { NO_DATA, uahText } from "./money";

export function DemoBadge() {
  return (
    <span className="inline-flex rounded-full bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">
      демо-дані
    </span>
  );
}

/** ТЗ §6.1 / §10: source, city and date of the prices behind a result. */
export function SourceNote({ source }: { source: SourceInfo }) {
  return (
    <div data-testid="source-note" className="mt-4 rounded-xl bg-canvas p-3 text-sm leading-relaxed">
      <p>
        <span className="font-bold">Джерело цін: </span>
        <span data-testid="source-label">{source.label}</span>
      </p>
      <p className="text-muted">
        <span data-testid="source-city">{source.city}</span> · ціни станом на{" "}
        <span data-testid="source-date">{formatDateUk(source.dateIso)}</span>{" "}
        {source.demo && <DemoBadge />}
      </p>
      {source.kind === "regional" && (
        <p className="mt-1 text-ink-soft">
          Для вашого міста власних даних поки немає — показано середню ціну регіону.
        </p>
      )}
      {source.mixed && (
        <p className="mt-1 text-ink-soft">Частина складових має інше джерело — див. позначки у деталізації.</p>
      )}
    </div>
  );
}

/** Short component breakdown (ТЗ §6.1): no clinic names, only components. */
export function Breakdown({ groups, showSources }: { groups: Group[]; showSources: boolean }) {
  return (
    <div data-testid="breakdown" className="mt-4 space-y-4">
      {groups.map((group) => (
        <div key={group.id}>
          {group.id !== "tooth" && (
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-extrabold">
              <span>{group.title}</span>
              <span className="tabular whitespace-nowrap">
                {group.totalUah === null ? NO_DATA : uahText({ low: group.totalUah, high: group.totalUah })}
              </span>
            </p>
          )}
          <ul className="mt-1.5 divide-y divide-line text-sm">
            {group.lines.map((line) => {
              const hint = showSources ? lineSourceLabel(line) : null;
              return (
                <li key={`${line.code}|${line.tier}`} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="text-ink-soft">
                    {line.label}
                    {line.qty > 1 && <span className="tabular font-bold"> × {line.qty}</span>}
                    {hint && <span className="block text-xs text-muted">{hint}</span>}
                  </span>
                  <span className="tabular font-semibold whitespace-nowrap">
                    {line.totalUah === null ? "—" : uahText({ low: line.totalUah, high: line.totalUah })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
