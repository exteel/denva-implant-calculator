import { describe, expect, it } from "vitest";
import { computeChanges, type Original } from "./benchmarks";

const original: Original = {
  values: new Map([["IMPLANT_INSTALL|classic", 18000]]),
  modes: new Map([["CROWN_IMPLANT|classic", { mode: "manual_override" as const, override_value: 9000 }]]),
};

describe("computeChanges", () => {
  it("detects changed, cleared and unchanged values", () => {
    const r = computeChanges(
      { "IMPLANT_INSTALL|classic": { value: "19 000" }, "IMPLANT_INSTALL|minimum": { value: "12000" }, "HEALING_ABUTMENT|classic": { value: "" } },
      original,
      "country",
    );
    expect(r.changes).toEqual([
      { service_code: "IMPLANT_INSTALL", tier: "classic", value: 19000 },
      { service_code: "IMPLANT_INSTALL", tier: "minimum", value: 12000 },
    ]);
    expect(computeChanges({ "IMPLANT_INSTALL|classic": { value: "" } }, original, "region").changes[0].value).toBeNull();
    expect(computeChanges({ "IMPLANT_INSTALL|classic": { value: "18000" } }, original, "region").changes).toEqual([]);
  });

  it("rejects non-positive and non-numeric values", () => {
    const r = computeChanges({ "A|classic": { value: "0" }, "B|classic": { value: "abc" } }, original, "country");
    expect([...r.invalid.keys()]).toEqual(["A|classic", "B|classic"]);
  });

  it("override requires a value and forces a reason", () => {
    const noValue = computeChanges({ "SCAN_JAW_STAGE|common": { mode: "manual_override" } }, original, "city");
    expect(noValue.invalid.get("SCAN_JAW_STAGE|common")).toMatch(/Override/);
    expect(noValue.changes).toEqual([]);

    const ok = computeChanges({ "SCAN_JAW_STAGE|common": { mode: "manual_override", override: "1 500" } }, original, "city");
    expect(ok.invalid.size).toBe(0);
    expect(ok.changes).toEqual([{ service_code: "SCAN_JAW_STAGE", tier: "common", mode: "manual_override", overrideValue: 1500 }]);
    expect(ok.needsReason).toBe(true);
  });

  it("editing the override value of an active override, and switching back to auto", () => {
    const edit = computeChanges({ "CROWN_IMPLANT|classic": { override: "9500" } }, original, "city");
    expect(edit.changes).toEqual([{ service_code: "CROWN_IMPLANT", tier: "classic", mode: "manual_override", overrideValue: 9500 }]);
    const same = computeChanges({ "CROWN_IMPLANT|classic": { override: "9000" } }, original, "city");
    expect(same.changes).toEqual([]);
    const back = computeChanges({ "CROWN_IMPLANT|classic": { mode: "auto" } }, original, "city");
    expect(back.changes).toEqual([{ service_code: "CROWN_IMPLANT", tier: "classic", mode: "auto" }]);
    expect(back.needsReason).toBe(false);
  });

  it("ignores modes outside the city scope", () => {
    expect(computeChanges({ "A|classic": { mode: "manual_override" } }, original, "region").changes).toEqual([]);
  });
});
