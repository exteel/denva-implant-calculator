import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadPayload, SubmitLeadResponse } from "@/lib/contracts";
import { LeadBlock } from "./LeadBlock";

const lead = (intent: LeadPayload["intent"], phone: string): LeadPayload => ({
  intent,
  phone,
  location: { kind: "city", id: "kyiv", name: "Київ" },
  answers: {},
  scenario_label: "Верхня щелепа: 1 зуб",
  upperJawInput: null,
  lowerJawInput: null,
  upperJawCalculation: null,
  lowerJawCalculation: null,
  overallTotal: { low: 39800, high: 39800 },
  price_source: "Використано середній ринковий орієнтир міста",
  page_url: "http://localhost/",
  utm: {},
  created_at: "2026-10-17T00:00:00.000Z",
});

function setup(submit: (body: unknown) => Promise<SubmitLeadResponse>) {
  const fn = vi.fn(submit);
  render(<LeadBlock buildLead={lead} submit={fn} />);
  return { fn, user: userEvent.setup() };
}

const TENDER = "Отримати персональні пропозиції від перевірених клінік";

describe("LeadBlock", () => {
  it("shows both CTAs and no form until one is chosen", () => {
    setup(async () => ({ lead_id: "1", telegram: "sent" }));
    expect(screen.getByRole("button", { name: TENDER })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Уточнити мій розрахунок" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Ваш номер телефону")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks only for a phone, validates it before sending", async () => {
    const { fn, user } = setup(async () => ({ lead_id: "1", telegram: "sent" }));
    await user.click(screen.getByRole("button", { name: TENDER }));
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    await user.type(screen.getByLabelText("Ваш номер телефону"), "123");
    await user.click(screen.getByRole("button", { name: "Надіслати заявку" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Введіть номер телефону повністю");
    expect(fn).not.toHaveBeenCalled();
  });

  it("dental_tender is the primary intent, refine the secondary", async () => {
    const tender = setup(async () => ({ lead_id: "L1", telegram: "sent" }));
    await tender.user.click(screen.getByRole("button", { name: TENDER }));
    await tender.user.type(screen.getByLabelText("Ваш номер телефону"), "+380501234567");
    await tender.user.click(screen.getByRole("button", { name: "Надіслати заявку" }));
    expect(await screen.findByText("Дякуємо! Заявку отримано.")).toBeInTheDocument();
    expect(tender.fn).toHaveBeenCalledWith({ lead: expect.objectContaining({ intent: "dental_tender", phone: "+380501234567" }) });
  });

  it("refine sends intent=refine", async () => {
    const { fn, user } = setup(async () => ({ lead_id: "L2", telegram: "sent" }));
    await user.click(screen.getByRole("button", { name: "Уточнити мій розрахунок" }));
    await user.type(screen.getByLabelText("Ваш номер телефону"), "+380501234567");
    await user.click(screen.getByRole("button", { name: "Надіслати заявку" }));
    await screen.findByText("Дякуємо! Заявку отримано.");
    expect(fn).toHaveBeenCalledWith({ lead: expect.objectContaining({ intent: "refine" }) });
  });

  it("switching the CTA changes the intent of the same form", async () => {
    const { fn, user } = setup(async () => ({ lead_id: "L3", telegram: "sent" }));
    await user.click(screen.getByRole("button", { name: TENDER }));
    await user.click(screen.getByRole("button", { name: "Уточнити мій розрахунок" }));
    await user.type(screen.getByLabelText("Ваш номер телефону"), "+380501234567");
    await user.click(screen.getByRole("button", { name: "Надіслати заявку" }));
    await screen.findByText("Дякуємо! Заявку отримано.");
    expect(fn).toHaveBeenCalledWith({ lead: expect.objectContaining({ intent: "refine" }) });
  });

  it("Telegram failure keeps the lead and retries by id", async () => {
    let calls = 0;
    const { fn, user } = setup(async () => {
      calls += 1;
      return { lead_id: "L7", telegram: calls === 1 ? "failed" : "sent" };
    });
    await user.click(screen.getByRole("button", { name: TENDER }));
    await user.type(screen.getByLabelText("Ваш номер телефону"), "+380500000000");
    await user.click(screen.getByRole("button", { name: "Надіслати заявку" }));
    expect(await screen.findByText("Не вдалося доставити заявку")).toBeInTheDocument();
    expect(screen.getByLabelText("Ваш номер телефону")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Надіслати ще раз" }));
    expect(await screen.findByText("Дякуємо! Заявку отримано.")).toBeInTheDocument();
    expect(fn).toHaveBeenLastCalledWith({ retry_lead_id: "L7" });
  });

  it("a network error offers a retry with a fresh payload and an editable phone", async () => {
    let calls = 0;
    const { fn, user } = setup(async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return { lead_id: "L2", telegram: "sent" };
    });
    await user.click(screen.getByRole("button", { name: "Уточнити мій розрахунок" }));
    await user.type(screen.getByLabelText("Ваш номер телефону"), "+380501234567");
    await user.click(screen.getByRole("button", { name: "Надіслати заявку" }));
    expect(await screen.findByText("Не вдалося доставити заявку")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Надіслати ще раз" }));
    await waitFor(() => expect(screen.getByText("Дякуємо! Заявку отримано.")).toBeInTheDocument());
    expect(fn).toHaveBeenLastCalledWith({ lead: expect.objectContaining({ phone: "+380501234567" }) });
  });
});
