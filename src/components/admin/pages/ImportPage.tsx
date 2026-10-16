"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { Card, SectionTitle } from "@/components/ui/Card";
import type { ImportReport } from "@/lib/contracts";
import { importClinicPrices, listCities, listClinics, listImportBatches, listRegions, listServices, type Clinic } from "../api";
import { TEMPLATE_FILE_NAME, norm, templateUrl } from "../excel/columns";
import { clientRejected, matchCities, parseTemplateFile, toImportPayload, type ParsedTemplate } from "../excel/parse";
import { CURRENCIES, TIER_LABEL, describeError, formatDateTime, formatPlain } from "../helpers";
import { useAsync } from "../hooks";
import { buttonClass } from "@/components/ui/Button";
import { Badge, Button, DataState, MiniButton, Notice, PageHeader, SelectField, TableWrap, tdClass, thClass, useAction } from "../ui";

export default function ImportPage() {
  const cities = useAsync(listCities, []);
  const services = useAsync(listServices, []);
  const regions = useAsync(listRegions, []);
  const clinics = useAsync(() => listClinics({}), []);
  const batches = useAsync(listImportBatches, []);

  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedTemplate | null>(null);
  const [cityId, setCityId] = useState("");
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [clinicId, setClinicId] = useState(""); // "" = backend reuses by city + name, else creates a draft
  const [report, setReport] = useState<ImportReport | null>(null);
  const [rejected, setRejected] = useState<Array<{ row_number: number; message: string }>>([]);
  const [rowNames, setRowNames] = useState<Record<number, string>>({});
  const [clientSkipped, setClientSkipped] = useState<number[]>([]);
  const reading = useAction();
  const sending = useAction();

  const clinicsInCity = useMemo(() => (clinics.data ?? []).filter((c) => c.city_id === cityId), [clinics.data, cityId]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReport(null);
    setRejected([]);
    setParsed(null);
    setFileName(file.name);
    const result = await reading.run(
      () => parseTemplateFile(file, { services: services.data ?? [], currencies: CURRENCIES }),
      (err) => `Не вдалося прочитати файл як .xlsx: ${describeError(err)}`,
    );
    if (!result) return;
    setParsed(result);
    const candidates = matchCities(result.card.city_name, cities.data ?? [], { name: result.card.region, regions: regions.data ?? [] });
    setCandidateIds(candidates.map((c) => c.id));
    const city = candidates.length === 1 ? candidates[0] : undefined; // ambiguous or unknown → the admin picks
    setCityId(city?.id ?? "");
    const existing = city
      ? (clinics.data ?? []).find((c) => c.city_id === city.id && norm(c.name) === norm(result.card.name))
      : undefined;
    setClinicId(existing?.id ?? "");
  }

  const okRows = parsed?.rows.filter((r) => r.errors.length === 0) ?? [];
  const badRows = parsed?.rows.filter((r) => r.errors.length > 0) ?? [];
  const canSend =
    Boolean(parsed) && parsed!.fileErrors.length === 0 && parsed!.cardErrors.length === 0 && Boolean(cityId) && okRows.length > 0;

  async function send() {
    if (!parsed || !canSend) return;
    const payload = toImportPayload(parsed, { fileName, cityId, clinicId: clinicId || null });
    const res = await sending.run(() => importClinicPrices(payload), describeError);
    if (res) {
      setRowNames(Object.fromEntries(parsed.rows.map((r) => [r.row.row_number, r.row.service_name ?? r.row.service_code ?? ""])));
      setClientSkipped(parsed.skippedEmpty);
      setReport(res);
      setRejected(clientRejected(parsed));
      setParsed(null);
      batches.reload();
      clinics.reload();
    }
  }

  return (
    <>
      <PageHeader
        title="Імпорт Excel"
        description="Клініка заповнює стандартний шаблон; імпорт створює ціни зі статусом «На перевірці». До підтвердження модератором вони не впливають на калькулятор."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>1. Шаблон «DENVA шаблон цін клініки»</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Файл власника без змін: аркуш «Прайс клініки» (картка клініки, рядки послуг із кодами й рівнями) та «Інструкція». Клініка
            заповнює лише ціни та склад; порожні рядки пропускаються.
          </p>
          <div className="mt-4">
            <a href={templateUrl()} download={TEMPLATE_FILE_NAME} className={buttonClass("primary", "min-h-10 no-underline")}>
              Завантажити шаблон
            </a>
          </div>
        </Card>

        <Card>
          <SectionTitle>2. Завантажити заповнений файл</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Підтримується формат .xlsx. Файл спершу перевіряється в браузері, потім надсилається на імпорт.
          </p>
          <label className="mt-4 block">
            <span className="mb-1 block text-[13px] font-bold text-ink-soft">Файл .xlsx</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void onFile(e)}
              disabled={reading.busy || sending.busy}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-paper file:px-3 file:py-2 file:text-[13px] file:font-bold"
            />
          </label>
          {reading.busy ? <p className="mt-3 text-sm text-muted" role="status">Читання файлу…</p> : null}
          {reading.error ? (
            <div className="mt-3">
              <Notice tone="bad" role="alert">{reading.error}</Notice>
            </div>
          ) : null}
        </Card>
      </div>

      {parsed ? (
        <section className="mt-6 space-y-4" aria-label="Попередній перегляд імпорту">
          <h2 className="text-[17px] font-extrabold">Попередній перегляд: {fileName}</h2>

          {parsed.fileErrors.map((m) => (
            <Notice key={m} tone="bad" role="alert">{m}</Notice>
          ))}

          <Card>
            <SectionTitle>Картка клініки</SectionTitle>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Назва</dt><dd className="font-bold">{parsed.card.name || "—"}</dd></div>
              <div><dt className="text-muted">Місто у файлі</dt><dd className="font-bold">{parsed.card.city_name || "—"}</dd></div>
              <div><dt className="text-muted">Область</dt><dd>{parsed.card.region ?? "—"}</dd></div>
              <div><dt className="text-muted">Адреса</dt><dd>{parsed.card.address ?? "—"}</dd></div>
              <div><dt className="text-muted">Контактна особа</dt><dd>{parsed.card.contact_person ?? "—"}</dd></div>
              <div><dt className="text-muted">Телефон або email</dt><dd>{parsed.card.contacts ?? "—"}</dd></div>
              <div><dt className="text-muted">Дата чинності</dt><dd>{parsed.card.valid_from ?? "—"}</dd></div>
              <div><dt className="text-muted">Dental Tender</dt><dd>{parsed.card.dental_tender ? "Так" : "Ні"}</dd></div>
              <div><dt className="text-muted">Публічний профіль</dt><dd>{parsed.card.public_profile_consent ? "Згода є" : "Немає згоди"}</dd></div>
              <div><dt className="text-muted">Достовірність підтверджено</dt><dd>{parsed.card.data_confirmed ? "Так" : "Ні"}</dd></div>
            </dl>
            <div className="mt-3 space-y-2">
              {parsed.cardErrors.map((m) => (
                <Notice key={m} tone="bad" role="alert">{m}</Notice>
              ))}
              {parsed.cardWarnings.map((m) => (
                <Notice key={m} tone="warn">{m}</Notice>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Місто у системі"
                required
                value={cityId}
                error={
                  !cityId
                    ? candidateIds.length > 1
                      ? "У довіднику кілька міст із такою назвою — оберіть потрібне."
                      : "Назву з файлу не вдалося зіставити з довідником — оберіть місто вручну."
                    : null
                }
                onChange={(e) => {
                  setCityId(e.target.value);
                  setClinicId("");
                }}
              >
                <option value="">— оберіть —</option>
                {(candidateIds.length > 1 ? (cities.data ?? []).filter((c) => candidateIds.includes(c.id)) : (cities.data ?? [])).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {regions.data?.find((r) => r.id === c.region_id) ? ` — ${regions.data.find((r) => r.id === c.region_id)!.name}` : ""}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Клініка"
                value={clinicId}
                hint="Додайте ціни до наявної клініки або дозвольте базі знайти її за містом і назвою"
                onChange={(e) => setClinicId(e.target.value)}
                disabled={!cityId}
              >
                <option value="">Знайти за назвою або створити чернетку «{parsed.card.name}»</option>
                {clinicsInCity.map((c: Clinic) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </SelectField>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge tone="good">Готово до імпорту: {okRows.length}</Badge>
            <Badge tone="neutral">Без ціни (пропущено): {parsed.skippedEmpty.length}</Badge>
            <Badge tone={badRows.length ? "bad" : "neutral"}>З помилками (не надсилаються): {badRows.length}</Badge>
            <Badge tone="warn">
              З попередженнями: {parsed.rows.filter((r) => r.warnings.length > 0 && r.errors.length === 0).length}
            </Badge>
          </div>

          <TableWrap>
            <table className="w-full min-w-[960px] border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>Рядок</th>
                  <th className={thClass}>Послуга</th>
                  <th className={thClass}>Ціна</th>
                  <th className={thClass}>service_code / рівень</th>
                  <th className={thClass}>Склад</th>
                  <th className={thClass}>Перевірка</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((r) => (
                  <tr key={r.row.row_number} className={r.errors.length ? "bg-bad-soft/40" : undefined}>
                    <td className={`${tdClass} tabular text-muted`}>{r.row.row_number}</td>
                    <td className={tdClass}>
                      <span className="font-bold">{r.row.service_name || "—"}</span>
                      {r.row.category ? <div className="text-xs text-muted">{r.row.category}{r.row.unit ? ` · ${r.row.unit}` : ""}</div> : null}
                    </td>
                    <td className={`${tdClass} tabular`}>
                      {formatPlain(r.row.price_from)}
                      {r.row.price_to !== null ? `–${formatPlain(r.row.price_to)}` : ""} {r.row.currency}
                    </td>
                    <td className={tdClass}>
                      {r.row.service_code ? (
                        <span className="font-mono text-xs">{r.row.service_code}</span>
                      ) : (
                        <span className="text-muted">без коду</span>
                      )}
                      {r.row.tier ? <div className="text-xs text-muted">{TIER_LABEL[r.row.tier]} ({r.row.tier})</div> : null}
                    </td>
                    <td className={`${tdClass} max-w-[16rem] text-xs`}>
                      {r.row.included_text ?? <span className="text-muted">—</span>}
                    </td>
                    <td className={tdClass}>
                      {r.errors.map((m) => (
                        <p key={m} className="text-xs font-bold text-bad">✕ {m}</p>
                      ))}
                      {r.warnings.map((m) => (
                        <p key={m} className="text-xs text-warn">⚠ {m}</p>
                      ))}
                      {r.errors.length === 0 && r.warnings.length === 0 ? <span className="text-xs text-good">✓</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          {sending.error ? <Notice tone="bad" role="alert">{sending.error}</Notice> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void send()} disabled={!canSend || sending.busy} className="min-h-10">
              {sending.busy ? "Імпорт…" : `Імпортувати ${okRows.length} рядків`}
            </Button>
            <MiniButton onClick={() => setParsed(null)} disabled={sending.busy}>Скасувати</MiniButton>
            {!canSend && parsed.fileErrors.length === 0 ? (
              <span className="text-sm text-muted">Виправте картку клініки та оберіть місто.</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {report ? (
        <section className="mt-6" aria-label="Протокол імпорту">
          <ReportView report={report} rejected={rejected} clientSkipped={clientSkipped} nameOf={(n) => rowNames[n]} />
        </section>
      ) : null}

      <h2 className="mb-2 mt-8 text-[17px] font-extrabold">Останні імпорти</h2>
      <DataState
        loading={batches.loading}
        error={batches.error}
        onRetry={batches.reload}
        empty={batches.data?.length === 0}
        emptyText="Імпортів ще не було."
      >
        <TableWrap>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={thClass}>Дата</th>
                <th className={thClass}>Файл</th>
                <th className={thClass}>Рядків</th>
                <th className={thClass}>Прийнято</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {batches.data?.map((b) => {
                const rep = b.report as Partial<ImportReport> | null | undefined;
                return (
                  <tr key={b.id}>
                    <td className={tdClass}>{formatDateTime(b.created_at)}</td>
                    <td className={tdClass}>{b.file_name ?? "—"}</td>
                    <td className={`${tdClass} tabular`}>{b.row_count ?? "—"}</td>
                    <td className={`${tdClass} tabular`}>{rep?.accepted?.length ?? "—"}</td>
                    <td className={`${tdClass} text-right`}>
                      <Link
                        href={`/admin/prices/?batch=${encodeURIComponent(b.id)}`}
                        className="text-[13px] font-bold text-brand no-underline hover:underline"
                      >
                        Модерація →
                      </Link>
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

function ReportView({
  report,
  rejected,
  clientSkipped,
  nameOf,
}: {
  report: ImportReport;
  rejected: Array<{ row_number: number; message: string }>;
  clientSkipped: number[];
  nameOf: (n: number) => string | undefined;
}) {
  const skipped = [...new Set([...clientSkipped, ...(report.skipped_empty ?? [])])].sort((a, b) => a - b);
  const errors = [...rejected, ...report.errors].sort((a, b) => a.row_number - b.row_number);
  const list = (rows: number[]) =>
    rows.length ? rows.map((n) => (nameOf(n) ? `${n} (${nameOf(n)})` : String(n))).join(", ") : "—";
  return (
    <Card>
      <SectionTitle>Протокол імпорту</SectionTitle>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label="Прийняті рядки" value={report.accepted.length} tone="good" />
        <Stat label="Помилки" value={errors.length} tone="bad" />
        <Stat label="Без ціни (пропущено)" value={skipped.length} tone="brand" />
        <Stat label="Дублікати" value={report.duplicates.length} tone="warn" />
        <Stat label="Невідомі service_code" value={report.unknown_service_code.length} tone="warn" />
        <Stat label="Очікують модерації" value={report.pending_moderation.length} tone="brand" />
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div><dt className="font-bold">Прийняті (рядки)</dt><dd className="text-ink-soft">{list(report.accepted)}</dd></div>
        <div><dt className="font-bold">Без ціни (skipped_empty)</dt><dd className="text-ink-soft">{skipped.length ? skipped.join(", ") : "—"}</dd></div>
        <div><dt className="font-bold">Дублікати</dt><dd className="text-ink-soft">{list(report.duplicates)}</dd></div>
        <div><dt className="font-bold">Невідомі service_code</dt><dd className="text-ink-soft">{list(report.unknown_service_code)}</dd></div>
        <div>
          <dt className="font-bold">Помилки</dt>
          <dd>
            {errors.length === 0 ? (
              <span className="text-ink-soft">—</span>
            ) : (
              <ul className="list-disc pl-5 text-bad">
                {errors.map((e, i) => (
                  <li key={`${e.row_number}-${i}`}>Рядок {e.row_number}: {e.message}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/prices/?batch=${encodeURIComponent(report.batch_id)}`}
          className="inline-flex min-h-10 items-center rounded-full bg-brand px-5 text-[15px] font-bold text-white no-underline hover:bg-brand-dark"
        >
          Перейти до модерації
        </Link>
        <span className="text-sm text-muted">Жоден рядок не впливає на калькулятор, доки його не підтверджено.</span>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "warn" | "brand" }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-extrabold">{value}</p>
      <Badge tone={value === 0 && tone !== "good" ? "neutral" : tone}>{value === 0 ? "немає" : "є"}</Badge>
    </div>
  );
}
