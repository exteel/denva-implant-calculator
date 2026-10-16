"use client";

import { useMemo, useState, type FormEvent } from "react";
import { saveClinicPrice, type AdminClinicPrice, type Clinic, type ClinicPrice, type Service } from "./api";
import {
  CURRENCIES,
  compositionRequired,
  PATIENT_TIER_LIST,
  TIER_LABEL,
  describeError,
  fromDateInput,
  parseDecimal,
  toDateInput,
  validatePriceForm,
  type PriceFormErrors,
  type PriceFormValues,
} from "./helpers";
import { Button, CheckboxField, MiniButton, Modal, Notice, SelectField, TextAreaField, TextField, useAction } from "./ui";
import type { Tier } from "@/lib/contracts";

/** ТЗ §7.2 — the clinic price card (create / edit). */
export function PriceFormDialog({
  initial,
  clinics,
  services,
  defaultClinicId,
  onClose,
  onSaved,
}: {
  initial: ClinicPrice | AdminClinicPrice | null;
  clinics: Clinic[];
  services: Service[];
  defaultClinicId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !initial;
  const [values, setValues] = useState<PriceFormValues>({
    clinic_id: initial?.clinic_id ?? defaultClinicId ?? "",
    service_code: initial?.service_code ?? "",
    tier: initial?.tier ?? "",
    price_from: initial ? String(initial.price_from) : "",
    price_to: initial?.price_to != null ? String(initial.price_to) : "",
    currency: initial?.currency ?? "UAH",
    included_text: initial?.included_text ?? "",
    valid_from: toDateInput(initial?.valid_from) || toDateInput(new Date().toISOString()),
  });
  const [offerName, setOfferName] = useState(initial?.offer_name ?? "");
  const [brand, setBrand] = useState(initial?.brand_material ?? "");
  const [exclusions, setExclusions] = useState(initial?.exclusions ?? "");
  const [verifiedAt, setVerifiedAt] = useState(toDateInput(initial?.verified_at) || (isNew ? toDateInput(new Date().toISOString()) : ""));
  const [include, setInclude] = useState(initial?.include_in_aggregate ?? true);
  const [excludeReason, setExcludeReason] = useState(initial?.exclude_reason ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? "");
  const [documentPath, setDocumentPath] = useState(initial?.document_path ?? "");
  const [approveNow, setApproveNow] = useState(false);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<PriceFormErrors>({});
  const { busy, error, run } = useAction();

  const activeServices = useMemo(
    () => services.filter((s) => s.active || s.service_code === initial?.service_code),
    [services, initial?.service_code],
  );
  const service = services.find((s) => s.service_code === values.service_code);
  const set = <K extends keyof PriceFormValues>(k: K, v: PriceFormValues[K]) => setValues((p) => ({ ...p, [k]: v }));

  function onService(code: string) {
    const next = services.find((s) => s.service_code === code);
    setValues((p) => ({
      ...p,
      service_code: code,
      tier: next ? (next.tiered ? (p.tier && p.tier !== "common" ? p.tier : "") : "common") : p.tier,
    }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validatePriceForm(values, services);
    setErrors(found);
    if (Object.keys(found).length) return;
    const from = parseDecimal(values.price_from) as number;
    const to = parseDecimal(values.price_to);
    const saved = await run(
      () =>
        saveClinicPrice(
          {
            id: initial?.id,
            clinic_id: values.clinic_id,
            service_code: values.service_code,
            tier: values.tier as Tier,
            price_from: from,
            price_to: to,
            currency: values.currency,
            offer_name: offerName.trim() || null,
            brand_material: brand.trim() || null,
            included_text: values.included_text.trim() || null,
            exclusions: exclusions.trim() || null,
            valid_from: fromDateInput(values.valid_from),
            verified_at: fromDateInput(verifiedAt),
            include_in_aggregate: include,
            exclude_reason: include ? null : excludeReason.trim() || null,
            source_url: sourceUrl.trim() || null,
            document_path: documentPath.trim() || null,
            ...(isNew ? { status: approveNow ? ("approved" as const) : ("pending" as const) } : {}),
          },
          reason,
        ),
      describeError,
    );
    if (saved) onSaved();
  }

  return (
    <Modal title={isNew ? "Нова ціна клініки" : "Картка ціни клініки"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Клініка" required value={values.clinic_id} error={errors.clinic_id} onChange={(e) => set("clinic_id", e.target.value)}>
            <option value="">— оберіть —</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          <SelectField
            label="Послуга (service_code)"
            required
            value={values.service_code}
            error={errors.service_code}
            hint="Лише зі довідника"
            onChange={(e) => onService(e.target.value)}
          >
            <option value="">— оберіть —</option>
            {activeServices.map((s) => (
              <option key={s.service_code} value={s.service_code}>{s.name} ({s.service_code})</option>
            ))}
          </SelectField>
          <SelectField
            label="Рівень"
            required
            value={values.tier}
            error={errors.tier}
            disabled={service ? !service.tiered : false}
            hint={service && !service.tiered ? "Послуга без рівнів — «Спільний»" : "Потребує підтвердження Denva"}
            onChange={(e) => set("tier", e.target.value as Tier)}
          >
            <option value="">— оберіть —</option>
            {(service && !service.tiered ? (["common"] as Tier[]) : PATIENT_TIER_LIST).map((t) => (
              <option key={t} value={t}>{TIER_LABEL[t]}</option>
            ))}
          </SelectField>
          <SelectField label="Валюта" value={values.currency} error={errors.currency} onChange={(e) => set("currency", e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </SelectField>
          <TextField label="Ціна від" required inputMode="decimal" value={values.price_from} error={errors.price_from} onChange={(e) => set("price_from", e.target.value)} />
          <TextField
            label="Ціна до"
            inputMode="decimal"
            value={values.price_to}
            error={errors.price_to}
            hint="Порожньо = фіксована ціна; для діапазону технічне значення — середина"
            onChange={(e) => set("price_to", e.target.value)}
          />
        </div>

        <TextAreaField
          label="Що входить у ціну"
          required={service ? compositionRequired(service.role) : true}
          value={values.included_text}
          error={errors.included_text}
          hint={service?.included_text ? `Еталонний склад: ${service.included_text}` : "Обов'язково: ціна без складу не допускається до агрегату"}
          onChange={(e) => set("included_text", e.target.value)}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Назва у прайсі клініки" value={offerName} onChange={(e) => setOfferName(e.target.value)} />
          <TextField label="Бренд / матеріал" value={brand} hint="Внутрішній опис; пацієнту не показується" onChange={(e) => setBrand(e.target.value)} />
          <TextField label="Винятки" value={exclusions} onChange={(e) => setExclusions(e.target.value)} fieldClassName="sm:col-span-2" />
          <TextField label="Діє з (valid_from)" type="date" value={values.valid_from} error={errors.valid_from} onChange={(e) => set("valid_from", e.target.value)} />
          <TextField label="Перевірено (verified_at)" type="date" value={verifiedAt} onChange={(e) => setVerifiedAt(e.target.value)} />
        </div>

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-[13px] font-bold text-ink-soft">Вибірка агрегату</legend>
          <CheckboxField label="Включити у вибірку агрегату" checked={include} onChange={(e) => setInclude(e.target.checked)} />
          {!include ? (
            <TextField label="Причина виключення" value={excludeReason} onChange={(e) => setExcludeReason(e.target.value)} />
          ) : null}
          {isNew ? (
            <CheckboxField
              label="Одразу підтвердити (статус «Підтверджено»)"
              hint="Інакше ціна створюється зі статусом «На перевірці» і не впливає на калькулятор"
              checked={approveNow}
              onChange={(e) => setApproveNow(e.target.checked)}
            />
          ) : null}
        </fieldset>

        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-[13px] font-bold text-ink-soft">Внутрішнє підтвердження (не показується пацієнту)</legend>
          <TextField label="Посилання на джерело" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
          <TextField label="Документ (шлях / посилання)" value={documentPath} onChange={(e) => setDocumentPath(e.target.value)} />
        </fieldset>

        <TextAreaField label="Причина зміни (необов'язково)" value={reason} onChange={(e) => setReason(e.target.value)} hint="Потрапить у журнал змін" />
        {error ? <Notice tone="bad" role="alert">{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          <MiniButton onClick={onClose} disabled={busy}>Скасувати</MiniButton>
          <Button type="submit" disabled={busy} className="min-h-10">{busy ? "Збереження…" : "Зберегти"}</Button>
        </div>
      </form>
    </Modal>
  );
}
