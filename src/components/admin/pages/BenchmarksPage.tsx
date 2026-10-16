"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { PriceMode, Tier } from "@/lib/contracts";
import {
  listCities,
  listManualPrices,
  listPriceModes,
  listRegions,
  listServices,
  saveBenchmarks,
  type BenchmarkScope,
  type Service,
} from "../api";
import { computeChanges, type CellEdit } from "../benchmarks";
import { MODE_LABEL, TIER_LABEL, cellKey, describeError, formatPlain } from "../helpers";
import { useAsync } from "../hooks";
import { Badge, ConfirmDialog, DataState, MiniButton, Notice, PageHeader, TableWrap, SelectField, tdClass, thClass, useAction } from "../ui";

const TIER_COLUMNS: Tier[] = ["common", "minimum", "classic", "premium"];
const SCOPES: ReadonlyArray<{ value: BenchmarkScope; label: string; help: string }> = [
  { value: "country", label: "Україна", help: "Середня ціна України — останній рівень запасу, коли немає міських та обласних даних." },
  { value: "region", label: "Області", help: "Середня ціна області — запас для міст без власного орієнтира." },
  { value: "city", label: "Міста", help: "Ручний орієнтир міста — найвищий пріоритет серед базових цін. Тут же — режим override." },
];

/** Re-mounts when the query string changes so dashboard links preselect the city. */
export default function BenchmarksPage() {
  const params = useSearchParams();
  return <BenchmarksView key={params.toString()} params={params} />;
}

function BenchmarksView({ params }: { params: URLSearchParams }) {
  const initialScope = (["country", "region", "city"] as const).find((s) => s === params.get("scope")) ?? "country";
  const [scope, setScope] = useState<BenchmarkScope>(initialScope);
  const [targetId, setTargetId] = useState(params.get("id") ?? "");

  const cities = useAsync(listCities, []);
  const regions = useAsync(listRegions, []);
  const services = useAsync(listServices, []);

  const ready = scope === "country" || Boolean(targetId);
  const manual = useAsync(() => (ready ? listManualPrices(scope, targetId) : Promise.resolve([])), [scope, targetId, ready]);
  const modes = useAsync(() => (scope === "city" && targetId ? listPriceModes(targetId) : Promise.resolve([])), [scope, targetId]);

  const [edits, setEdits] = useState<Record<string, CellEdit>>({});
  const [askSave, setAskSave] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const act = useAction();

  const original = useMemo(() => {
    const values = new Map<string, number>();
    manual.data?.forEach((m) => values.set(cellKey(m.service_code, m.tier), Number(m.value)));
    const modeMap = new Map<string, { mode: PriceMode; override_value: number | null }>();
    modes.data?.forEach((m) =>
      modeMap.set(cellKey(m.service_code, m.tier), { mode: m.mode, override_value: m.override_value == null ? null : Number(m.override_value) }),
    );
    return { values, modes: modeMap };
  }, [manual.data, modes.data]);

  const activeServices = (services.data ?? []).filter((s) => s.active);
  const { changes, invalid, needsReason } = useMemo(() => computeChanges(edits, original, scope), [edits, original, scope]);

  const currentValue = (key: string): string => {
    const edit = edits[key]?.value;
    if (edit !== undefined) return edit;
    const o = original.values.get(key);
    return o === undefined ? "" : String(o);
  };
  const currentMode = (key: string): PriceMode => edits[key]?.mode ?? original.modes.get(key)?.mode ?? "auto";
  const currentOverride = (key: string): string => {
    const edit = edits[key]?.override;
    if (edit !== undefined) return edit;
    const o = original.modes.get(key)?.override_value;
    return o == null ? "" : String(o);
  };
  const setEdit = (key: string, patch: CellEdit) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));

  async function save(reason: string) {
    const ok = await act.run(async () => {
      await saveBenchmarks(scope, targetId, changes, reason);
      return true;
    }, describeError);
    if (ok) {
      setAskSave(false);
      setSaved(`Збережено змін: ${changes.length}. Перерахунок виконає черга (до хвилини) або кнопка «Перерахувати» на сторінці агрегатів.`);
      setEdits({});
      manual.reload();
      modes.reload();
    }
  }

  const applicable = (s: Service, tier: Tier) => (s.tiered ? tier !== "common" : tier === "common");
  const scopeInfo = SCOPES.find((s) => s.value === scope)!;
  const targets = scope === "city" ? cities.data : scope === "region" ? regions.data : undefined;

  return (
    <>
      <PageHeader
        title="Базові ціни"
        description="Ручні ринкові значення трьох рівнів. Базовий орієнтир для міста береться за пріоритетом: місто → область → Україна. Локальні прайси клінік змішуються з ним (1–2 клініки) або замінюють його (3+)."
      />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div role="radiogroup" aria-label="Рівень базових цін" className="inline-flex rounded-lg border border-line-strong bg-paper p-0.5">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={scope === s.value}
              onClick={() => {
                setScope(s.value);
                setTargetId("");
                setEdits({});
                setSaved(null);
              }}
              className={`min-h-9 rounded-md px-4 text-[13px] font-bold ${scope === s.value ? "bg-brand text-white" : "text-ink-soft hover:bg-canvas"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {targets ? (
          <div className="min-w-56">
            <SelectField
              label={scope === "city" ? "Місто" : "Область"}
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setEdits({});
                setSaved(null);
              }}
            >
              <option value="">— оберіть —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </SelectField>
          </div>
        ) : null}
        <div className="flex gap-2 pb-0.5">
          <MiniButton tone="brand" disabled={changes.length === 0 || invalid.size > 0 || act.busy} onClick={() => setAskSave(true)}>
            Зберегти зміни ({changes.length})
          </MiniButton>
          <MiniButton disabled={Object.keys(edits).length === 0} onClick={() => setEdits({})}>Скасувати</MiniButton>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted">{scopeInfo.help}</p>

      {saved ? <div className="mb-3"><Notice tone="good" role="status">{saved}</Notice></div> : null}
      {act.error && !askSave ? <div className="mb-3"><Notice tone="bad" role="alert">{act.error}</Notice></div> : null}
      {invalid.size > 0 ? (
        <div className="mb-3">
          <Notice tone="bad" role="alert">Виправте підсвічені комірки: {[...new Set(invalid.values())].join(" ")}</Notice>
        </div>
      ) : null}

      {!ready ? (
        <p className="py-6 text-sm text-muted">Оберіть {scope === "city" ? "місто" : "область"}, щоб побачити та змінити орієнтири.</p>
      ) : (
        <DataState
          loading={manual.loading || modes.loading || services.loading}
          error={manual.error ?? modes.error ?? services.error}
          onRetry={() => {
            manual.reload();
            modes.reload();
            services.reload();
          }}
          empty={activeServices.length === 0}
          emptyText="Каталог послуг порожній."
        >
          <TableWrap>
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>Послуга</th>
                  {TIER_COLUMNS.map((t) => (
                    <th key={t} className={thClass}>{TIER_LABEL[t]}, ₴</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeServices.map((s) => (
                  <tr key={s.service_code}>
                    <td className={tdClass}>
                      <span className="font-bold">{s.name}</span>
                      <div className="font-mono text-[11px] text-muted">{s.service_code} · {s.unit}</div>
                    </td>
                    {TIER_COLUMNS.map((tier) => {
                      if (!applicable(s, tier)) return <td key={tier} className={`${tdClass} bg-canvas text-center text-muted`}>—</td>;
                      const key = cellKey(s.service_code, tier);
                      const problem = invalid.get(key);
                      const dirty = changes.some((c) => c.service_code === s.service_code && c.tier === tier);
                      const label = `${s.name}, ${TIER_LABEL[tier]}`;
                      const mode = currentMode(key);
                      return (
                        <td key={tier} className={`${tdClass} ${dirty ? "bg-warn-soft" : ""}`}>
                          <input
                            inputMode="decimal"
                            aria-label={`Орієнтир: ${label}`}
                            aria-invalid={Boolean(problem) && mode !== "manual_override"}
                            value={currentValue(key)}
                            placeholder="—"
                            onChange={(e) => setEdit(key, { value: e.target.value })}
                            className="tabular min-h-9 w-28 rounded-lg border border-line-strong px-2 text-right text-sm"
                          />
                          {scope === "city" ? (
                            <>
                              <select
                                aria-label={`Режим: ${label}`}
                                value={mode}
                                onChange={(e) => setEdit(key, { mode: e.target.value as PriceMode })}
                                className="mt-1 block min-h-8 w-full max-w-[10rem] rounded-lg border border-line-strong bg-paper px-1 text-xs"
                              >
                                {(Object.keys(MODE_LABEL) as PriceMode[]).map((m) => (
                                  <option key={m} value={m}>{MODE_LABEL[m]}</option>
                                ))}
                              </select>
                              {mode === "manual_override" ? (
                                <input
                                  inputMode="decimal"
                                  aria-label={`Значення override: ${label}`}
                                  aria-invalid={Boolean(problem)}
                                  value={currentOverride(key)}
                                  placeholder="значення override"
                                  onChange={(e) => setEdit(key, { override: e.target.value })}
                                  className={`tabular mt-1 min-h-8 w-28 rounded-lg border px-2 text-right text-xs ${problem ? "border-bad" : "border-warn-line bg-warn-soft"}`}
                                />
                              ) : null}
                            </>
                          ) : null}
                          {scope === "city" && mode === "manual_override" ? (
                            <div className="mt-1"><Badge tone="warn" title="Публікується це значення замість формули">override</Badge></div>
                          ) : null}
                          {original.values.has(key) && edits[key]?.value !== undefined && !problem ? (
                            <div className="mt-1 text-[11px] text-muted">було {formatPlain(original.values.get(key))}</div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DataState>
      )}

      {askSave ? (
        <ConfirmDialog
          title="Зберегти базові ціни"
          message={
            <>
              <p>Змін: {changes.length}. Кожна зміна запускає перерахунок лише для відповідних міст, послуг і рівнів.</p>
              {needsReason ? <p className="mt-1 font-bold text-warn">Серед змін є override — причина обов&apos;язкова.</p> : null}
            </>
          }
          confirmLabel="Зберегти"
          askReason
          reasonRequired={needsReason}
          busy={act.busy}
          error={act.error}
          onConfirm={(reason) => void save(reason)}
          onCancel={() => {
            setAskSave(false);
            act.setError(null);
          }}
        />
      ) : null}
    </>
  );
}
