import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadPayload, SubmitLeadResponse } from "@/lib/contracts";
import { LeadBlock } from "./LeadBlock";

const lead = (intent: LeadPayload["intent"], phone: string): LeadPayload => ({
  intent,
  phone,
  location: { kind: "city", id: "lviv", name: "Львів" },
  scenario: {},
  scenario_label: "1 зуб",
  answers: {},
  implant_tier: "classic",
  crown_or_arch_tier: "classic",
  total_uah: 36800,
  price_source: "статистичний орієнтир Denva",
  page_url: "http://localhost/",
  utm: {},
  created_at: "2026-10-13T00:00:00.000Z",
});

function setup(submit: (body: unknown) => Promise<SubmitLeadResponse>) {
  const fn = vi.fn(submit);
  render(<LeadBlock buildLead={lead} submit={fn} />);
  return { fn, user: userEvent.setup() };
}

describe("LeadBlock", () => {
  it("shows both CTAs and no form until one is chosen", () => {
    setup(async () => ({ lead_id: "1", telegram: "sent" }));
    expect(screen.getByRole("button", { name: "Уточнити мій розрахунок" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Надіслати мені розрахунок і список запитань для консультації" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Ваш номер телефону")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("validates the phone before sending", async () => {
    const { fn, user } = setup(async () => ({ lead_id: "1", telegram: "sent" }));
    await user.click(screen.getByRole("button", { name: "Уточнити мій розрахунок" }));
    await user.type(screen.getByLabelText("Ваш номер телефону"), "123");
    await user.click(screen.getByRole("button", { name: "Надіслати заявку" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Введіть номер телефону повністю");
    expect(fn).not.toHaveBeenCalled();
  });

  it("sends the payload with the chosen intent and confirms", async () => {
    const { fn, user } = setup(async () => ({ lead_id: "L1", telegram: "sent" }));
    await user.click(
      screen.getByRole("button", { name: "Надіслати мені розрахунок і список запитань для консультації" }),
    );
    await user.type(screen.getByLabelText("Ваш номер телефону"), "+380501234567");
    await user.click(screen.getByRole("button", { name: "Надіслати розрахунок" }));
    expect(await screen.findByText("Дякуємо! Заявку отримано.")).toBeInTheDocument();
    expect(fn).toHaveBeenCalledWith({ lead: expect.objectContaining({ intent: "send_calculation", phone: "+380501234567" }) });
  });

  it("Telegram failure keeps the lead and retries by id", async () => {
    let calls = 0;
    const { fn, user } = setup(async () => {
      calls += 1;
      return { lead_id: "L7", telegram: calls === 1 ? "failed" : "sent" };
    });
    await user.click(screen.getByRole("button", { name: "Уточнити мій розрахунок" }));
    await user.type(screen.getByLabelText("Ваш номер телефону"), "+380500000000");
    await user.click(screen.getByRole("button", { name: "Надіслати заявку" }));
    expect(await screen.findByText("Не вдалося доставити заявку")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Надіслати ще раз" }));
    expect(await screen.findByText("Дякуємо! Заявку отримано.")).toBeInTheDocument();
    expect(fn).toHaveBeenLastCalledWith({ retry_lead_id: "L7" });
  });

  it("a network error offers a retry with a fresh payload", async () => {
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
