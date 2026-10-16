import { describe, expect, it } from "vitest";
import {
  deviationPct,
  describeError,
  diffRecords,
  formatBlend,
  formatMoney,
  midpoint,
  parseAliases,
  parseDecimal,
  slugify,
  validatePriceForm,
  type PriceFormValues,
  type ServiceLite,
} from "./helpers";

const SERVICES: ServiceLite[] = [
  { service_code: "IMPLANT_INSTALL", tiered: true, role: "implant" },
  { service_code: "SCAN_BOTH", tiered: false, role: "scan" },
  { service_code: "REMOVAL_SIMPLE", tiered: false, role: "removal" },
  { service_code: "SINUS_LIFT", tiered: false, role: "addon" },
];

const base: PriceFormValues = {
  clinic_id: "c1",
  service_code: "IMPLANT_INSTALL",
  tier: "classic",
  price_from: "14000",
  price_to: "",
  currency: "UAH",
  included_text: "імплант + встановлення",
  valid_from: "2026-10-01",
};

describe("validatePriceForm", () => {
  it("accepts a valid card", () => {
    expect(validatePriceForm(base, SERVICES)).toEqual({});
  });
  it("requires service from the catalogue and a tier for tiered services", () => {
    expect(validatePriceForm({ ...base, service_code: "" }, SERVICES).service_code).toBeTruthy();
    expect(validatePriceForm({ ...base, service_code: "FOO" }, SERVICES).service_code).toBeTruthy();
    expect(validatePriceForm({ ...base, tier: "common" }, SERVICES).tier).toBeTruthy();
    expect(validatePriceForm({ ...base, tier: "" }, SERVICES).tier).toBeTruthy();
  });
  it("forces common tier for untiered services", () => {
    const v = { ...base, service_code: "SCAN_BOTH" };
    expect(validatePriceForm({ ...v, tier: "classic" }, SERVICES).tier).toBeTruthy();
    expect(validatePriceForm({ ...v, tier: "common" }, SERVICES)).toEqual({});
  });
  it("validates price > 0, range order and currency", () => {
    expect(validatePriceForm({ ...base, price_from: "0" }, SERVICES).price_from).toBeTruthy();
    expect(validatePriceForm({ ...base, price_from: "" }, SERVICES).price_from).toBeTruthy();
    expect(validatePriceForm({ ...base, price_from: "abc" }, SERVICES).price_from).toBeTruthy();
    expect(validatePriceForm({ ...base, price_to: "100" }, SERVICES).price_to).toBeTruthy();
    expect(validatePriceForm({ ...base, price_to: "15000" }, SERVICES)).toEqual({});
    expect(validatePriceForm({ ...base, currency: "RUB" }, SERVICES).currency).toBeTruthy();
  });
  it("requires composition except for one-off diagnostics and removals", () => {
    expect(validatePriceForm({ ...base, included_text: " " }, SERVICES).included_text).toBeTruthy();
    expect(
      validatePriceForm({ ...base, service_code: "REMOVAL_SIMPLE", tier: "common", included_text: "" }, SERVICES),
    ).toEqual({});
    expect(
      validatePriceForm({ ...base, service_code: "SINUS_LIFT", tier: "common", included_text: "" }, SERVICES).included_text,
    ).toBeTruthy();
  });
});

describe("helpers", () => {
  it("parses decimals", () => {
    expect(parseDecimal("1 200,5")).toBe(1200.5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("x")).toBeNaN();
  });
  it("computes midpoint and deviation", () => {
    expect(midpoint(100, null)).toBe(100);
    expect(midpoint(100, 200)).toBe(150);
    expect(deviationPct(150, 100)).toBe(50);
    expect(deviationPct(50, 100)).toBe(-50);
    expect(deviationPct(1, null)).toBeNull();
    expect(deviationPct(1, 0)).toBeNull();
  });
  it("splits aliases", () => {
    expect(parseAliases("Lviv, Львів;  Leopolis\n")).toEqual(["Lviv", "Львів", "Leopolis"]);
  });
  it("slugifies Ukrainian names", () => {
    expect(slugify("Івано-Франківськ")).toBe("ivano-frankivsk");
    expect(slugify("Львів")).toBe("lviv");
    expect(slugify("Дніпро")).toBe("dnipro");
    expect(slugify("Кам'янське")).toBe("kamyanske");
    expect(slugify("Київська область")).toBe("kyyivska-oblast");
  });
  it("formats blend weights", () => {
    expect(formatBlend({ local: 1 / 3, baseline: 2 / 3 })).toBe("⅓ локальна + ⅔ базова");
    expect(formatBlend({ local: 2 / 3, baseline: 1 / 3 })).toBe("⅔ локальна + ⅓ базова");
    expect(formatBlend({ local: 1, baseline: 0 })).toBe("100% локальна медіана");
    expect(formatBlend({ local: 0, baseline: 1 })).toBe("100% базова");
    expect(formatBlend({ local: 0.4, baseline: 0.6 })).toBe("40% локальна + 60% базова");
    expect(formatBlend(null)).toBe("—");
  });
  it("formats money", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(1000, "UAH")).toContain("₴");
  });
  it("diffs audit records", () => {
    expect(diffRecords({ a: 1, b: 2, updated_at: "x" }, { a: 1, b: 3, updated_at: "y" })).toEqual([
      { field: "b", before: 2, after: 3 },
    ]);
    expect(diffRecords(null, { a: 1 })).toEqual([{ field: "a", before: undefined, after: 1 }]);
    expect(diffRecords({ a: 1 }, null)).toEqual([{ field: "a", before: 1, after: undefined }]);
  });
  it("maps database errors to Ukrainian messages", () => {
    expect(describeError({ code: "23505", message: "dup" })).toMatch(/уже існує/);
    expect(describeError({ code: "42501", message: "rls" })).toMatch(/прав/);
    expect(describeError(new Error("Failed to fetch"))).toMatch(/зв'язку/);
  });
});
