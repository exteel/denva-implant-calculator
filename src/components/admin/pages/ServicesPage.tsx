"use client";

import { useState, type FormEvent } from "react";
import { listServices, saveService, type Service } from "../api";
import { ROLES, ROLE_LABEL, describeError, parseDecimal } from "../helpers";
import { useAsync } from "../hooks";
import {
  Badge,
  Button,
  CheckboxField,
  DataState,
  MiniButton,
  Modal,
  Notice,
  PageHeader,
  SelectField,
  TableWrap,
  TextAreaField,
  TextField,
  tdClass,
  thClass,
  useAction,
} from "../ui";
import type { ServiceRole } from "@/lib/contracts";

const blank: Service = {
  service_code: "",
  name: "",
  role: "implant",
  unit: "",
  tiered: false,
  included_text: "",
  active: true,
  sort: 100,
};

export default function ServicesPage() {
  const services = useAsync(listServices, []);
  const [editing, setEditing] = useState<{ service: Service; isNew: boolean } | null>(null);

  return (
    <>
      <PageHeader
        title="Каталог послуг"
        description="Формули калькулятора посилаються лише на service_code та рівень. service_code не можна змінити після створення."
        actions={<MiniButton tone="brand" onClick={() => setEditing({ service: blank, isNew: true })}>+ Послуга</MiniButton>}
      />
      <DataState loading={services.loading} error={services.error} onRetry={services.reload} empty={services.data?.length === 0} emptyText="Каталог порожній.">
        <TableWrap>
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>service_code</th>
                <th className={thClass}>Назва</th>
                <th className={thClass}>Роль у формулі</th>
                <th className={thClass}>Одиниця</th>
                <th className={thClass}>Рівні</th>
                <th className={thClass}>Стан</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {services.data?.map((s) => (
                <tr key={s.service_code}>
                  <td className={`${tdClass} tabular text-muted`}>{s.sort}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{s.service_code}</td>
                  <td className={tdClass}>
                    <span className="font-bold">{s.name}</span>
                    {s.included_text ? <div className="text-xs text-muted">{s.included_text}</div> : null}
                  </td>
                  <td className={tdClass}>{ROLE_LABEL[s.role] ?? s.role}</td>
                  <td className={tdClass}>{s.unit}</td>
                  <td className={tdClass}>{s.tiered ? <Badge tone="brand">3 рівні</Badge> : <Badge>Спільний</Badge>}</td>
                  <td className={tdClass}>{s.active ? <Badge tone="good">Активна</Badge> : <Badge>Вимкнена</Badge>}</td>
                  <td className={`${tdClass} text-right`}>
                    <MiniButton onClick={() => setEditing({ service: s, isNew: false })}>Редагувати</MiniButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </DataState>
      {editing ? (
        <ServiceDialog
          initial={editing.service}
          isNew={editing.isNew}
          existingCodes={(services.data ?? []).map((s) => s.service_code)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            services.reload();
          }}
        />
      ) : null}
    </>
  );
}

function ServiceDialog({
  initial,
  isNew,
  existingCodes,
  onClose,
  onSaved,
}: {
  initial: Service;
  isNew: boolean;
  existingCodes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ ...initial, included_text: initial.included_text ?? "", sort: String(initial.sort) });
  const [errors, setErrors] = useState<Partial<Record<"service_code" | "name" | "unit" | "sort" | "tiered", string>>>({});
  const { busy, error, run } = useAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const code = form.service_code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(code)) next.service_code = "Лише великі латинські літери, цифри та «_», напр. IMPLANT_INSTALL.";
    else if (isNew && existingCodes.includes(code)) next.service_code = "Послуга з таким кодом уже є.";
    if (!form.name.trim()) next.name = "Вкажіть назву.";
    if (!form.unit.trim()) next.unit = "Вкажіть одиницю, напр. «за імплант».";
    if (form.tiered && !["implant", "crown", "arch_final"].includes(form.role)) {
      next.tiered = "Рівні мають лише імплант, коронка та постійна конструкція.";
    }
    const sort = parseDecimal(form.sort);
    if (sort === null || Number.isNaN(sort)) next.sort = "Число.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const ok = await run(
      () =>
        saveService(
          {
            service_code: code,
            name: form.name.trim(),
            role: form.role,
            unit: form.unit.trim(),
            tiered: form.tiered,
            included_text: form.included_text.trim() || null,
            active: form.active,
            sort: sort as number,
          },
          reason,
        ),
      describeError,
    );
    if (ok) onSaved();
  }

  return (
    <Modal title={isNew ? "Нова послуга" : `Послуга ${initial.service_code}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <TextField
          label="service_code"
          required
          value={form.service_code}
          disabled={!isNew}
          error={errors.service_code}
          hint={isNew ? "Незмінний після створення" : "Незмінний"}
          onChange={(e) => set("service_code", e.target.value)}
        />
        <TextField label="Назва" required value={form.name} error={errors.name} onChange={(e) => set("name", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Роль у формулі" value={form.role} onChange={(e) => set("role", e.target.value as ServiceRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </SelectField>
          <TextField label="Одиниця" required value={form.unit} error={errors.unit} placeholder="за імплант" onChange={(e) => set("unit", e.target.value)} />
        </div>
        <TextAreaField
          label="Еталонний склад"
          value={form.included_text}
          hint="Що саме входить у ціну. Порівнюються лише пропозиції з однаковим складом."
          onChange={(e) => set("included_text", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Порядок (sort)" inputMode="numeric" value={form.sort} error={errors.sort} onChange={(e) => set("sort", e.target.value)} />
          <div className="space-y-2 pt-6">
            <CheckboxField label="Має рівні" hint="Мінімальний / Класичний / Преміальний" checked={form.tiered} onChange={(e) => set("tiered", e.target.checked)} />
            {errors.tiered ? <p role="alert" className="text-xs font-bold text-bad">{errors.tiered}</p> : null}
            <CheckboxField label="Активна" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
          </div>
        </div>
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
