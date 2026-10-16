"use client";

import { useState, type FormEvent } from "react";
import { listServices, saveService, type Service } from "../api";
import { ROLES, ROLE_LABEL, TIER_SOURCE_LABEL, describeError, parseDecimal } from "../helpers";
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
import type { ServiceRole, TierSource } from "@/lib/contracts";

const blank: Service = {
  service_code: "",
  name: "",
  category: "",
  role: "implant",
  unit: "",
  tiered: false,
  tier_source: "common",
  additional: false,
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
        description="Каталог відповідає шаблону клініки (аркуш «Довідник кодів»). Формули калькулятора посилаються лише на service_code та рівень; service_code не можна змінити після створення. «Додаткові» послуги показуються окремо й ніколи не входять у загальну суму."
        actions={<MiniButton tone="brand" onClick={() => setEditing({ service: blank, isNew: true })}>+ Послуга</MiniButton>}
      />
      <DataState loading={services.loading} error={services.error} onRetry={services.reload} empty={services.data?.length === 0} emptyText="Каталог порожній.">
        <TableWrap>
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>service_code</th>
                <th className={thClass}>Назва</th>
                <th className={thClass}>Категорія</th>
                <th className={thClass}>Роль у формулі</th>
                <th className={thClass}>Одиниця</th>
                <th className={thClass}>Рівні (від чого залежать)</th>
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
                  <td className={tdClass}>{s.category ?? "—"}</td>
                  <td className={tdClass}>
                    {ROLE_LABEL[s.role] ?? s.role}
                    {s.additional ? <div className="mt-1"><Badge tone="warn">додаткова, не в total</Badge></div> : null}
                  </td>
                  <td className={tdClass}>{s.unit}</td>
                  <td className={tdClass}>{s.tiered ? <Badge tone="brand">{TIER_SOURCE_LABEL[s.tier_source ?? "implant_tier"]}</Badge> : <Badge>Спільний</Badge>}</td>
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
  const [form, setForm] = useState({
    ...initial,
    category: initial.category ?? "",
    tier_source: (initial.tier_source ?? (initial.tiered ? "implant_tier" : "common")) as TierSource,
    additional: initial.additional ?? false,
    included_text: initial.included_text ?? "",
    sort: String(initial.sort),
  });
  const [errors, setErrors] = useState<Partial<Record<"service_code" | "name" | "unit" | "sort", string>>>({});
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
            category: form.category.trim() || null,
            role: form.role,
            unit: form.unit.trim(),
            tiered: form.tier_source !== "common",
            tier_source: form.tier_source,
            additional: form.additional,
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
        <TextField label="Категорія" value={form.category} hint="Як у шаблоні: Імплантація, Компоненти, Видалення…" onChange={(e) => set("category", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Роль у формулі" value={form.role} onChange={(e) => set("role", e.target.value as ServiceRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </SelectField>
          <TextField label="Одиниця" required value={form.unit} error={errors.unit} placeholder="за імплант" onChange={(e) => set("unit", e.target.value)} />
        </div>
        <SelectField
          label="Рівні (tier_source)"
          value={form.tier_source}
          hint="Мінімальний / Класичний / Преміальний залежать від рівня імпланта або коронки/конструкції; «Спільний» — без рівнів"
          onChange={(e) => set("tier_source", e.target.value as TierSource)}
        >
          {(Object.keys(TIER_SOURCE_LABEL) as TierSource[]).map((t) => (
            <option key={t} value={t}>{TIER_SOURCE_LABEL[t]}</option>
          ))}
        </SelectField>
        <TextAreaField
          label="Еталонний склад"
          value={form.included_text}
          hint="Що саме входить у ціну. Порівнюються лише пропозиції з однаковим складом."
          onChange={(e) => set("included_text", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Порядок (sort)" inputMode="numeric" value={form.sort} error={errors.sort} onChange={(e) => set("sort", e.target.value)} />
          <div className="space-y-2 pt-6">
            <CheckboxField label="Додаткова послуга" hint="Показується в «Що може знадобитися додатково», не входить у total" checked={form.additional} onChange={(e) => set("additional", e.target.checked)} />
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
