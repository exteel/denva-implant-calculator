import { describe, expect, it } from "vitest";
import { createPriceBook } from "@/engine/v3";
import { fixturePricesResponse } from "@/lib/data/fixture";
import { initialState, leadParts, setAnswer, setCount, setTiers } from "@/components/calculator/model";
import { buildLeadPayload, isValidPhone, readUtm, sanitizePhoneInput } from "./lead";

describe("lead helpers", () => {
  it("validates phones", () => {
    expect(isValidPhone("+380 50 123 45 67")).toBe(true);
    expect(isValidPhone("0501234567")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone("1234567890123")).toBe(false);
  });

  it("sanitises typing", () => {
    expect(sanitizePhoneInput("+38 (050) abc 123-45")).toBe("+38 (050)  123-45");
  });

  it("reads utm tags only", () => {
    expect(readUtm("?utm_source=g&utm_medium=cpc&x=1&gclid=abc")).toEqual({ utm_source: "g", utm_medium: "cpc", gclid: "abc" });
  });
});

describe("LeadPayload v3 (ТЗ §6.3)", () => {
  const book = createPriceBook(fixturePricesResponse("city", "kyiv"));

  function state() {
    let s = initialState();
    s = setCount(s, "upper", 3);
    s = setAnswer(s, "upper", { location: "adjacent", status: "removed" });
    s = setCount(s, "lower", 9);
    s = setAnswer(s, "lower", { status: "extraction_recommended" });
    s = setTiers(s, "upper", { implant: "premium" });
    return s;
  }

  it("carries both jaw inputs and calculations, the total, readable answers and the source sentence", () => {
    const parts = leadParts(state(), book);
    const payload = buildLeadPayload({
      intent: "dental_tender",
      phone: " +380501234567 ",
      location: { kind: "city", id: "kyiv", name: "Київ" },
      parts,
      pageUrl: "https://x.test/implant-calculator/kyiv/?utm_source=g",
      search: "?utm_source=g",
      now: new Date("2026-10-17T10:00:00Z"),
    });
    expect(payload).toMatchObject({
      intent: "dental_tender",
      phone: "+380501234567",
      location: { kind: "city", id: "kyiv", name: "Київ" },
      // the premium implant of the upper jaw has no local clinics → the weakest line decides
      price_source: "Використано середній ринковий орієнтир міста",
      utm: { utm_source: "g" },
      created_at: "2026-10-17T10:00:00.000Z",
      page_url: "https://x.test/implant-calculator/kyiv/?utm_source=g",
    });
    expect(payload.upperJawInput).toMatchObject({ jaw: "upper", tooth_count: 3, location: "adjacent", implant_tier: "premium", crown_or_arch_tier: "classic" });
    expect(payload.lowerJawInput).toMatchObject({ jaw: "lower", tooth_count: 9, status: "extraction_recommended", scenario: "bridges" });
    expect(payload.upperJawCalculation?.total.low).toBeGreaterThan(0);
    expect(payload.lowerJawCalculation?.alternatives).toHaveLength(4);
    expect(payload.overallTotal?.low).toBeCloseTo(
      (payload.upperJawCalculation?.total.low ?? 0) + (payload.lowerJawCalculation?.total.low ?? 0),
      6,
    );
    expect(payload.scenario_label).toBe("Верхня щелепа: 3 зуби, поруч; Нижня щелепа: 9 зубів, мости");
    expect(payload.answers).toMatchObject({
      "Верхня щелепа: скільки зубів потрібно замінити?": 3,
      "Верхня щелепа: як розташовані зуби?": "Поруч",
      "Верхня щелепа: стан зубів": "Зуби вже видалені",
      "Верхня щелепа: рівень імпланта": "Преміальний",
      "Верхня щелепа: рівень коронки": "Класичний",
      "Нижня щелепа: скільки зубів потрібно замінити?": 9,
      "Нижня щелепа: стан зубів": "Лікар рекомендував видалення",
      "Нижня щелепа: вибраний сценарій": "Мости",
      "Врахувати тимчасове протезування": "Ні",
    });
  });

  it("a city without prices: no total, an honest source", () => {
    const empty = createPriceBook(fixturePricesResponse("city", "kramatorsk"));
    const s = setAnswer(setCount(initialState(), "upper", 1), "upper", { status: "removed" });
    const payload = buildLeadPayload({
      intent: "refine",
      phone: "0501234567",
      location: { kind: "city", id: "kramatorsk", name: "Краматорськ" },
      parts: leadParts(s, empty),
      pageUrl: "",
      search: "",
    });
    expect(payload.overallTotal).toBeNull();
    expect(payload.price_source).toBe("Даних поки недостатньо");
    expect(payload.upperJawCalculation?.missing_codes.length).toBeGreaterThan(0);
  });
});
