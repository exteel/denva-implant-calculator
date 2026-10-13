"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LeadIntent, LeadPayload, SubmitLeadResponse } from "@/lib/contracts";
import { Button } from "@/components/ui/Button";
import { isValidPhone, sanitizePhoneInput } from "@/services/lead";
import { track } from "@/services/analytics";

type SubmitBody = { lead: LeadPayload } | { retry_lead_id: string };

interface Props {
  /** Builds the payload from the current result at submit time. */
  buildLead: (intent: LeadIntent, phone: string) => LeadPayload;
  submit: (body: SubmitBody) => Promise<SubmitLeadResponse>;
}

type Phase =
  | { kind: "closed" }
  | { kind: "form" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "failed"; leadId: string | null };

const SUBMIT_LABEL: Record<LeadIntent, string> = {
  refine: "Надіслати заявку",
  send_calculation: "Надіслати розрахунок",
};

/**
 * ТЗ §6.3: voluntary lead form BELOW the result — never a modal, never a
 * blocker. A phone is all it asks for. A failed Telegram delivery keeps the
 * stored lead and offers "Надіслати ще раз".
 */
export function LeadBlock({ buildLead, submit }: Props) {
  const [intent, setIntent] = useState<LeadIntent>("refine");
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);
  const ids = { phone: useId(), error: useId() };
  const open = phase.kind !== "closed";
  const phoneOk = isValidPhone(phone);

  useEffect(() => {
    if (phase.kind === "form") phoneRef.current?.focus({ preventScroll: false });
  }, [phase.kind, intent]);

  const openForm = (next: LeadIntent) => {
    setIntent(next);
    track("lead_cta_clicked", { intent: next });
    setPhase((prev) => (prev.kind === "closed" ? { kind: "form" } : prev));
  };

  const send = async (body: SubmitBody, retry: boolean) => {
    setPhase({ kind: "sending" });
    if (retry) track("lead_retry", { intent });
    try {
      const response = await submit(body);
      if (response.telegram === "sent") {
        track("lead_submitted", { intent });
        setPhase({ kind: "sent" });
      } else {
        track("lead_failed", { intent, reason: "telegram" });
        // Keep the id: a retry re-sends the stored lead to Telegram.
        setPhase({ kind: "failed", leadId: response.lead_id });
      }
    } catch {
      track("lead_failed", { intent, reason: "network" });
      setPhase({ kind: "failed", leadId: null });
    }
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!phoneOk || phase.kind === "sending") return;
    void send({ lead: buildLead(intent, phone) }, false);
  };

  if (phase.kind === "sent") {
    return (
      <section
        data-testid="lead-block"
        className="rounded-[var(--radius-card)] border border-good/30 bg-good-soft p-5"
        role="status"
      >
        <p className="text-[17px] font-extrabold text-good">Дякуємо! Заявку отримано.</p>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
          Координатор DENVA зв’яжеться з вами за вказаним номером. Ваш розрахунок уже додано до заявки — нічого
          не потрібно пояснювати заново.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="lead-block"
      aria-labelledby="lead-title"
      className="rounded-[var(--radius-card)] border border-brand-line bg-brand-soft/50 p-5"
    >
      <h2 id="lead-title" className="text-[19px] leading-snug font-extrabold">
        Уточнити мій розрахунок
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        Координатор DENVA допоможе врахувати можливі видалення, тимчасові зуби, кісткову пластику та інші етапи,
        які неможливо визначити без додаткових даних
      </p>

      <div className="mt-4 grid gap-2.5">
        <Button
          aria-pressed={open && intent === "refine"}
          onClick={() => openForm("refine")}
          className="w-full"
          data-testid="cta-refine"
        >
          Уточнити мій розрахунок
        </Button>
        <Button
          variant="secondary"
          aria-pressed={open && intent === "send_calculation"}
          onClick={() => openForm("send_calculation")}
          className="h-auto w-full py-3 text-center leading-snug"
          data-testid="cta-send"
        >
          Надіслати мені розрахунок і список запитань для консультації
        </Button>
      </div>

      {open && (
        <form onSubmit={onSubmit} noValidate className="mt-5 border-t border-brand-line pt-5" data-testid="lead-form">
          <label htmlFor={ids.phone} className="text-sm font-extrabold">
            Ваш номер телефону
          </label>
          <input
            ref={phoneRef}
            id={ids.phone}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+380 __ ___ __ __"
            value={phone}
            disabled={phase.kind === "sending" || (phase.kind === "failed" && phase.leadId !== null)}
            onChange={(event) => setPhone(sanitizePhoneInput(event.target.value))}
            aria-invalid={touched && !phoneOk}
            aria-describedby={touched && !phoneOk ? ids.error : undefined}
            className="mt-1.5 h-14 w-full rounded-2xl border border-line-strong bg-paper px-4 text-[16px] font-semibold focus:border-brand focus:outline-none"
          />
          {touched && !phoneOk && (
            <p id={ids.error} role="alert" className="mt-1.5 text-sm font-semibold text-bad">
              Введіть номер телефону повністю, наприклад +380 50 123 45 67.
            </p>
          )}

          {phase.kind === "failed" && (
            <div role="alert" className="mt-4 rounded-2xl border border-bad/30 bg-bad-soft p-4" data-testid="lead-error">
              <p className="font-extrabold text-bad">Не вдалося доставити заявку</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {phase.leadId
                  ? "Заявку збережено, але передати її координатору одразу не вийшло. Ваш розрахунок нікуди не зник — спробуйте надіслати ще раз."
                  : "Перевірте з’єднання з інтернетом і спробуйте ще раз. Ваш розрахунок нікуди не зник."}
              </p>
              <Button
                className="mt-3"
                variant="secondary"
                data-testid="lead-retry"
                onClick={() => {
                  if (phase.leadId) {
                    void send({ retry_lead_id: phase.leadId }, true);
                    return;
                  }
                  setTouched(true);
                  if (phoneOk) void send({ lead: buildLead(intent, phone) }, true);
                }}
              >
                Надіслати ще раз
              </Button>
            </div>
          )}

          {phase.kind !== "failed" && (
            <Button type="submit" className="mt-4 w-full" disabled={phase.kind === "sending"}>
              {phase.kind === "sending" ? "Надсилаємо…" : SUBMIT_LABEL[intent]}
            </Button>
          )}

          <p className="mt-3 text-xs leading-relaxed text-muted">
            Надсилаючи номер, ви погоджуєтеся, що координатор DENVA зв’яжеться з вами щодо цього розрахунку. SMS-код
            не потрібен.
          </p>
        </form>
      )}
    </section>
  );
}
