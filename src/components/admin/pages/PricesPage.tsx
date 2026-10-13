"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  DEFAULT_SETTINGS,
  approveBatch,
  getSettings,
  listCities,
  listClinicPrices,
  listClinics,
  listServices,
  moderatePrices,
  type AdminClinicPrice,
} from "../api";
import { PriceFormDialog } from "../PriceFormDialog";
import { PATIENT_TIER_LIST, PRICE_STATUS_LABEL, TIER_LABEL, describeError, formatDate, formatPlain } from "../helpers";
import { useAsync } from "../hooks";
import {
  Badge,
  ConfirmDialog,
  DataState,
  MiniButton,
  Notice,
  PageHeader,
  SelectField,
  TableWrap,
  tdClass,
  thClass,
  useAction,
} from "../ui";
import type { ClinicPriceStatus, Tier } from "@/lib/contracts";

const statusTone = { pending: "warn", approved: "good", rejected: "bad", stale: "neutral" } as const;

type Moderation = { ids: string[]; status: ClinicPriceStatus; label: string; batch?: string };

/** ТЗ §7.3: the view flags |deviation| above settings.deviation_warning_pct. */
function warningText(row: AdminClinicPrice, threshold: number): string | null {
  const d = row.deviation_pct;
  if (d != null && (row.warning || Math.abs(d) >= threshold)) {
    return `Відхилення від агрегату міста: ${d > 0 ? "+" : ""}${d}%`;
  }
  return row.warning ? "Значне відхилення від чинного агрегату" : null;
}

/** Re-mounts when the query string changes so links like ?status=pending apply to filters. */
export default function PricesPage() {
  const params = useSearchParams();
  return <PricesView key={params.toString()} params={params} />;
}

function PricesView({ params }: { params: URLSearchParams }) {
  const [cityId, setCityId] = useState(params.get("city") ?? "");
  const [clinicId, setClinicId] = useState(params.get("clinic") ?? "");
  const [serviceCode, setServiceCode] = useState(params.get("service") ?? "");
  const [tier, setTier] = useState<Tier | "">((params.get("tier") as Tier | null) ?? "");
  const [status, setStatus] = useState<ClinicPriceStatus | "">((params.get("status") as ClinicPriceStatus | null) ?? "");
  const batchId = params.get("batch") ?? "";

  const cities = useAsync(listCities, []);
  const clinics = useAsync(() => listClinics({}), []);
  const services = useAsync(listServices, []);
  const settings = useAsync(() => getSettings().catch(() => DEFAULT_SETTINGS), []);

  const prices = useAsync(
    () => listClinicPrices({ cityId, clinicId, serviceCode, tier, status, batchId }),
    [cityId, clinicId, serviceCode, tier, status, batchId],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminClinicPrice | "new" | null>(null);
  const [moderation, setModeration] = useState<Moderation | null>(null);
  const act = useAction();
  const [note, setNote] = useState<string | null>(null);

  const clinicName = (id: string) => clinics.data?.find((c) => c.id === id)?.name ?? "—";
  const serviceName = (code: string | null) => (code ? (services.data?.find((s) => s.service_code === code)?.name ?? code) : "— не зіставлено —");
  const threshold = settings.data?.deviation_warning_pct ?? DEFAULT_SETTINGS.deviation_warning_pct;
  const rows = prices.data ?? [];
  const pendingInBatch = rows.filter((r) => r.status === "pending").length;

  const clinicOptions = (clinics.data ?? []).filter((c) => !cityId || c.city_id === cityId);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm(reason: string) {
    if (!moderation) return;
    const ok = await act.run(async () => {
      if (moderation.batch) {
        const res = await approveBatch(moderation.batch, reason);
        setNote(
          `Підтверджено: ${res.approved}.` +
            (res.unmapped ? ` Пропущено ${res.unmapped} без service_code/рівня — зіставте їх у картці ціни.` : ""),
        );
      } else {
        const changed = await moderatePrices(moderation.ids, moderation.status, reason);
        setNote(`Оновлено цін: ${changed}.`);
      }
      return true;
    }, describeError);
    if (ok) {
      setModeration(null);
      setSelected(new Set());
      prices.reload();
    }
  }

  const dangerous = moderation?.status === "rejected" || moderation?.status === "stale";

  return (
    <>
      <PageHeader
        title="Прайси клінік"
        description="Нові та імпортовані ціни мають статус «На перевірці» й не впливають на калькулятор, доки їх не підтверджено."
        actions={<MiniButton tone="brand" onClick={() => setEditing("new")}>+ Ціна</MiniButton>}
      />

      {batchId ? (
        <Notice tone="brand" role="status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Показано ціни імпорту <span className="font-mono text-xs">{batchId}</span>: на перевірці — {pendingInBatch}.</span>
            <MiniButton
              tone="good"
              disabled={pendingInBatch === 0}
              onClick={() => setModeration({ ids: [], status: "approved", label: "Підтвердити всі ціни імпорту", batch: batchId })}
            >
              Підтвердити весь імпорт
            </MiniButton>
          </div>
        </Notice>
      ) : null}

      <div className="mb-4 mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SelectField
          label="Місто"
          value={cityId}
          onChange={(e) => {
            setCityId(e.target.value);
            setClinicId("");
          }}
        >
          <option value="">Усі міста</option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectField>
        <SelectField label="Клініка" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
          <option value="">Усі клініки</option>
          {clinicOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectField>
        <SelectField label="Послуга" value={serviceCode} onChange={(e) => setServiceCode(e.target.value)}>
          <option value="">Усі послуги</option>
          {services.data?.map((s) => (
            <option key={s.service_code} value={s.service_code}>{s.name}</option>
          ))}
        </SelectField>
        <SelectField label="Рівень" value={tier} onChange={(e) => setTier(e.target.value as Tier | "")}>
          <option value="">Усі рівні</option>
          <option value="common">{TIER_LABEL.common}</option>
          {PATIENT_TIER_LIST.map((t) => (
            <option key={t} value={t}>{TIER_LABEL[t]}</option>
          ))}
        </SelectField>
        <SelectField label="Статус" value={status} onChange={(e) => setStatus(e.target.value as ClinicPriceStatus | "")}>
          <option value="">Усі</option>
          {(Object.keys(PRICE_STATUS_LABEL) as ClinicPriceStatus[]).map((s) => (
            <option key={s} value={s}>{PRICE_STATUS_LABEL[s]}</option>
          ))}
        </SelectField>
      </div>

      {note ? (
        <div className="mb-3">
          <Notice tone="good" role="status">{note}</Notice>
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-line bg-brand-soft px-4 py-2 text-sm">
          <span className="font-bold">Вибрано: {selected.size}</span>
          <MiniButton tone="good" onClick={() => setModeration({ ids: [...selected], status: "approved", label: "Підтвердити вибрані" })}>Підтвердити</MiniButton>
          <MiniButton tone="bad" onClick={() => setModeration({ ids: [...selected], status: "rejected", label: "Відхилити вибрані" })}>Відхилити</MiniButton>
          <MiniButton onClick={() => setModeration({ ids: [...selected], status: "stale", label: "Позначити вибрані застарілими" })}>Застарілі</MiniButton>
          <MiniButton onClick={() => setSelected(new Set())}>Зняти вибір</MiniButton>
        </div>
      ) : null}

      <DataState loading={prices.loading} error={prices.error} onRetry={prices.reload} empty={rows.length === 0} emptyText="Цін за цими фільтрами немає.">
        <TableWrap>
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>
                  <input
                    type="checkbox"
                    aria-label="Вибрати всі"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                <th className={thClass}>Клініка</th>
                <th className={thClass}>Послуга</th>
                <th className={thClass}>Рівень</th>
                <th className={thClass}>Ціна</th>
                <th className={thClass}>Діє з</th>
                <th className={thClass}>Статус</th>
                <th className={thClass}>Вибірка</th>
                <th className={thClass}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const warn = warningText(r, threshold);
                return (
                  <tr key={r.id} className={selected.has(r.id) ? "bg-brand-soft/50" : undefined}>
                    <td className={tdClass}>
                      <input type="checkbox" aria-label={`Вибрати ціну ${serviceName(r.service_code)}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                    <td className={tdClass}>
                      <span className="font-bold">{r.clinic_name ?? clinicName(r.clinic_id)}</span>
                      {r.is_demo ? <> <Badge tone="warn">демо</Badge></> : null}
                      {r.city_name ? <div className="text-xs text-muted">{r.city_name}</div> : null}
                    </td>
                    <td className={tdClass}>
                      {serviceName(r.service_code)}
                      {r.offer_name ? <div className="text-xs text-muted">{r.offer_name}</div> : null}
                    </td>
                    <td className={tdClass}>{r.tier ? TIER_LABEL[r.tier] : "—"}</td>
                    <td className={`${tdClass} tabular`}>
                      {formatPlain(r.price_from)}
                      {r.price_to != null ? `–${formatPlain(r.price_to)}` : ""} {r.currency}
                      {warn ? (
                        <div className="mt-1">
                          <Badge tone="warn" title={warn}>⚠ {warn}</Badge>
                        </div>
                      ) : null}
                    </td>
                    <td className={tdClass}>{formatDate(r.valid_from)}</td>
                    <td className={tdClass}>
                      <Badge tone={statusTone[r.status]}>{PRICE_STATUS_LABEL[r.status]}</Badge>
                      {r.exclude_reason ? <div className="mt-1 max-w-[14rem] text-xs text-muted">{r.exclude_reason}</div> : null}
                    </td>
                    <td className={tdClass}>{r.include_in_aggregate ? "Так" : <Badge>Ні</Badge>}</td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-1">
                        <MiniButton onClick={() => setEditing(r)}>Картка</MiniButton>
                        {r.status !== "approved" ? (
                          <MiniButton
                            tone="good"
                            disabled={!r.service_code || !r.tier}
                            title={!r.service_code || !r.tier ? "Спершу зіставте service_code і рівень у картці" : undefined}
                            onClick={() => setModeration({ ids: [r.id], status: "approved", label: "Підтвердити ціну" })}
                          >
                            Підтвердити
                          </MiniButton>
                        ) : null}
                        {r.status !== "rejected" ? (
                          <MiniButton tone="bad" onClick={() => setModeration({ ids: [r.id], status: "rejected", label: "Відхилити ціну" })}>Відхилити</MiniButton>
                        ) : null}
                        {r.status === "approved" ? (
                          <MiniButton onClick={() => setModeration({ ids: [r.id], status: "stale", label: "Позначити застарілою" })}>Застаріла</MiniButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </DataState>

      {editing ? (
        <PriceFormDialog
          initial={editing === "new" ? null : editing}
          clinics={clinics.data ?? []}
          services={services.data ?? []}
          defaultClinicId={clinicId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            prices.reload();
          }}
        />
      ) : null}
      {moderation ? (
        <ConfirmDialog
          title={moderation.label}
          message={
            moderation.batch
              ? "Усі ціни цього імпорту зі статусом «На перевірці» стануть «Підтверджено» і запустять перерахунок відповідних міст, послуг і рівнів."
              : `Змінити статус для цін: ${moderation.ids.length}. Підтвердження запускає перерахунок лише відповідних міст, послуг і рівнів.`
          }
          confirmLabel={moderation.status === "approved" ? "Підтвердити" : moderation.status === "rejected" ? "Відхилити" : "Позначити"}
          danger={dangerous}
          askReason
          busy={act.busy}
          error={act.error}
          onConfirm={(reason) => void confirm(reason)}
          onCancel={() => {
            setModeration(null);
            act.setError(null);
          }}
        />
      ) : null}
    </>
  );
}
