import { describe, expect, it } from "vitest";

import { niceScale } from "./axis";
import { addDays, daysInclusive, fmtAxisGW, fmtGWh, fmtHours, fmtMW, fmtTime } from "./format";

describe("fmtMW (same rules as backend fmt_mw)", () => {
  it.each([
    [2022.47, false, "2.02 GW"],
    [1745.9, true, "+1.75 GW"],
    [-330, true, "−330 MW"],
    [14000, false, "14 GW"],
    [12345, false, "12.3 GW"],
    [0, true, "0 MW"],
    [null, false, "–"],
  ])("%s -> %s", (v, signed, expected) => {
    expect(fmtMW(v as number | null, { signed: signed as boolean })).toBe(expected);
  });
});

describe("other formatters", () => {
  it("formats axis ticks in GW", () => {
    expect(fmtAxisGW(12000)).toBe("12");
    expect(fmtAxisGW(2500)).toBe("2.5");
    expect(fmtAxisGW(-2000)).toBe("−2");
  });
  it("formats energy and durations", () => {
    expect(fmtGWh(278630)).toBe("278.6 GWh");
    expect(fmtHours(11 / 6)).toBe("1 h 50 min");
    expect(fmtHours(0)).toBe("0 min");
    expect(fmtHours(2)).toBe("2 h");
  });
  it("shows UK local time (GMT in January)", () => {
    expect(fmtTime("2026-01-14T07:30:00Z")).toBe("07:30");
  });
  it("shows UK local time (BST in summer)", () => {
    expect(fmtTime("2026-07-14T07:30:00Z")).toBe("08:30");
  });
  it("does date arithmetic across month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(daysInclusive("2026-01-30", "2026-02-01")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
    ]);
  });
});

describe("niceScale", () => {
  it("uses clean GW steps without excess headroom", () => {
    expect(niceScale([0, 21353])).toEqual({
      domain: [0, 25000],
      ticks: [0, 5000, 10000, 15000, 20000, 25000],
    });
    expect(niceScale([1650, 2410]).domain).toEqual([0, 2500]);
  });
  it("includes negative values (e.g. bias)", () => {
    const s = niceScale([-684, 2513]);
    expect(s.domain[0]).toBeLessThan(0);
    expect(s.ticks).toContain(0);
  });
  it("ignores null values", () => {
    expect(niceScale([null, undefined, 900]).domain).toEqual([0, 1000]);
  });
});
