import { describe, expect, it } from "vitest";
import { buildBoostStats } from "../src/adaptive";
import { parseTraceLog } from "../src/events";
import { v1Events, v2Events } from "./helpers";

describe("buildBoostStats", () => {
  it("is inactive when no usage_boost events exist", () => {
    expect(buildBoostStats(v1Events()).active).toBe(false);
  });

  it("measures match rate and promotions", () => {
    const s = buildBoostStats(v2Events());
    expect(s).toMatchObject({ active: true, boosts: 2, matched: 1, matchRate: 0.5, promoted: 1 });
    expect(s.series.reduce((n, b) => n + b.boosts, 0)).toBe(2);
  });

  it("collects mismatch warnings", () => {
    const log = parseTraceLog(
      '{"v":2,"ts":1,"session_id":"s","type":"usage_model_mismatch","built":"a","active":"b","dim_mismatch":true}',
    );
    expect(buildBoostStats(log.events).warnings).toEqual([expect.stringContaining("built with a")]);
  });
});
