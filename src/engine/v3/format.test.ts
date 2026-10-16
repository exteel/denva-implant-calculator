import { describe, expect, it } from "vitest";
import {
  eurFromUah,
  formatDateUk,
  formatEurRange,
  formatNumber,
  formatRate,
  formatUah,
  formatUahRange,
  moneyLines,
  pluralUk,
  teethText,
} from "./format";

const NBSP = " ";

describe("display formatting", () => {
  it("UAH with NBSP grouping, rounded only for display", () => {
    expect(formatNumber(52000)).toBe(`52${NBSP}000`);
    expect(formatUah(36966.666)).toBe(`36${NBSP}967${NBSP}₴`);
    expect(formatUahRange({ low: 82100, high: 107400 })).toBe(`82${NBSP}100–107${NBSP}400${NBSP}₴`);
    expect(formatUahRange({ low: 5.2, high: 5.4 })).toBe(`5${NBSP}₴`);
  });

  it("EUR is rounded sensibly", () => {
    expect(eurFromUah(36800, 50.1385)).toBe(730);
    expect(eurFromUah(5000, 50)).toBe(100);
    expect(formatEurRange({ low: 36800, high: 36800 }, 50.1385)).toBe(`≈${NBSP}730${NBSP}€`);
    expect(formatEurRange({ low: 82100, high: 107400 }, 50.1385)).toBe(`≈${NBSP}1${NBSP}640–2${NBSP}140${NBSP}€`);
    expect(formatRate(50.1385)).toBe("50,14");
  });

  it("the ₴/€ toggle swaps the main and the second line", () => {
    const rate = { rate: 50.1385 };
    const r = { low: 36800, high: 36800 };
    expect(moneyLines(r, "UAH", rate)).toEqual({ main: `36${NBSP}800${NBSP}₴`, second: `≈${NBSP}730${NBSP}€` });
    expect(moneyLines(r, "EUR", rate)).toEqual({ main: `730${NBSP}€`, second: `36${NBSP}800${NBSP}₴` });
    // no rate → always UAH
    expect(moneyLines(r, "EUR", null)).toEqual({ main: `36${NBSP}800${NBSP}₴`, second: null });
  });

  it("dates, plurals", () => {
    expect(formatDateUk("2026-10-09")).toBe("9 жовтня 2026");
    expect(formatDateUk("2026-01-31T23:00:00Z")).toBe("31 січня 2026");
    expect(formatDateUk("bad")).toBe("bad");
    expect([1, 2, 5, 11, 21, 22].map((n) => pluralUk(n, "зуб", "зуби", "зубів"))).toEqual(["зуб", "зуби", "зубів", "зубів", "зуб", "зуби"]);
    expect(teethText(14)).toBe("14 зубів");
  });
});
