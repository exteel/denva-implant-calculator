"use client";

import { useState, type FormEvent } from "react";
import { listCities, listRegions, saveCity, saveRegion, type City, type Region } from "../api";
import { SEO_STATUS_LABEL, CURRENCIES, describeError, parseAliases, parseDecimal, slugify } from "../helpers";
import { useAsync } from "../hooks";
import { CityPageDialog } from "../CityPageDialog";
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

interface CityForm {
  id: string;
  isNew: boolean;
  name: string;
  region_id: string;
  currency: string;
  active: boolean;
  aliases: string;
  min_clinics: string;
}

const emptyCity: CityForm = { id: "", isNew: true, name: "", region_id: "", currency: "UAH", active: true, aliases: "", min_clinics: "" };

export default function CitiesPage() {
  const regions = useAsync(listRegions, []);
  const cities = useAsync(listCities, []);
  const [cityForm, setCityForm] = useState<CityForm | null>(null);
  const [pageCity, setPageCity] = useState<City | null>(null);
  const [regionForm, setRegionForm] = useState<{ region: Region; isNew: boolean } | null>(null);
  const regionName = (id: string | null) => regions.data?.find((r) => r.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Міста та регіони"
        description="Регіон слугує регіональним fallback: якщо у місті немає власної вибірки чи орієнтира, калькулятор покаже «середню ціну регіону»."
        actions={
          <>
            <MiniButton onClick={() => setRegionForm({ region: { id: "", name: "", active: true }, isNew: true })}>+ Регіон</MiniButton>
            <MiniButton tone="brand" onClick={() => setCityForm(emptyCity)}>+ Місто</MiniButton>
          </>
        }
      />

      <h2 className="mb-2 text-[17px] font-extrabold">Міста</h2>
      <DataState loading={cities.loading} error={cities.error} onRetry={cities.reload} empty={cities.data?.length === 0} emptyText="Міст ще немає. Створіть перше.">
        <TableWrap>
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Місто</th>
                <th className={thClass}>Регіон (fallback)</th>
                <th className={thClass}>Валюта</th>
                <th className={thClass}>Поріг вибірки</th>
                <th className={thClass}>Slug</th>
                <th className={thClass}>SEO-статус</th>
                <th className={thClass}>Стан</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {cities.data?.map((c) => (
                <tr key={c.id}>
                  <td className={`${tdClass} font-bold`}>{c.name}</td>
                  <td className={tdClass}>{regionName(c.region_id)}</td>
                  <td className={tdClass}>{c.currency}</td>
                  <td className={`${tdClass} tabular`}>{c.min_clinics ?? "глобальний"}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{c.slug ?? c.id}</td>
                  <td className={tdClass}>
                    <Badge tone={c.seo_status === "published" ? "good" : c.seo_status === "review" ? "brand" : c.seo_status === "stale" || c.seo_status === "removed" ? "warn" : "neutral"}>
                      {SEO_STATUS_LABEL[c.seo_status ?? "draft"]}
                    </Badge>
                  </td>
                  <td className={tdClass}>{c.active ? <Badge tone="good">Активне</Badge> : <Badge>Вимкнене</Badge>}</td>
                  <td className={`${tdClass} text-right`}>
                    <MiniButton onClick={() => setPageCity(c)}>Сторінка</MiniButton>{" "}
                    <MiniButton
                      onClick={() =>
                        setCityForm({
                          id: c.id,
                          isNew: false,
                          name: c.name,
                          region_id: c.region_id ?? "",
                          currency: c.currency,
                          active: c.active,
                          aliases: (c.aliases ?? []).join(", "),
                          min_clinics: c.min_clinics === null ? "" : String(c.min_clinics),
                        })
                      }
                    >
                      Редагувати
                    </MiniButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </DataState>

      <h2 className="mb-2 mt-8 text-[17px] font-extrabold">Регіони</h2>
      <DataState loading={regions.loading} error={regions.error} onRetry={regions.reload} empty={regions.data?.length === 0} emptyText="Регіонів ще немає.">
        <TableWrap>
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Регіон</th>
                <th className={thClass}>Міст</th>
                <th className={thClass}>Стан</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {regions.data?.map((r) => (
                <tr key={r.id}>
                  <td className={`${tdClass} font-bold`}>{r.name}</td>
                  <td className={`${tdClass} tabular`}>{cities.data?.filter((c) => c.region_id === r.id).length ?? "—"}</td>
                  <td className={tdClass}>{r.active ? <Badge tone="good">Активний</Badge> : <Badge>Вимкнений</Badge>}</td>
                  <td className={`${tdClass} text-right`}>
                    <MiniButton onClick={() => setRegionForm({ region: r, isNew: false })}>Редагувати</MiniButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </DataState>

      {cityForm ? (
        <CityDialog
          initial={cityForm}
          regions={regions.data ?? []}
          existingIds={(cities.data ?? []).map((x) => x.id)}
          onClose={() => setCityForm(null)}
          onSaved={() => {
            setCityForm(null);
            cities.reload();
          }}
        />
      ) : null}
      {pageCity ? (
        <CityPageDialog
          city={pageCity}
          onClose={() => setPageCity(null)}
          onSaved={() => {
            setPageCity(null);
            cities.reload();
          }}
        />
      ) : null}
      {regionForm ? (
        <RegionDialog
          initial={regionForm.region}
          isNew={regionForm.isNew}
          existingIds={(regions.data ?? []).map((x) => x.id)}
          onClose={() => setRegionForm(null)}
          onSaved={() => {
            setRegionForm(null);
            regions.reload();
          }}
        />
      ) : null}
    </>
  );
}

function CityDialog({
  initial,
  regions,
  existingIds,
  onClose,
  onSaved,
}: {
  initial: CityForm;
  regions: Region[];
  existingIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof CityForm, string>>>({});
  const { busy, error, run } = useAction();
  const set = <K extends keyof CityForm>(k: K, v: CityForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = "Вкажіть назву міста.";
    const id = (form.isNew ? form.id.trim() || slugify(form.name) : form.id).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) next.id = "Ідентифікатор: латиниця, цифри та «-».";
    else if (form.isNew && existingIds.includes(id)) next.id = "Місто з таким ідентифікатором уже є.";
    if (!form.region_id) next.region_id = "Оберіть регіон: він слугує fallback для міста.";
    if (!(CURRENCIES as readonly string[]).includes(form.currency)) next.currency = "Дозволені валюти: UAH, EUR, USD.";
    const min = parseDecimal(form.min_clinics);
    if (min !== null && (Number.isNaN(min) || !Number.isInteger(min) || min < 1)) next.min_clinics = "Ціле число від 1 або порожньо.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const ok = await run(
      () =>
        saveCity(
          {
            id,
            name: form.name.trim(),
            region_id: form.region_id,
            currency: form.currency,
            active: form.active,
            aliases: parseAliases(form.aliases),
            min_clinics: min,
          },
          reason,
        ),
      describeError,
    );
    if (ok) onSaved();
  }

  return (
    <Modal title={form.isNew ? "Нове місто" : "Редагувати місто"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <TextField label="Назва" required value={form.name} error={errors.name} onChange={(e) => set("name", e.target.value)} />
        <TextField
          label="Ідентифікатор"
          value={form.id}
          disabled={!form.isNew}
          error={errors.id}
          placeholder={slugify(form.name) || "lviv"}
          hint={form.isNew ? "Латиницею; порожньо — буде створено з назви. Не змінюється після створення." : "Незмінний"}
          onChange={(e) => set("id", e.target.value)}
        />
        <SelectField label="Регіон (fallback)" required value={form.region_id} error={errors.region_id} onChange={(e) => set("region_id", e.target.value)}>
          <option value="">— оберіть —</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Валюта" required value={form.currency} error={errors.currency} onChange={(e) => set("currency", e.target.value)}>
            {CURRENCIES.map((cur) => (
              <option key={cur} value={cur}>{cur}</option>
            ))}
          </SelectField>
          <TextField
            label="Поріг вибірки"
            inputMode="numeric"
            value={form.min_clinics}
            error={errors.min_clinics}
            hint="Порожньо = глобальний поріг із налаштувань"
            onChange={(e) => set("min_clinics", e.target.value)}
          />
        </div>
        <TextAreaField
          label="Аліаси"
          value={form.aliases}
          hint="Через кому: інші написання, які шукає пацієнт"
          onChange={(e) => set("aliases", e.target.value)}
        />
        <CheckboxField label="Активне" hint="Неактивні міста не показуються в калькуляторі" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
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

function RegionDialog({
  initial,
  isNew,
  existingIds,
  onClose,
  onSaved,
}: {
  initial: Region;
  isNew: boolean;
  existingIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.id);
  const [active, setActive] = useState(initial.active);
  const [nameError, setNameError] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Вкажіть назву регіону.");
      return;
    }
    const id = (isNew ? slug.trim() || slugify(name) : initial.id).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      setNameError("Ідентифікатор: латиниця, цифри та «-».");
      return;
    }
    if (isNew && existingIds.includes(id)) {
      setNameError("Регіон з таким ідентифікатором уже є.");
      return;
    }
    setNameError(null);
    const ok = await run(() => saveRegion({ id, name: name.trim(), active }, reason), describeError);
    if (ok) onSaved();
  }

  return (
    <Modal title={isNew ? "Новий регіон" : "Редагувати регіон"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <TextField label="Назва" required value={name} error={nameError} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Ідентифікатор"
          value={slug}
          disabled={!isNew}
          placeholder={slugify(name) || "lvivska"}
          hint={isNew ? "Латиницею; порожньо — буде створено з назви. Не змінюється." : "Незмінний"}
          onChange={(e) => setSlug(e.target.value)}
        />
        <CheckboxField label="Активний" checked={active} onChange={(e) => setActive(e.target.checked)} />
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

