import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  configured: true,
  session: null as null | { user: { id: string; email: string } },
  isAdmin: false,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return {
    ...original,
    get isSupabaseConfigured() {
      return state.configured;
    },
    getSession: vi.fn(async () => state.session),
    onAuthChange: vi.fn(() => () => {}),
    checkIsAdmin: vi.fn(async () => state.isAdmin),
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    getDashboardCounts: vi.fn(async () => ({ pendingPrices: 4, failedLeads: 1, citiesWithoutPrices: [{ id: "lviv", name: "Львів" }] })),
    listServices: vi.fn(async () => [
      { service_code: "IMPLANT_INSTALL", name: "Імплант", role: "implant", unit: "за імплант", tiered: true, included_text: null, active: true, sort: 1 },
    ]),
  };
});

import { AdminShell } from "./AdminShell";
import DashboardPage from "./pages/DashboardPage";
import ServicesPage from "./pages/ServicesPage";

beforeEach(() => {
  state.configured = true;
  state.session = null;
  state.isAdmin = false;
});

describe("AdminShell auth gate", () => {
  it("explains how to configure Supabase instead of crashing", async () => {
    state.configured = false;
    render(<AdminShell><p>secret</p></AdminShell>);
    expect(await screen.findByText("Supabase не налаштовано")).toBeInTheDocument();
    expect(screen.getByText("NEXT_PUBLIC_SUPABASE_URL")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("shows the sign-in form when signed out", async () => {
    render(<AdminShell><p>secret</p></AdminShell>);
    expect(await screen.findByRole("button", { name: "Увійти" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/E-mail/), "a@b.ua");
    await userEvent.type(screen.getByLabelText(/Пароль/), "pw");
    expect(screen.getByRole("button", { name: "Увійти" })).toBeEnabled();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("tells non-admin users they have no admin rights", async () => {
    state.session = { user: { id: "u1", email: "user@x.ua" } };
    render(<AdminShell><p>secret</p></AdminShell>);
    expect(await screen.findByText("Ваш акаунт не має прав адміністратора")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("renders nav and content for admins", async () => {
    state.session = { user: { id: "u1", email: "boss@x.ua" } };
    state.isAdmin = true;
    render(<AdminShell><p>secret</p></AdminShell>);
    expect(await screen.findByText("secret")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Розділи адмін-панелі" })).toBeInTheDocument();
    for (const label of ["Міста та регіони", "Клініки", "Каталог послуг", "Прайси клінік", "Імпорт Excel", "Міські орієнтири", "Агрегати міста", "Історія змін", "Заявки", "Налаштування"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });
});

describe("pages (mocked api)", () => {
  it("dashboard shows the three attention counters", async () => {
    render(<DashboardPage />);
    expect(await screen.findByText("Ціни на модерації")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Заявки, не надіслані в Telegram")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Львів" })).toHaveAttribute("href", expect.stringMatching(/^\/admin\/benchmarks\/?\?scope=city/));
  });

  it("service catalogue keeps service_code immutable on edit", async () => {
    render(<ServicesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Редагувати" }));
    await waitFor(() => expect(screen.getByLabelText(/service_code/)).toBeDisabled());
    expect(screen.getByLabelText(/service_code/)).toHaveValue("IMPLANT_INSTALL");
  });
});
