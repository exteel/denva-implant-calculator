"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { listCities, listClinics, saveClinic, setClinicStatus, verifyClinic, type Clinic } from "../api";
import { CLINIC_STATUS_LABEL, contactsToText, describeError, formatDate } from "../helpers";
import { useAsync } from "../hooks";
import {
  Badge,
  Button,
  CheckboxField,
  ConfirmDialog,
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
import type { ClinicStatus } from "@/lib/contracts";

const statusTone = { draft: "neutral", active: "good", excluded: "bad" } as const;

type Pending = { clinic: Clinic; action: "verify" | "activate" | "exclude" | "draft" };

export default function ClinicsPage() {
  const [cityId, setCityId] = useState("");
  const [status, setStatus] = useState<ClinicStatus | "">("");
  const [search, setSearch] = useState("");
  const cities = useAsync(listCities, []);
  const clinics = useAsync(() => listClinics({ cityId, status, search }), [cityId, status, search]);
  const [editing, setEditing] = useState<Partial<Clinic> | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const act = useAction();
  const cityName = (id: string) => cities.data?.find((c) => c.id === id)?.name ?? "—";

  async function confirm(reason: string) {
    if (!pending) return;
    const { clinic, action } = pending;
    const ok = await act.run(async () => {
      if (action === "verify") await verifyClinic(clinic.id, reason);
      else await setClinicStatus(clinic.id, action === "activate" ? "active" : action === "exclude" ? "excluded" : "draft", reason);
      return true;
    }, describeError);
    if (ok) {
      setPending(null);
      clinics.reload();
    }
  }

  const dialogCopy: Record<Pending["action"], { title: string; message: string; label: string; danger?: boolean }> = {
    verify: { title: "Підтвердити перевірку клініки", message: "Буде записано поточну дату як дату останньої перевірки.", label: "Підтвердити" },
    activate: { title: "Активувати клініку", message: "Підтверджені ціни клініки потраплять у вибірку міста та запустять перерахунок.", label: "Активувати" },
    exclude: {
      title: "Виключити клініку з агрегації",
      message: "Клініку та її ціни буде виключено з наступного агрегату. Історія й записи не видаляються.",
      label: "Виключити",
      danger: true,
    },
    draft: { title: "Повернути в чернетку", message: "Клініка перестане впливати на агрегати до повторної активації.", label: "Повернути" },
  };

  return (
    <>
      <PageHeader
        title="Клініки"
        description="Деактивація ніколи не видаляє клініку чи її ціни — лише виключає їх з наступного агрегату."
        actions={<MiniButton tone="brand" onClick={() => setEditing({ status: "draft", name: "", contacts: "" })}>+ Клініка</MiniButton>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SelectField label="Місто" value={cityId} onChange={(e) => setCityId(e.target.value)}>
          <option value="">Усі міста</option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectField>
        <SelectField label="Статус" value={status} onChange={(e) => setStatus(e.target.value as ClinicStatus | "")}>
          <option value="">Усі</option>
          {(Object.keys(CLINIC_STATUS_LABEL) as ClinicStatus[]).map((s) => (
            <option key={s} value={s}>{CLINIC_STATUS_LABEL[s]}</option>
          ))}
        </SelectField>
        <TextField label="Пошук за назвою" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <DataState loading={clinics.loading} error={clinics.error} onRetry={clinics.reload} empty={clinics.data?.length === 0} emptyText="Клінік за цими фільтрами немає.">
        <TableWrap>
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Клініка</th>
                <th className={thClass}>Місто</th>
                <th className={thClass}>Мережа</th>
                <th className={thClass}>Статус</th>
                <th className={thClass}>Перевірено</th>
                <th className={thClass}>Дії</th>
              </tr>
            </thead>
            <tbody>
              {clinics.data?.map((c) => (
                <tr key={c.id}>
                  <td className={tdClass}>
                    <span className="font-bold">{c.name}</span> {c.is_demo ? <Badge tone="warn">демо</Badge> : null}
                    <div className="text-xs text-muted">{[c.contact_person, contactsToText(c.contacts)].filter(Boolean).join(" · ")}</div>
                    {c.address || c.region ? <div className="text-xs text-muted">{[c.region, c.address].filter(Boolean).join(", ")}</div> : null}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.dental_tender ? <Badge tone="brand">Dental Tender</Badge> : null}
                      {c.public_profile_consent ? <Badge tone="good">Публічний профіль</Badge> : null}
                      {c.data_confirmed ? <Badge tone="good" title="Клініка підтвердила достовірність цін">Достовірність ✓</Badge> : <Badge tone="neutral">Достовірність не підтверджена</Badge>}
                    </div>
                  </td>
                  <td className={tdClass}>{cityName(c.city_id)}</td>
                  <td className={tdClass}>{c.network_id ?? "—"}</td>
                  <td className={tdClass}><Badge tone={statusTone[c.status]}>{CLINIC_STATUS_LABEL[c.status]}</Badge></td>
                  <td className={tdClass}>{formatDate(c.verified_at)}</td>
                  <td className={tdClass}>
                    <div className="flex flex-wrap gap-1">
                      <MiniButton onClick={() => setEditing(c)}>Редагувати</MiniButton>
                      <MiniButton onClick={() => setPending({ clinic: c, action: "verify" })}>Перевірено</MiniButton>
                      {c.status !== "active" ? (
                        <MiniButton tone="good" onClick={() => setPending({ clinic: c, action: "activate" })}>Активувати</MiniButton>
                      ) : null}
                      {c.status !== "excluded" ? (
                        <MiniButton tone="bad" onClick={() => setPending({ clinic: c, action: "exclude" })}>Виключити</MiniButton>
                      ) : null}
                      <Link
                        href={`/admin/prices/?clinic=${encodeURIComponent(c.id)}`}
                        className="inline-flex min-h-9 items-center rounded-lg px-2 text-[13px] font-bold text-brand no-underline hover:bg-brand-soft"
                      >
                        Прайс →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </DataState>

      {editing ? (
        <ClinicDialog
          initial={editing}
          cities={cities.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            clinics.reload();
          }}
        />
      ) : null}
      {pending ? (
        <ConfirmDialog
          title={dialogCopy[pending.action].title}
          message={
            <>
              <p className="font-bold text-ink">{pending.clinic.name}</p>
              <p className="mt-1">{dialogCopy[pending.action].message}</p>
            </>
          }
          confirmLabel={dialogCopy[pending.action].label}
          danger={dialogCopy[pending.action].danger}
          askReason
          busy={act.busy}
          error={act.error}
          onConfirm={(reason) => void confirm(reason)}
          onCancel={() => {
            setPending(null);
            act.setError(null);
          }}
        />
      ) : null}
    </>
  );
}

function ClinicDialog({
  initial,
  cities,
  onClose,
  onSaved,
}: {
  initial: Partial<Clinic>;
  cities: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [cityId, setCityId] = useState(initial.city_id ?? "");
  const [networkId, setNetworkId] = useState(initial.network_id ?? "");
  const [contacts, setContacts] = useState(contactsToText(initial.contacts));
  const [region, setRegion] = useState(initial.region ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [contactPerson, setContactPerson] = useState(initial.contact_person ?? "");
  const [dentalTender, setDentalTender] = useState(initial.dental_tender ?? false);
  const [publicProfile, setPublicProfile] = useState(initial.public_profile_consent ?? false);
  const [dataConfirmed, setDataConfirmed] = useState(initial.data_confirmed ?? false);
  const [status, setStatus] = useState<ClinicStatus>(initial.status ?? "draft");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ name?: string; city?: string }>({});
  const { busy, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Вкажіть назву клініки.";
    if (!cityId) next.city = "Оберіть місто.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const ok = await run(
      () =>
        saveClinic({
          id: initial.id,
          name: name.trim(),
          city_id: cityId,
          network_id: networkId.trim() || null,
          contacts: contacts.trim() || null,
          region: region.trim() || null,
          address: address.trim() || null,
          contact_person: contactPerson.trim() || null,
          dental_tender: dentalTender,
          public_profile_consent: publicProfile,
          data_confirmed: dataConfirmed,
          status,
        }, reason),
      describeError,
    );
    if (ok) onSaved();
  }

  return (
    <Modal title={initial.id ? "Редагувати клініку" : "Нова клініка"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <TextField label="Назва" required value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
        <SelectField label="Місто" required value={cityId} error={errors.city} onChange={(e) => setCityId(e.target.value)}>
          <option value="">— оберіть —</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </SelectField>
        <TextField
          label="Мережа (network_id)"
          value={networkId}
          hint="Філії однієї мережі з однаковим прайсом у місті рахуються як одне джерело. Вкажіть однаковий ідентифікатор."
          onChange={(e) => setNetworkId(e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Область" value={region} onChange={(e) => setRegion(e.target.value)} />
          <TextField label="Контактна особа" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        </div>
        <TextField label="Адреса" value={address} onChange={(e) => setAddress(e.target.value)} />
        <TextAreaField label="Телефон або email" value={contacts} onChange={(e) => setContacts(e.target.value)} hint="Внутрішня інформація; пацієнту не показується" />
        <fieldset className="space-y-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-[13px] font-bold text-ink-soft">Згоди клініки (з шаблону)</legend>
          <CheckboxField label="Участь у Dental Tender" hint="Клініка погодилась отримувати персональні запити пацієнтів" checked={dentalTender} onChange={(e) => setDentalTender(e.target.checked)} />
          <CheckboxField label="Згода на публічний профіль" hint="Публікація сторінки клініки; назви клінік у калькуляторі не показуються" checked={publicProfile} onChange={(e) => setPublicProfile(e.target.checked)} />
          <CheckboxField label="Підтверджено достовірність цін" hint="Клініка підтвердила, що ціни актуальні" checked={dataConfirmed} onChange={(e) => setDataConfirmed(e.target.checked)} />
        </fieldset>
        <SelectField label="Статус" value={status} onChange={(e) => setStatus(e.target.value as ClinicStatus)}>
          {(Object.keys(CLINIC_STATUS_LABEL) as ClinicStatus[]).map((s) => (
            <option key={s} value={s}>{CLINIC_STATUS_LABEL[s]}</option>
          ))}
        </SelectField>
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
