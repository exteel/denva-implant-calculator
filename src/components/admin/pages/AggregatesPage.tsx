"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { AdminPriceMatrixRow, SourceType, Tier } from "@/lib/contracts";
import { getAggregateDetail, getPriceMatrix, listCities, processQueueNow, recalculateCity, recalculateNow } from "../api";
import {
  MODE_LABEL,
  SCOPE_LABEL,
  SOURCE_HELP,
  SOURCE_LABEL,
  TIER_LABEL,
  cellKey,
  describeError,
  formatBlend,
  formatDateTime,
  formatMoney,
  formatPlain,
} from "../helpers";
import { useAsync } from "../hooks";
import { Badge, DataState, MiniButton, Modal, Notice, PageHeader, SelectField, TableWrap, tdClass, thClass, useAction } from "../ui";

const TIER_COLUMNS: Tier[] = ["common", "minimum", "classic", "premium"];
const sourceTone: Record<SourceType, "good" | "brand" | "warn" | "neutral"> = {
  aggregate: "good",
  hybrid: "brand",
  manual_baseline: "neutral",
  manual_override: "warn",
  regional_fallback: "neutral",
  national_fallback: "neutral",
};

export default function AggregatesPage() {
  const params = useSearchParams();
  return <AggregatesView key={params.toString()} initialCity={params.get("city") ?? ""} />;
}

function AggregatesView({ initialCity }: { initialCity: string }) {
  const [cityId, setCityId] = useState(initialCity);
  const cities = useAsync(listCities, []);
  const matrix = useAsync(() => (cityId ? getPriceMatrix(cityId) : Promise.resolve([] as AdminPriceMatrixRow[])), [cityId]);
  const [open, setOpen] = useState<AdminPriceMatrixRow | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const act = useAction();

  const currency = "UAH"; // v3: all published prices are UAH

  const { services, byKey } = useMemo(() => {
    const map = new Map<string, AdminPriceMatrixRow>();
    const order: Array<{ code: string; name: string }> = [];
    for (const r of matrix.data ?? []) {
      map.set(cellKey(r.service_code, r.tier), r);
      if (!order.some((o) => o.code === r.service_code)) order.push({ code: r.service_code, name: r.service_name });
    }
    return { services: order, byKey: map };
  }, [matrix.data]);

  async function recalcAll() {
    setProgress("Перерахунок міста…");
    const n = await act.run(() => recalculateCity(cityId), describeError);
    setProgress(null);
    if (n !== undefined) {
      setNote(`Перераховано комбінацій: ${n}.`);
      matrix.reload();
    }
  }

  async function drainQueue() {
    const n = await act.run(() => processQueueNow(), describeError);
    if (n !== undefined) {
      setNote(`Оброблено елементів черги: ${n}.`);
      matrix.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Агрегати міста"
        description="Для кожної послуги й рівня: локальна вибірка клінік, медіана, використаний базовий орієнтир (місто → область → Україна), ваги гібриду та фактично опубліковане значення. Натисніть комірку, щоб побачити вибірку й формулу."
        actions={
          <>
            <MiniButton onClick={() => void drainQueue()} disabled={act.busy}>Обробити чергу</MiniButton>
            <MiniButton tone="brand" onClick={() => void recalcAll()} disabled={act.busy || !cityId || (matrix.data?.length ?? 0) === 0}>
              Перерахувати місто
            </MiniButton>
          </>
        }
      />
      <div className="mb-4 max-w-sm">
        <SelectField label="Місто" value={cityId} onChange={(e) => { setCityId(e.target.value); setNote(null); }}>
          <option value="">— оберіть —</option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectField>
      </div>
      {progress ? <p className="mb-3 text-sm text-muted" role="status">{progress}</p> : null}
      {note ? <div className="mb-3"><Notice tone="good" role="status">{note}</Notice></div> : null}
      {act.error ? <div className="mb-3"><Notice tone="bad" role="alert">{act.error}</Notice></div> : null}

      {!cityId ? (
        <p className="py-6 text-sm text-muted">Оберіть місто.</p>
      ) : (
        <DataState loading={matrix.loading} error={matrix.error} onRetry={matrix.reload} empty={services.length === 0} emptyText="Для цього міста немає активних послуг.">
          <TableWrap>
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>Послуга</th>
                  {TIER_COLUMNS.map((t) => (
                    <th key={t} className={thClass}>{TIER_LABEL[t]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map((svc) => (
                  <tr key={svc.code}>
                    <td className={tdClass}>
                      <span className="font-bold">{svc.name}</span>
                      <div className="font-mono text-[11px] text-muted">{svc.code}</div>
                    </td>
                    {TIER_COLUMNS.map((tier) => {
                      const row = byKey.get(cellKey(svc.code, tier));
                      if (!row) return <td key={tier} className={`${tdClass} bg-canvas text-center text-muted`}>—</td>;
                      return (
                        <td key={tier} className={`${tdClass} p-0`}>
                          <button
                            type="button"
                            onClick={() => setOpen(row)}
                            aria-label={`Деталі: ${svc.name}, ${TIER_LABEL[tier]}`}
                            className="block h-full w-full px-3 py-2 text-left hover:bg-brand-soft"
                          >
                            {row.published_value !== null ? (
                              <>
                                <span className="tabular text-[15px] font-extrabold">{formatMoney(row.published_value, currency)}</span>
                                {row.published_source_type ? (
                                  <div className="mt-1"><Badge tone={sourceTone[row.published_source_type]}>{SOURCE_LABEL[row.published_source_type]}</Badge></div>
                                ) : null}
                              </>
                            ) : (
                              <Badge tone="bad">Немає даних</Badge>
                            )}
                            <div className="mt-1 space-y-0.5 text-[11px] text-muted">
                              {row.mode === "manual_override" ? <div className="font-bold text-warn">override: {formatPlain(row.override_value)}</div> : null}
                              <div>
                                клінік: {row.local_clinic_count}
                                {row.local_median !== null ? ` · медіана ${formatPlain(row.local_median)}` : ""}
                              </div>
                              <div>
                                базова: {row.baseline_value !== null ? `${formatPlain(row.baseline_value)} (${row.baseline_scope ? SCOPE_LABEL[row.baseline_scope] : "—"})` : "—"}
                              </div>
                              {row.blend_weights ? <div>{formatBlend(row.blend_weights)}</div> : null}
                            </div>
                          </button>
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

      {open ? (
        <DetailDialog row={open} currency={currency} onClose={() => setOpen(null)} onRecalculated={() => matrix.reload()} />
      ) : null}
    </>
  );
}

function DetailDialog({
  row,
  currency,
  onClose,
  onRecalculated,
}: {
  row: AdminPriceMatrixRow;
  currency: string;
  onClose: () => void;
  onRecalculated: () => void;
}) {
  const detail = useAsync(() => getAggregateDetail(row.city_id, row.service_code, row.tier), [row.city_id, row.service_code, row.tier]);
  const act = useAction();
  const [done, setDone] = useState<string | null>(null);

  async function recalc() {
    const source = await act.run(() => recalculateNow(row.city_id, row.service_code, row.tier), describeError);
    if (source !== undefined) {
      setDone(`Перераховано. Джерело публікації: ${SOURCE_LABEL[source as SourceType] ?? (source || "—")}.`);
      detail.reload();
      onRecalculated();
    }
  }

  const snap = detail.data?.snapshot;
  const s = row.published_source_type;

  return (
    <Modal title={`${row.service_name} · ${TIER_LABEL[row.tier]}`} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Опубліковано</dt>
            <dd className="font-bold">
              {formatMoney(row.published_value, currency)}{" "}
              {s ? <Badge tone={sourceTone[s]}>{SOURCE_LABEL[s]}</Badge> : <Badge tone="bad">немає даних</Badge>}
              <span className="font-normal text-muted"> · {formatDateTime(row.published_at)}</span>
            </dd>
            {s ? <dd className="mt-0.5 text-xs text-muted">{SOURCE_HELP[s]}</dd> : null}
          </div>
          <div>
            <dt className="text-muted">Режим</dt>
            <dd className="font-bold">
              {MODE_LABEL[row.mode]}
              {row.mode === "manual_override" ? <span className="font-normal"> · {formatMoney(row.override_value, currency)}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Локальна вибірка</dt>
            <dd className="font-bold">
              {row.local_clinic_count} {row.local_clinic_count === 1 ? "клініка" : "клінік"}
              {" · "}медіана {formatMoney(row.local_median, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Базовий орієнтир (використано)</dt>
            <dd className="font-bold">
              {formatMoney(row.baseline_value, currency)}
              {row.baseline_scope ? <span className="font-normal text-muted"> · {SCOPE_LABEL[row.baseline_scope]}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Ваги гібриду</dt>
            <dd className="font-bold">{formatBlend(row.blend_weights)}</dd>
          </div>
          <div>
            <dt className="text-muted">Орієнтири за рівнями (місто / область / Україна)</dt>
            <dd className="tabular font-bold">
              {formatPlain(row.city_baseline)} / {formatPlain(row.region_baseline)} / {formatPlain(row.country_baseline)}
            </dd>
          </div>
          {snap ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Формула (snapshot від {formatDateTime(snap.calculated_at)})</dt>
              <dd className="rounded-lg bg-canvas px-3 py-2 font-mono text-xs">{snap.formula || "—"}</dd>
            </div>
          ) : null}
        </dl>

        <DataState loading={detail.loading} error={detail.error} onRetry={detail.reload}>
          {!snap ? (
            <Notice tone="warn">Для цієї комбінації ще не було розрахунку. Натисніть «Перерахувати».</Notice>
          ) : (
            <>
              <h3 className="font-extrabold">Увійшли у вибірку ({detail.data?.included.length})</h3>
              {detail.data?.included.length ? (
                <TableWrap>
                  <table className="w-full min-w-[460px] border-collapse">
                    <thead><tr><th className={thClass}>Клініка</th><th className={thClass}>Значення, {currency}</th><th className={thClass}>Діє з</th></tr></thead>
                    <tbody>
                      {detail.data.included.map((i) => (
                        <tr key={i.clinic_price_id}>
                          <td className={tdClass}>{i.clinic_name}</td>
                          <td className={`${tdClass} tabular`}>{formatPlain(i.value_uah)}</td>
                          <td className={tdClass}>{i.valid_from ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              ) : (
                <p className="text-muted">Жодна ціна клініки не пройшла відбір.</p>
              )}

              <h3 className="font-extrabold">Виключено ({detail.data?.excluded.length})</h3>
              {detail.data?.excluded.length ? (
                <TableWrap>
                  <table className="w-full min-w-[460px] border-collapse">
                    <thead><tr><th className={thClass}>Клініка</th><th className={thClass}>Значення</th><th className={thClass}>Причина</th></tr></thead>
                    <tbody>
                      {detail.data.excluded.map((x) => (
                        <tr key={`${x.clinic_price_id}-${x.reason}`}>
                          <td className={tdClass}>{x.clinic_name}</td>
                          <td className={`${tdClass} tabular`}>{formatPlain(x.value_uah)}</td>
                          <td className={tdClass}><Badge tone="warn">{x.reason}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              ) : (
                <p className="text-muted">Виключених записів немає.</p>
              )}
            </>
          )}
        </DataState>

        {done ? <Notice tone="good" role="status">{done}</Notice> : null}
        {act.error ? <Notice tone="bad" role="alert">{act.error}</Notice> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            href={`/admin/history/?city=${encodeURIComponent(row.city_id)}&service=${encodeURIComponent(row.service_code)}&tier=${row.tier}`}
            className="inline-flex min-h-9 items-center rounded-lg px-3 text-[13px] font-bold text-brand no-underline hover:bg-brand-soft"
          >
            Історія snapshot-ів
          </Link>
          <MiniButton tone="brand" onClick={() => void recalc()} disabled={act.busy}>
            {act.busy ? "Перерахунок…" : "Перерахувати"}
          </MiniButton>
        </div>
      </div>
    </Modal>
  );
}
