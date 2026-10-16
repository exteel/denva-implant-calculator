"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { Tier } from "@/lib/contracts";
import {
  AUDIT_TABLES,
  listAdminUsers,
  listAudit,
  listCities,
  listPublishedHistory,
  listServices,
  listSnapshots,
  type AuditEntry,
} from "../api";
import { SCOPE_LABEL, SOURCE_LABEL, TIER_LABEL, diffRecords, formatBlend, formatDateTime, formatPlain, formatValue } from "../helpers";
import { useAsync } from "../hooks";
import { Badge, DataState, PageHeader, SelectField, TableWrap, TextField, tdClass, thClass } from "../ui";
import type { GeoScope, SourceType } from "@/lib/contracts";

const ACTION_LABEL = { INSERT: "Створено", UPDATE: "Змінено", DELETE: "Видалено" } as const;
const ACTION_TONE = { INSERT: "good", UPDATE: "brand", DELETE: "bad" } as const;

export default function HistoryPage() {
  const params = useSearchParams();
  return (
    <HistoryView
      key={params.toString()}
      initial={{ city: params.get("city") ?? "", service: params.get("service") ?? "", tier: (params.get("tier") ?? "") as Tier | "" }}
    />
  );
}

function HistoryView({ initial }: { initial: { city: string; service: string; tier: Tier | "" } }) {
  const [tab, setTab] = useState<"audit" | "snapshots">(initial.city ? "snapshots" : "audit");
  return (
    <>
      <PageHeader
        title="Історія змін"
        description="Журнал змін (автор, старе й нове значення, причина) та історія snapshot-ів агрегатів і опублікованих цін. Записи лише додаються."
      />
      <div role="tablist" aria-label="Розділи історії" className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ["audit", "Журнал змін"],
            ["snapshots", "Snapshot-и комбінації"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold ${tab === key ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "audit" ? <AuditTab /> : <SnapshotsTab initial={initial} />}
    </>
  );
}

function DiffCell({ entry }: { entry: AuditEntry }) {
  const diff = useMemo(() => diffRecords(entry.old_data, entry.new_data), [entry]);
  if (entry.action === "INSERT" || entry.action === "DELETE") {
    const row = (entry.action === "INSERT" ? entry.new_data : entry.old_data) as Record<string, unknown> | null;
    const summary = row
      ? Object.entries(row)
          .filter(([k, v]) => v !== null && !["created_at", "updated_at", "updated_by", "created_by", "id"].includes(k))
          .slice(0, 6)
          .map(([k, v]) => `${k}: ${formatValue(v)}`)
          .join(" · ")
      : "";
    return <span className="text-xs text-ink-soft">{summary || "—"}</span>;
  }
  if (diff.length === 0) return <span className="text-xs text-muted">без змін у полях</span>;
  return (
    <ul className="space-y-0.5 text-xs">
      {diff.map((d) => (
        <li key={d.field}>
          <span className="font-mono text-muted">{d.field}</span>:{" "}
          <span className="text-bad line-through decoration-1">{formatValue(d.before)}</span>
          {" → "}
          <span className="font-bold text-good">{formatValue(d.after)}</span>
        </li>
      ))}
    </ul>
  );
}

function AuditTab() {
  const [table, setTable] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const admins = useAsync(listAdminUsers, []);
  const audit = useAsync(() => listAudit({ table, actor, from, to }), [table, actor, from, to]);
  const actorLabel = (id: string | null) => (id ? (admins.data?.find((a) => a.user_id === id)?.email ?? `${id.slice(0, 8)}…`) : "система");

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SelectField label="Таблиця" value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">Усі</option>
          {AUDIT_TABLES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </SelectField>
        <SelectField label="Автор" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">Усі</option>
          {admins.data?.map((a) => (
            <option key={a.user_id} value={a.user_id}>{a.email ?? a.user_id}</option>
          ))}
        </SelectField>
        <TextField label="Від" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="До" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <DataState loading={audit.loading} error={audit.error} onRetry={audit.reload} empty={audit.data?.length === 0} emptyText="Записів за цими фільтрами немає.">
        <TableWrap>
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Коли</th>
                <th className={thClass}>Автор</th>
                <th className={thClass}>Таблиця</th>
                <th className={thClass}>Дія</th>
                <th className={thClass}>Зміни (було → стало)</th>
                <th className={thClass}>Причина</th>
              </tr>
            </thead>
            <tbody>
              {audit.data?.map((e) => (
                <tr key={e.id}>
                  <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(e.at)}</td>
                  <td className={tdClass}>{actorLabel(e.actor)}</td>
                  <td className={tdClass}>
                    <span className="font-mono text-xs">{e.table_name}</span>
                    {e.record_pk ? <div className="max-w-[10rem] truncate text-[11px] text-muted" title={e.record_pk}>{e.record_pk}</div> : null}
                  </td>
                  <td className={tdClass}><Badge tone={ACTION_TONE[e.action]}>{ACTION_LABEL[e.action]}</Badge></td>
                  <td className={`${tdClass} max-w-[28rem]`}><DiffCell entry={e} /></td>
                  <td className={tdClass}>{e.reason ?? <span className="text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </DataState>
    </>
  );
}

function SnapshotsTab({ initial }: { initial: { city: string; service: string; tier: Tier | "" } }) {
  const [cityId, setCityId] = useState(initial.city);
  const [serviceCode, setServiceCode] = useState(initial.service);
  const [tier, setTier] = useState<Tier | "">(initial.tier);
  const cities = useAsync(listCities, []);
  const services = useAsync(listServices, []);
  const ready = Boolean(cityId && serviceCode && tier);
  const snaps = useAsync(() => (ready ? listSnapshots(cityId, serviceCode, tier as Tier) : Promise.resolve([])), [cityId, serviceCode, tier]);
  const published = useAsync(() => (ready ? listPublishedHistory(cityId, serviceCode, tier as Tier) : Promise.resolve([])), [cityId, serviceCode, tier]);
  const service = services.data?.find((s) => s.service_code === serviceCode);
  const tierOptions: Tier[] = service ? (service.tiered ? ["minimum", "classic", "premium"] : ["common"]) : ["common", "minimum", "classic", "premium"];

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SelectField label="Місто" value={cityId} onChange={(e) => setCityId(e.target.value)}>
          <option value="">— оберіть —</option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectField>
        <SelectField
          label="Послуга"
          value={serviceCode}
          onChange={(e) => {
            setServiceCode(e.target.value);
            setTier("");
          }}
        >
          <option value="">— оберіть —</option>
          {services.data?.map((s) => (
            <option key={s.service_code} value={s.service_code}>{s.name}</option>
          ))}
        </SelectField>
        <SelectField label="Рівень" value={tier} onChange={(e) => setTier(e.target.value as Tier | "")}>
          <option value="">— оберіть —</option>
          {tierOptions.map((t) => (
            <option key={t} value={t}>{TIER_LABEL[t]}</option>
          ))}
        </SelectField>
      </div>
      {!ready ? (
        <p className="py-6 text-sm text-muted">Оберіть місто, послугу та рівень.</p>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-[17px] font-extrabold">Snapshot-и агрегату</h2>
            <DataState loading={snaps.loading} error={snaps.error} onRetry={snaps.reload} empty={snaps.data?.length === 0} emptyText="Розрахунків ще не було.">
              <TableWrap>
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr>
                      <th className={thClass}>Розраховано</th>
                      <th className={thClass}>Значення</th>
                      <th className={thClass}>Клінік</th>
                      <th className={thClass}>Медіана</th>
                      <th className={thClass}>Базова</th>
                      <th className={thClass}>Ваги</th>
                      <th className={thClass}>Формула</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snaps.data?.map((s) => (
                      <tr key={s.id}>
                        <td className={tdClass}>{formatDateTime(s.calculated_at)}</td>
                        <td className={`${tdClass} tabular font-bold`}>{formatPlain(s.value)}</td>
                        <td className={`${tdClass} tabular`}>{s.clinic_count}</td>
                        <td className={`${tdClass} tabular`}>{formatPlain(s.local_median)}</td>
                        <td className={`${tdClass} tabular`}>
                          {formatPlain(s.baseline_value)}
                          {s.baseline_scope ? <span className="text-xs text-muted"> ({SCOPE_LABEL[s.baseline_scope as GeoScope] ?? s.baseline_scope})</span> : null}
                        </td>
                        <td className={tdClass}>{formatBlend(s.blend_weights)}</td>
                        <td className={`${tdClass} max-w-[18rem] font-mono text-[11px]`}>{s.formula ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </DataState>
          </section>
          <section>
            <h2 className="mb-2 text-[17px] font-extrabold">Історія опублікованого значення</h2>
            <DataState loading={published.loading} error={published.error} onRetry={published.reload} empty={published.data?.length === 0} emptyText="Публікацій ще не було.">
              <TableWrap>
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className={thClass}>Коли</th>
                      <th className={thClass}>Подія</th>
                      <th className={thClass}>Було → стало</th>
                      <th className={thClass}>Джерело</th>
                      <th className={thClass}>Клінік</th>
                    </tr>
                  </thead>
                  <tbody>
                    {published.data?.map((p) => (
                      <tr key={p.id}>
                        <td className={tdClass}>{formatDateTime(p.published_at)}</td>
                        <td className={tdClass}>{p.change_type === "removed" ? <Badge tone="bad">Знято з публікації</Badge> : <Badge tone="brand">Опубліковано</Badge>}</td>
                        <td className={`${tdClass} tabular`}>
                          {formatPlain(p.previous_value)} → <span className="font-bold">{formatPlain(p.value)}</span> {p.currency ?? ""}
                        </td>
                        <td className={tdClass}>{p.source_type ? (SOURCE_LABEL[p.source_type as SourceType] ?? p.source_type) : "—"}</td>
                        <td className={`${tdClass} tabular`}>{p.local_clinic_count ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </DataState>
          </section>
        </div>
      )}
    </>
  );
}
