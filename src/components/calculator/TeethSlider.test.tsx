import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeethSlider } from "./TeethSlider";

function Harness({ initial = 1 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return <TeethSlider value={value} onChange={setValue} />;
}

describe("TeethSlider", () => {
  it("is an accessible slider with a 1–7+ range and spoken value", () => {
    render(<Harness initial={3} />);
    const slider = screen.getByRole("slider", { name: "Кількість зубів" });
    expect(slider).toHaveAttribute("aria-valuemin", "1");
    expect(slider).toHaveAttribute("aria-valuemax", "7");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(slider).toHaveAttribute("aria-valuetext", "3 зуби");
    expect(slider).toHaveAttribute("tabindex", "0");
  });

  it("moves with the arrow keys, Home/End and stays within 1..7", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const slider = screen.getByRole("slider");
    slider.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    await user.keyboard("{ArrowLeft}");
    expect(slider).toHaveAttribute("aria-valuenow", "2");
    await user.keyboard("{End}");
    expect(slider).toHaveAttribute("aria-valuenow", "7");
    expect(slider).toHaveAttribute("aria-valuetext", "7 і більше зубів");
    await user.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "7");
    await user.keyboard("{Home}{ArrowLeft}");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
  });

  it("shows the selected value above the scale", () => {
    render(<Harness initial={7} />);
    expect(screen.getByTestId("teeth-value")).toHaveTextContent("7+");
    expect(screen.getByTestId("teeth-value")).toHaveTextContent("7 і більше зубів");
  });
});
