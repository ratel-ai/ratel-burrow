import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/catalog";
import {
  catalogRangeLabel,
  catalogTableParams,
  definitionTokens,
  filterCatalogRows,
  nextSortDirection,
  presentProvenances,
  provenanceOf,
  resolveCatalogView,
  sortCatalogRows,
} from "../src/catalog-table";

function entry(id: string, patch: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    kind: "tool",
    id,
    name: id,
    defined: true,
    description: "",
    searchableDescription: "",
    searchableOverridden: false,
    tags: [],
    inputSchema: null,
    outputSchema: null,
    removed: false,
    firstSeen: null,
    lastSeen: null,
    stats: { retrieved: 0, invoked: 0, errors: 0, avgLatencyMs: null, p95LatencyMs: null },
    ...patch,
  };
}

const stats = (invoked: number, retrieved = 0) => ({
  retrieved,
  invoked,
  errors: 0,
  avgLatencyMs: null,
  p95LatencyMs: null,
});

describe("resolveCatalogView", () => {
  it("defaults to calls descending, 25 a page, page 1", () => {
    expect(resolveCatalogView({})).toEqual({
      query: "",
      provenance: "all",
      sort: "calls",
      direction: "desc",
      page: 1,
      pageSize: 25,
      offset: 0,
    });
  });

  it("rejects unknown values and bounds the page by the filtered total", () => {
    const view = resolveCatalogView(
      { sort: "cost", dir: "sideways", pageSize: "30", page: "9", provenance: "cloud" },
      60,
    );
    expect(view).toMatchObject({ sort: "calls", direction: "desc", pageSize: 25, page: 3 });
    expect(view.provenance).toBe("all");
    expect(view.offset).toBe(50);
  });

  it("round-trips through the URL, omitting defaults", () => {
    const view = resolveCatalogView({
      q: "task",
      sort: "name",
      dir: "asc",
      page: "2",
      pageSize: "50",
      provenance: "observed",
    });
    expect(catalogTableParams(view)).toEqual({
      q: "task",
      sort: "name",
      dir: "asc",
      page: "2",
      pageSize: "50",
      provenance: "observed",
    });
    expect(catalogTableParams(resolveCatalogView({}))).toEqual({});
  });
});

describe("filter and sort", () => {
  const rows = [
    entry("create_task", { description: "Create a task", stats: stats(5, 9) }),
    entry("delete_task", { stats: stats(5, 2) }),
    entry("search_docs", { defined: false, description: "Find documents", stats: stats(9) }),
  ];

  it("matches name or description and the provenance facet", () => {
    const view = resolveCatalogView({});
    expect(filterCatalogRows(rows, { ...view, query: "DOCUMENTS" }).map((r) => r.id)).toEqual([
      "search_docs",
    ]);
    expect(filterCatalogRows(rows, { ...view, provenance: "defined" }).map((r) => r.id)).toEqual([
      "create_task",
      "delete_task",
    ]);
  });

  it("sorts by calls, then retrieved, then name, never in place", () => {
    const sorted = sortCatalogRows(rows, "calls", "desc");
    expect(sorted.map((r) => r.id)).toEqual(["search_docs", "create_task", "delete_task"]);
    expect(rows[0]?.id).toBe("create_task");
    expect(sortCatalogRows(rows, "name", "desc").map((r) => r.id)).toEqual([
      "search_docs",
      "delete_task",
      "create_task",
    ]);
  });

  it("puts never-seen rows last when sorting by last seen", () => {
    const seen = [
      entry("a", { lastSeen: null }),
      entry("b", { lastSeen: 2 }),
      entry("c", { lastSeen: 1 }),
    ];
    expect(sortCatalogRows(seen, "lastSeen", "desc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by definition tokens", () => {
    const sized = [entry("short"), entry("long", { description: "x".repeat(400) })];
    expect(sortCatalogRows(sized, "tokens", "desc").map((r) => r.id)).toEqual(["long", "short"]);
    expect(definitionTokens(entry("u", { defined: false }))).toBeNull();
  });
});

describe("helpers", () => {
  it("flips the active column and starts new ones at their natural end", () => {
    expect(nextSortDirection({ sort: "calls", direction: "desc" }, "calls")).toBe("asc");
    expect(nextSortDirection({ sort: "calls", direction: "desc" }, "name")).toBe("asc");
    expect(nextSortDirection({ sort: "name", direction: "asc" }, "tokens")).toBe("desc");
  });

  it("labels the visible range", () => {
    expect(catalogRangeLabel(25, 25, 99)).toBe("26–50 of 99");
    expect(catalogRangeLabel(0, 0, 0)).toBe("0 of 0");
  });

  it("lists only the provenances present", () => {
    expect(provenanceOf(entry("a", { defined: false }))).toBe("observed");
    expect(presentProvenances([entry("a")])).toEqual(["defined"]);
  });
});
