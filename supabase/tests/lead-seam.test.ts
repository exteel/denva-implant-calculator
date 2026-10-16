// @vitest-environment node
/**
 * Seam: the calculator's real lead (engine v3 + fixture prices → src/services/lead.ts) must pass the
 * submit-lead validation unchanged and render fully in the Telegram message (ТЗ §6.3, §9).
 */
import { describe, expect, it } from "vitest";
import { createPriceBook } from "../../src/engine/v3";
import { fixturePricesResponse } from "../../src/lib/data/fixture";
import type { LeadIntent, LocationKind } from "../../src/lib/contracts";
import {
  initialState, leadParts, setAnswer, setCount, setScenario, setTiers, setUnknownChoice, setUnknownMode, type CalcState,
} from "../../src/components/calculator/model";
import { buildLeadPayload } from "../../src/services/lead";
import { validateLead } from "../functions/_shared/lead";
import { formatLeadMessage } from "../functions/_shared/telegram";

const plain = (t: string) => t.replace(/ /g, " ");

function lead(state: CalcState, kind: LocationKind, id: string, intent: LeadIntent = "dental_tender") {
  const response = fixturePricesResponse(kind, id);
  const book = createPriceBook(response);
  return buildLeadPayload({
    intent,
    phone: "+38 (067) 123-45-67",
    location: { kind, id, name: response.location.name },
    parts: leadParts(state, book),
    pageUrl: `https://exteel.github.io/denva-implant-calculator/implant-calculator/${id}/?utm_source=ig`,
    search: "?utm_source=ig&utm_campaign=autumn&gclid=abc&other=x",
    now: new Date("2026-10-17T10:00:00Z"),
  });
}

const cases: Array<[string, () => CalcState, LocationKind, string]> = [
  ["1 зуб, Київ", () => setAnswer(setCount(initialState(), "upper", 1), "upper", { status: "removed" }), "city", "kyiv"],
  ["3 поруч + 2 окремо, Львів, різні рівні", () => {
    let s = setCount(setCount(initialState(), "upper", 3), "lower", 2);
    s = setAnswer(s, "upper", { location: "adjacent", status: "partly_present" });
    s = setAnswer(s, "lower", { location: "separate", status: "extraction_recommended" });
    s = setTiers(s, "lower", { implant: "premium", crown: "minimum" });
    return { ...s, includeTemporary: true };
  }, "city", "lviv"],
  ["4 «не знаю» + імпланти встановлені (невідомо), Одеса", () => {
    let s = setCount(setCount(initialState(), "upper", 4), "lower", 3);
    s = setAnswer(s, "upper", { location: "unknown", status: "removed" });
    s = setAnswer(s, "lower", { location: "adjacent", status: "implants_installed", installed: "unknown" });
    return s;
  }, "city", "odesa"],
  ["14 + 10 зубів, All-on-6 і мости, область", () => {
    let s = setCount(setCount(initialState(), "upper", 14), "lower", 10);
    s = setAnswer(s, "upper", { status: "removed" });
    s = setAnswer(s, "lower", { status: "unknown" });
    s = setScenario(s, "upper", "aox6");
    return setTiers(s, "upper", { implant: "minimum", crown: "premium" });
  }, "region", "zakarpatska"],
  ["«Не знаю точно» → окремі зуби", () => setUnknownChoice(setUnknownMode(initialState(), true), "separate"), "city", "kyiv"],
  ["«Не знаю точно» → значна частина", () => setUnknownChoice(setUnknownMode(initialState(), true), "significant"), "city", "dnipro"],
  ["«Не знаю точно» → можливо всі", () => setUnknownChoice(setUnknownMode(initialState(), true), "all"), "city", "lutsk"],
  ["«Не знаю точно» → зовсім не знаю", () => setUnknownChoice(setUnknownMode(initialState(), true), "none"), "city", "vinnytsia"],
  ["місто без цін (Краматорськ)", () => setAnswer(setCount(initialState(), "upper", 2), "upper", { location: "adjacent", status: "removed" }), "city", "kramatorsk"],
];

describe("lead: calculator payload → submit-lead validation → Telegram", () => {
  it.each(cases)("%s", (_name, make, kind, id) => {
    const payload = lead(make(), kind, id);
    const checked = validateLead(JSON.parse(JSON.stringify(payload)));
    expect(checked.ok ? [] : checked.errors).toEqual([]);
    if (!checked.ok) return;
    // nothing the calculator sends is dropped or rewritten by the validator
    expect(checked.lead).toEqual({ ...payload, phone: payload.phone.trim() });

    const text = plain(formatLeadMessage(checked.lead));
    expect(text).toContain("Хоче персональні пропозиції клінік (Dental Tender)");
    expect(text).toContain("+38 (067) 123-45-67");
    expect(text).toContain(payload.location.name);
    expect(text).toContain(`Джерело ціни:</b> ${payload.price_source}`);
    expect(text).toContain("utm_source=ig, utm_campaign=autumn, gclid=abc");
    expect(text).not.toContain("other=x");
    for (const [jaw, label] of [["upper", "Верхня щелепа"], ["lower", "Нижня щелепа"]] as const) {
      const calc = jaw === "upper" ? payload.upperJawCalculation : payload.lowerJawCalculation;
      expect(text.includes(`<b>${label}</b>`), label).toBe(calc !== null);
    }
    if (payload.overallTotal) {
      expect(text).not.toContain("недоступний");
      expect(text).not.toMatch(/Разом: 0 грн/);
    } else {
      expect(text).toContain("Загальна сума:</b> не розрахована");
      expect(text).toContain("недоступний (бракує цін");
      expect(text).not.toMatch(/Разом: 0 грн/);
    }
    expect(text.length).toBeLessThanOrEqual(4096);
  });

  it("intent refine passes and is labelled", () => {
    const payload = lead(setAnswer(setCount(initialState(), "lower", 1), "lower", { status: "removed" }), "city", "kyiv", "refine");
    const checked = validateLead(payload);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(formatLeadMessage(checked.lead)).toContain("Уточнити розрахунок");
  });

  it("overallTotal = upper.total + lower.total in the payload", () => {
    const p = lead(cases[1][1](), "city", "lviv");
    expect(p.overallTotal).toEqual({
      low: p.upperJawCalculation!.total.low + p.lowerJawCalculation!.total.low,
      high: p.upperJawCalculation!.total.high + p.lowerJawCalculation!.total.high,
    });
  });
});
