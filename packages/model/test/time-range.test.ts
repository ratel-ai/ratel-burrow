import { describe, expect, it } from "vitest";
import { inWindow, isRange, previousWindow, windowFor } from "../src/time-range";

const H = 3_600_000;
const latest = 1_000 * H;

describe("windowFor", () => {
  it("anchors to the latest event, not the clock, so stale data still shows", () => {
    expect(windowFor("24h", latest)).toEqual({ from: latest - 24 * H, to: latest });
    expect(windowFor("7d", latest)).toEqual({ from: latest - 7 * 24 * H, to: latest });
  });

  it("covers everything for all", () => {
    expect(windowFor("all", latest)).toEqual({ from: Number.NEGATIVE_INFINITY, to: latest });
  });

  it("has a previous window of the same length, none for all", () => {
    expect(previousWindow("30d", latest)).toEqual({
      from: latest - 60 * 24 * H,
      to: latest - 30 * 24 * H,
    });
    expect(previousWindow("all", latest)).toBeNull();
  });
});

describe("inWindow", () => {
  it("keeps events from (exclusive) to to (inclusive)", () => {
    const events = [{ ts: 1 }, { ts: 2 }, { ts: 3 }];
    expect(inWindow(events, { from: 1, to: 3 })).toEqual([{ ts: 2 }, { ts: 3 }]);
  });
});

describe("isRange", () => {
  it("accepts only known ranges", () => {
    expect(isRange("7d")).toBe(true);
    expect(isRange("1y")).toBe(false);
    expect(isRange(null)).toBe(false);
  });
});
