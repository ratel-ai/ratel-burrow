import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatCount,
  formatMs,
  formatPercent,
  plural,
  relativeTime,
} from "../src/format";

describe("format", () => {
  it("formats durations", () => {
    expect(formatMs(null)).toBe("–");
    expect(formatMs(12.4)).toBe("12 ms");
    expect(formatMs(0)).toBe("<1 ms");
    expect(formatMs(4200)).toBe("4.20 s");
    expect(formatMs(90_000)).toBe("1.5 min");
  });
  it("formats counts, percents and bytes", () => {
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(2_500_000)).toBe("2.5M");
    expect(formatPercent(0.456)).toBe("46%");
    expect(formatBytes(1500)).toBe("1.5 kB");
  });
  it("pluralizes", () => {
    expect(plural(1, "session")).toBe("1 session");
    expect(plural(3, "session")).toBe("3 sessions");
    expect(plural(2, "query", "queries")).toBe("2 queries");
  });
  it("formats relative times", () => {
    expect(relativeTime(null)).toBe("never");
    expect(relativeTime(0, 30_000)).toBe("just now");
    expect(relativeTime(0, 3 * 3_600_000)).toBe("3h ago");
  });
});
