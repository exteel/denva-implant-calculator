import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const saveCityPage = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getPriceMatrix: vi.fn(async () => [{ service_code: "IMPLANT_INSTALL", tier: "classic", published_value: 18000 }]),
  saveCityPage,
}));

import { CityPageDialog } from "./CityPageDialog";

const city = {
  id: "lviv",
  name: "Львів",
  region_id: "lvivska",
  currency: "UAH",
  active: true,
  aliases: [],
  min_clinics: null,
  slug: "lviv",
  seo_status: "draft" as const,
  faq: [],
};

describe("CityPageDialog", () => {
  it("warns before publishing a city with empty content or missing key prices, and needs an acknowledgement", async () => {
    const onSaved = vi.fn();
    render(<CityPageDialog city={city} onClose={() => {}} onSaved={onSaved} />);
    await userEvent.selectOptions(screen.getByLabelText("SEO-статус"), "published");

    expect(await screen.findByText("Перед публікацією перевірте:")).toBeInTheDocument();
    expect(screen.getByText(/немає вступу міста/)).toBeInTheDocument();
    expect(screen.getByText(/Немає опублікованих ключових цін/)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Зберегти" });
    await waitFor(() => expect(save).toBeDisabled());

    await userEvent.click(screen.getByLabelText("Все одно опублікувати"));
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(saveCityPage).toHaveBeenCalledTimes(1));
    expect(saveCityPage).toHaveBeenCalledWith("lviv", expect.objectContaining({ slug: "lviv", seo_status: "published" }), "");
    expect(onSaved).toHaveBeenCalled();
  });

  it("shows the ТЗ help text for the chosen status and supports FAQ add/remove", async () => {
    render(<CityPageDialog city={city} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText(/noindex; немає у sitemap/, { selector: "p" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Додати питання" }));
    expect(screen.getByLabelText("Питання 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Видалити питання" }));
    expect(screen.queryByLabelText("Питання 1")).not.toBeInTheDocument();
  });

  it("rejects an invalid slug and requires acknowledgement when changing a published slug", async () => {
    render(<CityPageDialog city={{ ...city, seo_status: "published" }} onClose={() => {}} onSaved={() => {}} />);
    const slug = screen.getByLabelText("Slug (URL)");
    await userEvent.clear(slug);
    await userEvent.type(slug, "new-lviv");
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeDisabled();
    await userEvent.click(screen.getByLabelText("Розумію наслідки зміни slug"));
    await userEvent.clear(slug);
    await userEvent.type(slug, "Bad Slug");
    // changing the slug again resets the acknowledgement; confirm both warnings, then validation still blocks the save
    await userEvent.click(screen.getByLabelText("Розумію наслідки зміни slug"));
    await userEvent.click(await screen.findByLabelText("Все одно опублікувати"));
    saveCityPage.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(await screen.findByText(/Slug: малі латинські літери/)).toBeInTheDocument();
    expect(saveCityPage).not.toHaveBeenCalled();
  });
});
