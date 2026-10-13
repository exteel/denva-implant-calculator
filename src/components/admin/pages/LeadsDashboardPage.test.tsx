import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => {
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const mk = (id: string, daysAgo: number, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    id,
    phone: "+380671112233",
    telegram_status: "sent",
    attempts: 1,
    created_at: at(daysAgo),
    payload: { intent: "refine", location: { name: "Львів" }, scenario: { scope: "individual" }, implant_tier: "classic", crown_or_arch_tier: "classic", utm: {}, ...payload },
    ...extra,
  });
  return [
    mk("a", 0, { total_uah: 100000, utm: { utm_source: "google" } }),
    mk("b", 1, { total_uah: 200000, location: { name: "Київ" }, scenario: { scope: "one_jaw" } }, { telegram_status: "failed" }),
    mk("c", 40, { total_uah: 50000 }),
    mk("t", 0, { scenario_label: "ТЕСТОВА заявка" }, { phone: "+380000000000" }),
  ];
});

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  listLeadsForDashboard: vi.fn(async () => rows),
}));

import LeadsDashboardPage from "./LeadsDashboardPage";

describe("LeadsDashboardPage", () => {
  it("applies the period and hides test leads by default", async () => {
    render(<LeadsDashboardPage />);
    expect(await screen.findByText("Усього заявок за період")).toBeInTheDocument();
    // 30 days default: a, b (c is 40 days old, t is a test lead)
    expect(screen.getByText("Усього заявок за період").parentElement).toHaveTextContent("2");
    expect(screen.getByText(/приховано 1/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Усі" }));
    expect(screen.getByText("Усього заявок за період").parentElement).toHaveTextContent("3");

    await userEvent.click(screen.getByRole("checkbox", { name: /Без тестових/ }));
    expect(screen.getByText("Усього заявок за період").parentElement).toHaveTextContent("4");
  });

  it("shows Telegram failures with a label and a link to the filtered list", async () => {
    render(<LeadsDashboardPage />);
    await screen.findByText("Telegram");
    expect(screen.getByText("не доставлено")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /недоставлені/ })).toHaveAttribute("href", expect.stringMatching(/status=failed/));
  });

  it("offers a table twin for each chart", async () => {
    render(<LeadsDashboardPage />);
    await screen.findByText("За містами");
    const card = screen.getByText("За містами").closest("section")!;
    await userEvent.click(within(card).getByRole("button", { name: "Таблиця" }));
    const table = within(card).getByRole("table");
    expect(within(table).getByText("Львів")).toBeInTheDocument();
    expect(within(table).getByText("Київ")).toBeInTheDocument();
  });
});
