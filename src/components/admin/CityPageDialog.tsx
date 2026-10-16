"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { CityPageContent, SeoStatus } from "@/lib/contracts";
import { Button } from "@/components/ui/Button";
import { cityContent, getPriceMatrix, saveCityPage, type City } from "./api";
import { cleanContent, contentProblems, missingKeyPrices, normalizeContent, validateSlug } from "./cityPage";
import { SEO_STATUSES, SEO_STATUS_HELP, SEO_STATUS_LABEL, TIER_LABEL, describeError, toDateInput } from "./helpers";
import { useAsync } from "./hooks";
import { CheckboxField, MiniButton, Modal, Notice, SelectField, TextAreaField, TextField, useAction } from "./ui";

/** SEO status, slug and editorial content of /implant-calculator/{slug}/ (ТЗ §11.3). */
export function CityPageDialog({ city, onClose, onSaved }: { city: City; onClose: () => void; onSaved: () => void }) {
  const storedStatus: SeoStatus = city.seo_status ?? "draft";
  const storedSlug = city.slug ?? city.id;
  const [slug, setSlug] = useState(storedSlug);
  const [status, setStatus] = useState<SeoStatus>(storedStatus);
  const [content, setContent] = useState<CityPageContent>(() => normalizeContent(cityContent(city)));
  const [reason, setReason] = useState("");
  const [ackSlug, setAckSlug] = useState(false);
  const [ackPublish, setAckPublish] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  const wantsPublish = status === "published";
  // key prices only matter when the admin is about to publish
  const matrix = useAsync(() => (wantsPublish ? getPriceMatrix(city.id) : Promise.resolve(null)), [wantsPublish, city.id]);
  const contentIssues = useMemo(() => contentProblems(content), [content]);
  const priceIssues = useMemo(() => (matrix.data ? missingKeyPrices(matrix.data) : []), [matrix.data]);
  const publishWarnings = wantsPublish && (contentIssues.length > 0 || priceIssues.length > 0);
  const slugChangesPublished = storedStatus === "published" && slug !== storedSlug;

  const setField = <K extends keyof CityPageContent>(k: K, v: CityPageContent[K]) => setContent((c) => ({ ...c, [k]: v }));
  const setFaq = (i: number, patch: Partial<{ q: string; a: string }>) =>
    setContent((c) => ({ ...c, faq: c.faq.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validateSlug(slug);
    setSlugError(err);
    if (err) return;
    if (slugChangesPublished && !ackSlug) return;
    if (publishWarnings && !ackPublish) return;
    const cleaned = cleanContent(content);
    const contentChanged = JSON.stringify(cleaned) !== JSON.stringify(cleanContent(normalizeContent(cityContent(city))));
    const ok = await run(() => saveCityPage(city.id, { slug, seo_status: status, content: cleaned, contentChanged }, reason), describeError);
    if (ok) onSaved();
  }

  const blocked = (slugChangesPublished && !ackSlug) || (publishWarnings && !ackPublish) || (wantsPublish && matrix.loading);

  return (
    <Modal title={`Сторінка міста: ${city.name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <section className="space-y-3">
          <h3 className="font-extrabold text-ink">SEO-статус і адреса</h3>
          <TextField
            label="Slug (URL)"
            value={slug}
            error={slugError}
            hint={`Адреса сторінки: /implant-calculator/${slug || "…"}/`}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setAckSlug(false);
            }}
          />
          {storedStatus === "published" ? (
            <Notice tone="warn">
              Сторінка опублікована й може бути в індексі. Зміна slug змінить її URL: старий адрес перестане працювати (301 на GitHub Pages неможливий — з&apos;явиться з власним доменом).
              {slug !== storedSlug ? (
                <div className="mt-2">
                  <CheckboxField label="Розумію наслідки зміни slug" checked={ackSlug} onChange={(e) => setAckSlug(e.target.checked)} />
                </div>
              ) : null}
            </Notice>
          ) : null}
          <SelectField label="SEO-статус" value={status} onChange={(e) => { setStatus(e.target.value as SeoStatus); setAckPublish(false); }} hint={SEO_STATUS_HELP[status]}>
            {SEO_STATUSES.map((s) => (
              <option key={s} value={s}>{SEO_STATUS_LABEL[s]}</option>
            ))}
          </SelectField>
          <details className="rounded-lg border border-line px-3 py-2 text-sm">
            <summary className="cursor-pointer font-bold text-ink-soft">Що означає кожен статус (ТЗ §11.3)</summary>
            <dl className="mt-2 space-y-1.5">
              {SEO_STATUSES.map((s) => (
                <div key={s}>
                  <dt className="font-bold">{SEO_STATUS_LABEL[s]}</dt>
                  <dd className="text-xs text-muted">{SEO_STATUS_HELP[s]}</dd>
                </div>
              ))}
            </dl>
          </details>
          {wantsPublish && (contentIssues.length > 0 || priceIssues.length > 0 || matrix.error) ? (
            <Notice tone="warn" role="alert">
              <p className="font-bold">Перед публікацією перевірте:</p>
              {contentIssues.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {contentIssues.map((p) => (
                    <li key={p}>Контент: {p}</li>
                  ))}
                </ul>
              ) : null}
              {matrix.error ? <p className="mt-1">Не вдалося перевірити ціни: {matrix.error}</p> : null}
              {priceIssues.length > 0 ? (
                <p className="mt-1">
                  Немає опублікованих ключових цін ({priceIssues.length}):{" "}
                  {priceIssues.slice(0, 8).map((m) => `${m.service_code} · ${TIER_LABEL[m.tier]}`).join("; ")}
                  {priceIssues.length > 8 ? "…" : ""}
                </p>
              ) : null}
              <div className="mt-2">
                <CheckboxField label="Все одно опублікувати" checked={ackPublish} onChange={(e) => setAckPublish(e.target.checked)} />
              </div>
            </Notice>
          ) : null}
        </section>

        <section className="space-y-3">
          <h3 className="font-extrabold text-ink">Контент сторінки {city.content_is_demo ? <span className="text-xs font-normal text-warn">(зараз демо-текст)</span> : null}</h3>
          <p className="text-xs text-muted">Автоматичного шаблонного тексту немає: без унікального вступу, локального FAQ і рецензента місто не публікується.</p>
          <TextAreaField
            label="Вступ"
            rows={4}
            value={content.intro ?? ""}
            onChange={(e) => setField("intro", e.target.value)}
            hint="Короткий унікальний вступ про імплантацію саме в цьому місті"
          />
          <div className="space-y-2">
            <p className="text-[13px] font-bold text-ink-soft">Локальний FAQ</p>
            {content.faq.length === 0 ? <p className="text-sm text-muted">Питань ще немає.</p> : null}
            {content.faq.map((f, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                <TextField label={`Питання ${i + 1}`} value={f.q} onChange={(e) => setFaq(i, { q: e.target.value })} />
                <TextAreaField label="Відповідь" rows={3} value={f.a} onChange={(e) => setFaq(i, { a: e.target.value })} />
                <MiniButton tone="bad" onClick={() => setContent((c) => ({ ...c, faq: c.faq.filter((_, idx) => idx !== i) }))}>
                  Видалити питання
                </MiniButton>
              </div>
            ))}
            <MiniButton onClick={() => setContent((c) => ({ ...c, faq: [...c.faq, { q: "", a: "" }] }))}>+ Додати питання</MiniButton>
          </div>
          <TextAreaField
            label="Локальні нотатки про ринок"
            rows={3}
            value={content.local_notes ?? ""}
            onChange={(e) => setField("local_notes", e.target.value)}
            hint="Те, що робить сторінку справді локальною"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField label="Рецензент" value={content.reviewer_name ?? ""} onChange={(e) => setField("reviewer_name", e.target.value)} />
            <TextField label="Посилання на рецензента" type="url" value={content.reviewer_url ?? ""} onChange={(e) => setField("reviewer_url", e.target.value)} />
            <TextField label="Дата перевірки" type="date" value={toDateInput(content.reviewed_at)} onChange={(e) => setField("reviewed_at", e.target.value || null)} />
          </div>
        </section>

        <TextAreaField label="Причина зміни (необов'язково)" value={reason} onChange={(e) => setReason(e.target.value)} hint="Потрапить у журнал змін" />
        {error ? <Notice tone="bad" role="alert">{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          <MiniButton onClick={onClose} disabled={busy}>Скасувати</MiniButton>
          <Button type="submit" disabled={busy || blocked} className="min-h-10">{busy ? "Збереження…" : "Зберегти"}</Button>
        </div>
      </form>
    </Modal>
  );
}
