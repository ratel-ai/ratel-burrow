import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog";
import { estimateSavings, estimateTokens } from "../src/savings";
import { v1Events, v2Events } from "./helpers";

describe("estimateTokens", () => {
  it("is ceil(chars / 4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("estimateSavings", () => {
  it("needs tool definitions to size the catalog", () => {
    const events = v1Events();
    const s = estimateSavings(events, buildCatalog(events));
    expect(s).toMatchObject({ basis: "none", fullCatalogTokens: 0, searches: 2, savedTotal: 0 });
  });

  it("uses tool definitions when present", () => {
    const events = v2Events();
    const s = estimateSavings(events, buildCatalog(events));
    expect(s.basis).toBe("definitions");
    expect(s.entryCount).toBe(2);
    expect(s.fullCatalogTokens).toBeGreaterThan(0);
    expect(s.savedTotal).toBeGreaterThanOrEqual(0);
  });

  it("is zero, not NaN, with no data", () => {
    const s = estimateSavings([], buildCatalog([]));
    expect(s).toMatchObject({ basis: "none", savedTotal: 0, savedPerSearch: 0 });
  });

  it("fills empty buckets and keeps a running total, so the series is a true timeline", () => {
    const all = v2Events();
    const search = all.find((e) => e.type === "search");
    if (!search) throw new Error("fixture has no search");
    const t0 = Date.UTC(2026, 0, 1);
    const hour = 3_600_000;
    const events = [
      ...all.filter((e) => e.type !== "search" && e.type !== "gateway_search"),
      { ...search, ts: t0 },
      { ...search, ts: t0 + 10 * hour },
    ];
    const s = estimateSavings(events, buildCatalog(events));
    const starts = s.series.map((b) => b.start);
    const steps = new Set(starts.slice(1).map((x, i) => x - (starts[i] ?? 0)));
    expect(steps.size).toBe(1);
    expect(s.series.length).toBeGreaterThan(2);
    expect(s.series.filter((b) => b.searches > 0)).toHaveLength(2);
    expect(s.series.at(-1)?.cumulative).toBe(s.savedTotal);
    expect(s.series[1]?.cumulative).toBe(s.series[0]?.saved);
  });
});
