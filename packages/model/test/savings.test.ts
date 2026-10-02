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
});
