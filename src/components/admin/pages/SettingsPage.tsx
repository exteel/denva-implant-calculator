"use client";

import { useState, type FormEvent } from "react";
import { Card, SectionTitle } from "@/components/ui/Card";
import type { AggregationMethod } from "@/lib/contracts";
import { DEFAULT_SETTINGS, getSettings, listCurrencyRates, saveSettings, type Settings } from "../api";
import { METHOD_LABEL, describeError, formatDate, parseDecimal } from "../helpers";
import { useAsync } from "../hooks";
import { Button, DataState, Notice, PageHeader, SelectField, TableWrap, TextAreaField, TextField, tdClass, thClass, useAction } from "../ui";

export default function SettingsPage() {
  const settings = useAsync(getSettings, []);
  const rates = useAsync(listCurrencyRates, []);
  return (
    <>
      <PageHeader title="Налаштування" description="Глобальні параметри агрегації. Зміна запускає перерахунок усіх комбінацій." />
      <DataState loading={settings.loading} error={settings.error} onRetry={settings.reload}>
        {settings.data ? <SettingsForm initial={settings.data} onSaved={settings.reload} /> : null}
      </DataState>

      <h2 className="mb-2 mt-8 text-[17px] font-extrabold">Курси валют (НБУ)</h2>
      <p className="mb-2 text-sm text-muted">Оновлюються щодня функцією nbu-rate. Редагуються лише в базі.</p>
      <DataState loading={rates.loading} error={rates.error} onRetry={rates.reload} empty={rates.data?.length === 0} emptyText="Курсів ще немає.">
        <TableWrap>
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Дата</th>
                <th className={thClass}>Валюта</th>
                <th className={thClass}>Курс до UAH</th>
              </tr>
            </thead>
            <tbody>
              {rates.data?.map((r, i) => (
                <tr key={`${r.currency}-${r.rate_date}-${i}`}>
                  <td className={tdClass}>{formatDate(r.rate_date)}</td>
                  <td className={tdClass}>{r.currency}</td>
                  <td className={`${tdClass} tabular`}>{Number(r.rate_to_uah).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </DataState>
    </>
  );
}

function SettingsForm({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [form, setForm] = useState({
    min_clinics: String(initial.min_clinics),
    aggregation_method: initial.aggregation_method,
    stale_after_months: String(initial.stale_after_months),
    deviation_warning_pct: String(initial.deviation_warning_pct),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [saved, setSaved] = useState(false);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const next: typeof errors = {};
    const min = parseDecimal(form.min_clinics);
    const stale = parseDecimal(form.stale_after_months);
    const dev = parseDecimal(form.deviation_warning_pct);
    if (min === null || Number.isNaN(min) || !Number.isInteger(min) || min < 1) next.min_clinics = "Ціле число від 1.";
    if (stale === null || Number.isNaN(stale) || !Number.isInteger(stale) || stale < 1) next.stale_after_months = "Ціле число місяців від 1.";
    if (dev === null || Number.isNaN(dev) || dev <= 0) next.deviation_warning_pct = "Число більше нуля.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const ok = await run(
      async () => {
        await saveSettings(
          {
            min_clinics: min as number,
            aggregation_method: form.aggregation_method,
            stale_after_months: stale as number,
            deviation_warning_pct: dev as number,
          },
          reason,
        );
        return true;
      },
      describeError,
    );
    if (ok) {
      setSaved(true);
      onSaved();
    }
  }

  return (
    <Card className="max-w-2xl">
      <SectionTitle>Агрегація</SectionTitle>
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <TextField
          label="Мінімальна вибірка (min_clinics)"
          inputMode="numeric"
          value={form.min_clinics}
          error={errors.min_clinics}
          hint={`Менше клінік — агрегат не публікується. Рекомендовано ${DEFAULT_SETTINGS.min_clinics}. Місто може мати власний поріг.`}
          onChange={(e) => setForm((f) => ({ ...f, min_clinics: e.target.value }))}
        />
        <SelectField
          label="Метод (aggregation_method)"
          value={form.aggregation_method}
          hint="Пацієнту показується як «середня ринкова ціна». Медіана не спотворюється одиничною демпінговою ціною."
          onChange={(e) => setForm((f) => ({ ...f, aggregation_method: e.target.value as AggregationMethod }))}
        >
          {(Object.keys(METHOD_LABEL) as AggregationMethod[]).map((m) => (
            <option key={m} value={m}>{METHOD_LABEL[m]}</option>
          ))}
        </SelectField>
        <TextField
          label="Ціна застаріває через, місяців (stale_after_months)"
          inputMode="numeric"
          value={form.stale_after_months}
          error={errors.stale_after_months}
          hint="Підтверджені ціни, перевірені раніше, виключаються з вибірки й позначаються застарілими."
          onChange={(e) => setForm((f) => ({ ...f, stale_after_months: e.target.value }))}
        />
        <TextField
          label="Попереджати про відхилення, % (deviation_warning_pct)"
          inputMode="decimal"
          value={form.deviation_warning_pct}
          error={errors.deviation_warning_pct}
          hint="Ціна клініки, що відхиляється від агрегату міста більше ніж на цей відсоток, отримує попередження."
          onChange={(e) => setForm((f) => ({ ...f, deviation_warning_pct: e.target.value }))}
        />
        <TextAreaField label="Причина зміни (необов'язково)" value={reason} onChange={(e) => setReason(e.target.value)} hint="Потрапить у журнал змін" />
        {error ? <Notice tone="bad" role="alert">{error}</Notice> : null}
        {saved ? <Notice tone="good" role="status">Збережено. Перерахунок виконає черга.</Notice> : null}
        <Button type="submit" disabled={busy} className="min-h-10">{busy ? "Збереження…" : "Зберегти"}</Button>
      </form>
    </Card>
  );
}
