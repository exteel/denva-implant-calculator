"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { listLeads, retryLead, type Lead } from "../api";
import { describeError, formatDateTime, formatMoney } from "../helpers";
import { useAsync } from "../hooks";
import { Badge, DataState, MiniButton, Notice, PageHeader, SelectField, TableWrap, tdClass, thClass } from "../ui";

const STATUS_LABEL = { pending: "Очікує", sent: "Надіслано", failed: "Помилка" } as const;
const STATUS_TONE = { pending: "warn", sent: "good", failed: "bad" } as const;
const INTENT_LABEL: Record<string, string> = { refine: "Уточнити розрахунок", send_calculation: "Надіслати розрахунок" };

function payloadField<T>(lead: Lead, key: string): T | undefined {
  return (lead.payload as Record<string, unknown> | null)?.[key] as T | undefined;
}

export default function LeadsPage() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const leads = useAsync(() => listLeads(300), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = (leads.data ?? []).filter((l) => !status || l.telegram_status === status);

  async function retry(lead: Lead) {
    setBusyId(lead.id);
    setMessage(null);
    try {
      const res = await retryLead(lead.id);
      setMessage(
        res.telegram === "sent"
          ? { tone: "good", text: "Заявку надіслано в Telegram." }
          : { tone: "bad", text: "Telegram знову не прийняв заявку. Деталі — у стовпці «Помилка»." },
      );
    } catch (e) {
      setMessage({ tone: "bad", text: describeError(e) });
    } finally {
      setBusyId(null);
      leads.reload();
    }
  }

  return (
    <>
      <PageHeader title="Заявки" description="Заявки спершу зберігаються в базі, потім надсилаються в Telegram. Помилка Telegram не втрачає заявку — її можна надіслати ще раз." />
      <div className="mb-4 max-w-xs">
        <SelectField label="Статус Telegram" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Усі</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </SelectField>
      </div>
      {message ? <div className="mb-3"><Notice tone={message.tone} role={message.tone === "bad" ? "alert" : "status"}>{message.text}</Notice></div> : null}
      <DataState loading={leads.loading} error={leads.error} onRetry={leads.reload} empty={rows.length === 0} emptyText="Заявок немає.">
        <TableWrap>
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Дата</th>
                <th className={thClass}>Телефон</th>
                <th className={thClass}>Локація</th>
                <th className={thClass}>Сценарій</th>
                <th className={thClass}>Сума</th>
                <th className={thClass}>Telegram</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const loc = payloadField<{ name?: string }>(l, "location");
                const total = payloadField<number | null>(l, "total_uah");
                const full = payloadField<number | null>(l, "full_treatment_uah");
                return (
                  <tr key={l.id}>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(l.created_at)}</td>
                    <td className={`${tdClass} whitespace-nowrap font-bold`}>
                      <a href={`tel:${l.phone ?? ""}`} className="text-ink no-underline hover:text-brand">{l.phone}</a>
                      <div className="text-[11px] font-normal text-muted">{INTENT_LABEL[l.intent ?? ""] ?? l.intent}</div>
                    </td>
                    <td className={tdClass}>{loc?.name ?? l.location_id ?? "—"}</td>
                    <td className={tdClass}>
                      {payloadField<string>(l, "scenario_label") ?? "—"}
                      <div className="text-[11px] text-muted">
                        {payloadField<string>(l, "implant_tier") ?? "—"} / {payloadField<string>(l, "crown_or_arch_tier") ?? "—"}
                      </div>
                    </td>
                    <td className={`${tdClass} tabular`}>
                      {formatMoney(total ?? null)}
                      {full ? <div className="text-[11px] text-muted">повне: {formatMoney(full)}</div> : null}
                      <div className="text-[11px] text-muted">{payloadField<string>(l, "price_source") ?? ""}</div>
                    </td>
                    <td className={tdClass}>
                      <Badge tone={STATUS_TONE[l.telegram_status]}>{STATUS_LABEL[l.telegram_status]}</Badge>
                      <div className="text-[11px] text-muted">спроб: {l.attempts ?? 0}</div>
                      {l.telegram_error ? <div className="mt-1 max-w-[14rem] break-words text-[11px] text-bad">{l.telegram_error}</div> : null}
                    </td>
                    <td className={tdClass}>
                      <div className="flex flex-col gap-1">
                        {l.telegram_status !== "sent" ? (
                          <MiniButton tone="brand" disabled={busyId === l.id} onClick={() => void retry(l)}>
                            {busyId === l.id ? "Надсилання…" : "Надіслати в Telegram ще раз"}
                          </MiniButton>
                        ) : null}
                        <MiniButton onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                          {expanded === l.id ? "Сховати деталі" : "Деталі"}
                        </MiniButton>
                      </div>
                      {expanded === l.id ? (
                        <pre className="mt-2 max-h-64 max-w-[22rem] overflow-auto rounded-lg bg-canvas p-2 text-[11px]">{JSON.stringify(l.payload, null, 2)}</pre>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </DataState>
    </>
  );
}
