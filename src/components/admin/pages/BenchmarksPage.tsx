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
  type BenchmarkChange,
  type BenchmarkScope,
  type Service,
} from "../api";
import { MODE_LABEL, TIER_LABEL, cellKey, describeError, formatPlain, parseDecimal } from "../helpers";
import { useAsync } from "../hooks";
import { Badge, ConfirmDialog, DataState, MiniButton, Notice, PageHeader, SelectField, TableWrap, tdClass, thClass, useAction } from "../ui";

const TIER_COLUMNS: Tier[] = ["common", "minimum", "classic", "premium"];

/** Re-mounts when the query string changes so dashboard links preselect the city. */
export default function BenchmarksPage() {
  const params = useSearchParams();
  return <BenchmarksView key={params.toString()} params={params} />;
}

interface Edit {
  value?: string;
  mode?: PriceMode;
}

function BenchmarksView({ params }: { params: URLSearchParams }) {
  const [scope, setScope] = useState<BenchmarkScope>(params.get("scope") === "region" ? "region" : "city");
  const [targetId, setTargetId] = useState(params.get("id") ?? "");

  const cities = useAsync(listCities, []);
  const regions = useAsync(listRegions, []);
  const services = useAsync(listServices, []);

  const manual = useAsync(() => (targetId ? listManualPrices(scope, targetId) : Promise.resolve([])), [scope, targetId]);
  const modes = useAsync(() => (targetId && scope === "city" ? listPriceModes(targetId) : Promise.resolve([])), [scope, targetId]);

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [askSave, setAskSave] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const act = useAction();

  const original = useMemo(() => {
    const values = new Map<string, number>();
    manual.data?.forEach((m) => values.set(cellKey(m.service_code, m.tier), Number(m.value)));
    const modeMap = new Map<string, PriceMode>();
    modes.data?.forEach((m) => modeMap.set(cellKey(m.service_code, m.tier), m.mode));
    return { values, modeMap };
  }, [manual.data, modes.data]);

  const activeServices = (services.data ?? []).filter((s) => s.active);
  const cityObj = cities.data?.find((c) => c.id === targetId);
  const currency = scope === "city" ? (cityObj?.currency ?? "UAH") : "UAH";

  const currentValue = (key: string): string => {
    const edit = edits[key]?.value;
    if (edit !== undefined) return edit;
    const o = original.values.get(key);
    return o === undefined ? "" : String(o);
  };
  const currentMode = (key: string): PriceMode => edits[key]?.mode ?? original.modeMap.get(key) ?? "auto";

  // compute dirty changes + validation
  const { changes, invalid } = useMemo(() => {
    const list: BenchmarkChange[] = [];
    const bad = new Set<string>();
    for (const [key, edit] of Object.entries(edits)) {
      const [service_code, tier] = key.split("|") as [string, Tier];
      const change: BenchmarkChange = { service_code, tier };
      if (edit.value !== undefined) {
        const parsed = parseDecimal(edit.value);
        const o = original.values.get(key);
        if (parsed !== null && (Number.isNaN(parsed) || parsed <= 0)) bad.add(key);
        else if (parsed === null && o !== undefined) change.value = null;
        else if (parsed !== null && parsed !== o) change.value = parsed;
      }
      if (edit.mode !== undefined && edit.mode !== (original.modeMap.get(key) ?? "auto")) change.mode = edit.mode;
      if (change.value !== undefined || change.mode !== undefined) list.push(change);
    }
    return { changes: list, invalid: bad };
  }, [edits, original]);

  const setEdit = (key: string, patch: Edit) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }));

  async function save(reason: string) {
    const ok = await act.run(async () => {
      await saveBenchmarks(scope, targetId, changes, reason);
      return true;
    }, describeError);
    setAskSave(false);
    if (ok) {
      setSaved(`Збережено змін: ${changes.length}. Перерахунок виконає черга (до хвилини) або кнопка «Перерахувати» на сторінці агрегатів.`);
      setEdits({});
      manual.reload();
      modes.reload();
    }
  }

  const applicable = (s: Service, tier: Tier) => (s.tiered ? tier !== "common" : tier === "common");
  const targets = scope === "city" ? cities : regions;

  return (
    <>
      <PageHeader
        title="Міські орієнтири"
        description="Ручні ринкові значення для кожної послуги. Режим комірки визначає, що публікується: авто — агрегат клінік за достатньої вибірки, інакше орієнтир; ручний — завжди орієнтир; override — агрегат рахується, але не публікується."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SelectField
          label="Тип"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as BenchmarkScope);
            setTargetId("");
            setEdits({});
          }}
        >
          <option value="city">Місто</option>
          <option value="region">Регіон (fallback)</option>
        </SelectField>
        <SelectField
          label={scope === "city" ? "Місто" : "Регіон"}
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value);
            setEdits({});
            setSaved(null);
          }}
        >
          <option value="">— оберіть —</option>
          {targets.data?.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </SelectField>
        <div className="flex items-end gap-2 pb-0.5">
          <MiniButton tone="brand" disabled={changes.length === 0 || invalid.size > 0 || act.busy} onClick={() => setAskSave(true)}>
            Зберегти зміни ({changes.length})
          </MiniButton>
          <MiniButton disabled={Object.keys(edits).length === 0} onClick={() => setEdits({})}>Скасувати</MiniButton>
        </div>
      </div>

      {saved ? <div className="mb-3"><Notice tone="good" role="status">{saved}</Notice></div> : null}
      {act.error && !askSave ? <div className="mb-3"><Notice tone="bad" role="alert">{act.error}</Notice></div> : null}
      {invalid.size > 0 ? <div className="mb-3"><Notice tone="bad" role="alert">Значення має бути числом більше нуля. Виправте підсвічені комірки.</Notice></div> : null}

      {!targetId ? (
        <p className="py-6 text-sm text-muted">Оберіть {scope === "city" ? "місто" : "регіон"}, щоб побачити та змінити орієнтири.</p>
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
                    <th key={t} className={thClass}>{TIER_LABEL[t]}, {currency}</th>
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
                      const isInvalid = invalid.has(key);
                      const dirty = changes.some((c) => c.service_code === s.service_code && c.tier === tier);
                      const label = `${s.name}, ${TIER_LABEL[tier]}`;
                      return (
                        <td key={tier} className={`${tdClass} ${dirty ? "bg-warn-soft" : ""}`}>
                          <input
                            inputMode="decimal"
                            aria-label={`Орієнтир: ${label}`}
                            aria-invalid={isInvalid}
                            value={currentValue(key)}
                            placeholder="—"
                            onChange={(e) => setEdit(key, { value: e.target.value })}
                            className={`tabular min-h-9 w-28 rounded-lg border px-2 text-right text-sm ${isInvalid ? "border-bad" : "border-line-strong"}`}
                          />
                          {scope === "city" ? (
                            <select
                              aria-label={`Режим: ${label}`}
                              value={currentMode(key)}
                              onChange={(e) => setEdit(key, { mode: e.target.value as PriceMode })}
                              className="mt-1 block min-h-8 w-full max-w-[9.5rem] rounded-lg border border-line-strong bg-paper px-1 text-xs"
                            >
                              {(Object.keys(MODE_LABEL) as PriceMode[]).map((m) => (
                                <option key={m} value={m}>{MODE_LABEL[m]}</option>
                              ))}
                            </select>
                          ) : null}
                          {scope === "city" && currentMode(key) !== "auto" && !currentValue(key) ? (
                            <div className="mt-1"><Badge tone="warn" title="Режим ручний, але значення немає">немає значення</Badge></div>
                          ) : null}
                          {original.values.has(key) && edits[key]?.value !== undefined && !isInvalid ? (
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
          title="Зберегти орієнтири"
          message={`Змін: ${changes.length}. Кожна зміна запускає перерахунок лише для відповідного міста, послуги та рівня.`}
          confirmLabel="Зберегти"
          askReason
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
