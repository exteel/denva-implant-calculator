import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscreteSlider } from "./DiscreteSlider";

function Harness({ initial = 0, min = 0, max = 14 }: { initial?: number; min?: number; max?: number }) {
  const [value, setValue] = useState(initial);
  return <DiscreteSlider value={value} min={min} max={max} onChange={setValue} label="Верхня щелепа: кількість зубів" valueText={(n) => `${n} зубів`} />;
}

describe("DiscreteSlider", () => {
  it("is an accessible slider with range and spoken value", () => {
    render(<Harness initial={3} />);
    const slider = screen.getByRole("slider", { name: "Верхня щелепа: кількість зубів" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "14");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(slider).toHaveAttribute("aria-valuetext", "3 зубів");
    expect(slider).toHaveAttribute("tabindex", "0");
  });

  it("arrow keys, Home/End, Page keys; clamped to the range", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const slider = screen.getByRole("slider");
    slider.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowUp}");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    await user.keyboard("{ArrowLeft}{PageDown}");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    await user.keyboard("{End}");
    expect(slider).toHaveAttribute("aria-valuenow", "14");
    await user.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "14");
    await user.keyboard("{Home}{ArrowLeft}");
    expect(slider).toHaveAttribute("aria-valuenow", "0");
  });

  it("−/+ buttons step by one and disable at the ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const minus = screen.getByRole("button", { name: /менше/ });
    const plus = screen.getByRole("button", { name: /більше/ });
    expect(minus).toBeDisabled();
    await user.click(plus);
    await user.click(plus);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "2");
    await user.click(minus);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "1");
  });

  it("plus is disabled at the maximum", async () => {
    render(<Harness initial={14} />);
    expect(screen.getByRole("button", { name: /більше/ })).toBeDisabled();
  });

  it("supports a custom range such as 1…teeth for installed implants", async () => {
    const user = userEvent.setup();
    render(<Harness initial={1} min={1} max={4} />);
    const slider = screen.getByRole("slider");
    slider.focus();
    await user.keyboard("{End}");
    expect(slider).toHaveAttribute("aria-valuenow", "4");
    expect(slider).toHaveAttribute("aria-valuemax", "4");
    await user.keyboard("{Home}{ArrowLeft}");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
  });
});
