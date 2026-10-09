"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Cta, ServiceTarget } from "@/engine/types";
import { isLeadStubMode, isValidPhone, submitLead, type ContactChannel, type LeadPayload } from "@/services/lead";
import { Button } from "@/components/ui/Button";

const SERVICE_INFO: Record<ServiceTarget, { name: string; text: string }> = {
  checkmyplan: {
    name: "CheckMyPlan",
    text: "Незалежний лікар перегляне ваш план або кошторис і пояснить, що в ньому обґрунтовано, а що варто уточнити.",
  },
  ct: {
    name: "Аналіз КТ",
    text: "Лікар перегляне ваш КТ-знімок і підкаже, який обсяг лікування реалістичний саме у вашій ситуації.",
  },
  consultation: {
    name: "Онлайн-консультація",
    text: "Лікар онлайн розбере вашу ситуацію, варіанти лікування та що варто уточнити перед вибором клініки.",
  },
  tender: {
    name: "Dental Tender",
    text: "Ми надішлемо ваш сценарій кільком клінікам у вашому місті, і ви отримаєте співставні пропозиції.",
  },
};

const CHANNELS: { id: ContactChannel; label: string }[] = [
  { id: "call", label: "Дзвінок" },
  { id: "viber", label: "Viber" },
  { id: "telegram", label: "Telegram" },
];

function formatPhoneInput(raw: string): string {
  return raw.replace(/[^\d+\s()-]/g, "").slice(0, 19);
}

interface Props {
  cta: Cta;
  open: boolean;
  onClose: () => void;
  buildPayload: (contact: LeadPayload["contact"]) => LeadPayload;
}

export function LeadDialog({ cta, open, onClose, buildPayload }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<ContactChannel>("call");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const ids = { name: useId(), phone: useId(), comment: useId(), title: useId() };
  const info = SERVICE_INFO[cta.service];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Each opening is a fresh request (the CTA may have changed since).
      setStatus("idle");
      setTouched(false);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const phoneOk = isValidPhone(phone);
  const canSubmit = phoneOk && consent && status !== "sending";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setStatus("sending");
    try {
      await submitLead(buildPayload({ name: name.trim(), phone: phone.trim(), channel, comment: comment.trim() }));
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={ids.title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="m-auto w-[min(100%-2rem,32rem)] rounded-[var(--radius-card)] bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/50"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-brand">{info.name}</p>
            <h2 id={ids.title} className="mt-1 text-[22px] leading-tight font-extrabold">
              {cta.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="grid size-10 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-canvas"
          >
            ×
          </button>
        </div>

        {status === "sent" ? (
          <div className="mt-5" role="status">
            {isLeadStubMode() ? (
              <div className="rounded-2xl bg-warn-soft p-4">
                <p className="font-extrabold text-warn">Демо-режим: заявку не надіслано</p>
                <p className="mt-1 text-[15px] text-ink-soft">
                  Форма працює, але підключення до CRM ще не налаштоване, тому заявка нікуди не
                  передається і з вами ніхто не зв’яжеться.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-good-soft p-4">
                <p className="font-extrabold text-good">Дякуємо! Заявку отримано.</p>
                <p className="mt-1 text-[15px] text-ink-soft">
                  Ми зв’яжемося з вами протягом робочого дня
                  {channel === "call" ? " дзвінком" : ` у ${channel === "viber" ? "Viber" : "Telegram"}`}.
                  Ваш розрахунок уже додано до заявки — нічого не потрібно пояснювати заново.
                </p>
              </div>
            )}
            <Button className="mt-5 w-full" onClick={onClose}>
              Повернутися до розрахунку
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-4 space-y-4">
            <p className="text-[15px] leading-relaxed text-ink-soft">{info.text}</p>

            <div>
              <label htmlFor={ids.phone} className="text-sm font-bold">
                Телефон <span className="text-bad">*</span>
              </label>
              <input
                id={ids.phone}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+380 __ ___ __ __"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                aria-invalid={touched && !phoneOk}
                className="mt-1.5 h-12 w-full rounded-xl border border-line-strong px-3.5 text-[16px] font-semibold focus:border-brand focus:outline-none aria-[invalid=true]:border-bad"
              />
              {touched && !phoneOk && (
                <p className="mt-1 text-sm text-bad">Вкажіть номер телефону — щонайменше 10 цифр.</p>
              )}
            </div>

            <fieldset>
              <legend className="text-sm font-bold">Як зручніше зв’язатися?</legend>
              <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-full bg-canvas p-1">
                {CHANNELS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={channel === c.id}
                    onClick={() => setChannel(c.id)}
                    className={`min-h-10 rounded-full text-sm font-bold ${
                      channel === c.id ? "bg-paper text-brand shadow-sm" : "text-ink-soft"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor={ids.name} className="text-sm font-bold">
                Ім’я <span className="font-medium text-muted">(необов’язково)</span>
              </label>
              <input
                id={ids.name}
                autoComplete="given-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                className="mt-1.5 h-12 w-full rounded-xl border border-line-strong px-3.5 text-[16px] font-semibold focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor={ids.comment} className="text-sm font-bold">
                Коментар <span className="font-medium text-muted">(необов’язково)</span>
              </label>
              <textarea
                id={ids.comment}
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 600))}
                className="mt-1.5 w-full rounded-xl border border-line-strong px-3.5 py-2.5 text-[16px] focus:border-brand focus:outline-none"
              />
            </div>

            <label className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand)]"
              />
              <span>
                Погоджуюся на обробку персональних даних для зв’язку щодо цієї заявки.
                {touched && !consent && <span className="block text-bad">Потрібна ваша згода.</span>}
              </span>
            </label>

            {status === "error" && (
              <p className="rounded-xl bg-bad-soft p-3 text-sm text-bad" role="alert">
                Не вдалося надіслати заявку. Перевірте з’єднання і спробуйте ще раз.
              </p>
            )}

            <Button type="submit" className="w-full" disabled={status === "sending"}>
              {status === "sending" ? "Надсилаємо…" : "Надіслати заявку"}
            </Button>
          </form>
        )}
      </div>
    </dialog>
  );
}
