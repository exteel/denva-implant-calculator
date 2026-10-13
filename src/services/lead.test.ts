import { describe, expect, it } from "vitest";
import { calculate, deriveParams, presetTiers } from "@/engine/v2";
import { makeBook } from "@/engine/v2/test-utils";
import { buildLeadPayload, isValidPhone, readUtm } from "./lead";

describe("lead helpers", () => {
  it("validates phones", () => {
    expect(isValidPhone("+380 50 123 45 67")).toBe(true);
    expect(isValidPhone("0501234567")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });

  it("reads utm tags only", () => {
    expect(readUtm("?utm_source=g&utm_medium=cpc&x=1&gclid=abc")).toEqual({
      utm_source: "g",
      utm_medium: "cpc",
      gclid: "abc",
    });
  });

  it("builds the ТЗ §6.3 payload", () => {
    const answers = { scope: "one_jaw" as const, followUp: { id: "jaw_state" as const, value: "no_teeth" } };
    const params = deriveParams(answers)!;
    const calculation = calculate(makeBook(), params, presetTiers("classic"));
    const payload = buildLeadPayload({
      intent: "refine",
      phone: " +380501234567 ",
      location: { kind: "city", id: "lviv", name: "Львів" },
      answers,
      params,
      calculation,
      implantTier: "classic",
      crownTier: "premium",
      pageUrl: "https://x.test/?utm_source=g",
      search: "?utm_source=g",
      now: new Date("2026-10-13T10:00:00Z"),
    });
    expect(payload).toMatchObject({
      intent: "refine",
      phone: "+380501234567",
      scenario_label: "Усі зуби на одній щелепі · All-on-4",
      answers: { scope: "one_jaw", jaw_state: "no_teeth" },
      implant_tier: "classic",
      crown_or_arch_tier: "premium",
      total_uah: 137500,
      full_treatment_uah: 269000,
      price_source: "статистичний орієнтир Denva",
      utm: { utm_source: "g" },
      created_at: "2026-10-13T10:00:00.000Z",
    });
  });
});
