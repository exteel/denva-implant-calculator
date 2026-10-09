import { describe, it, expect } from "vitest";
import { formatNumber, formatPct, formatRange, formatUah, pluralUk } from "./format";

const NB = " ";

describe("format", () => {
  it("formatNumber groups thousands with nbsp", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(52000)).toBe(`52${NB}000`);
    expect(formatNumber(1234567)).toBe(`1${NB}234${NB}567`);
    expect(formatNumber(12.5)).toBe("12,5");
  });

  it("formatUah", () => {
    expect(formatUah(52000)).toBe(`52${NB}000${NB}грн`);
    expect(formatUah(1500)).toBe(`1${NB}500${NB}грн`);
  });

  it("formatRange uses an en dash", () => {
    expect(formatRange({ p25: 46000, median: 52000, p75: 59000 })).toBe(
      `46${NB}000–59${NB}000${NB}грн`,
    );
  });

  it("formatPct uses a true minus", () => {
    expect(formatPct(31)).toBe("+31%");
    expect(formatPct(-12)).toBe("−12%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(30.6)).toBe("+31%");
  });

  it("pluralUk", () => {
    const f = (n: number) => pluralUk(n, "зуб", "зуби", "зубів");
    expect(f(1)).toBe("зуб");
    expect(f(2)).toBe("зуби");
    expect(f(4)).toBe("зуби");
    expect(f(5)).toBe("зубів");
    expect(f(11)).toBe("зубів");
    expect(f(12)).toBe("зубів");
    expect(f(21)).toBe("зуб");
    expect(f(22)).toBe("зуби");
    expect(f(100)).toBe("зубів");
    expect(f(0)).toBe("зубів");
  });
});
