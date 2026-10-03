/**
 * Filtering, sorting and paging for a catalog table, ported from Ratel Cloud's
 * `lib/catalogs/table-view.ts`. Cloud's Tokens and Cost columns come from its
 * OpenTelemetry usage; Burrow has the trace instead, so the columns here are
 * Calls, Retrieved and the definition's token estimate.
 */
import type { CatalogEntry } from "./catalog.js";
import { estimateTokens } from "./savings.js";

export type CatalogSortKey = "name" | "calls" | "retrieved" | "tokens" | "lastSeen";
export type SortDirection = "asc" | "desc";

/** `defined`: the SDK recorded its definition. `observed`: only its id was seen. */
export type CatalogProvenance = "defined" | "observed";
export type ProvenanceFilter = CatalogProvenance | "all";

export interface CatalogView {
  query: string;
  provenance: ProvenanceFilter;
  sort: CatalogSortKey;
  direction: SortDirection;
  page: number;
  pageSize: number;
  offset: number;
}

export const CATALOG_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_CATALOG_PAGE_SIZE = 25;
const DEFAULT_SORT: CatalogSortKey = "calls";
const DEFAULT_DIRECTION: SortDirection = "desc";
const SORT_KEYS: readonly CatalogSortKey[] = ["name", "calls", "retrieved", "tokens", "lastSeen"];
export const CATALOG_PROVENANCE_ORDER: readonly CatalogProvenance[] = ["defined", "observed"];

export const CATALOG_PROVENANCE: Record<CatalogProvenance, { label: string; hint: string }> = {
  defined: {
    label: "Defined",
    hint: "The SDK recorded this entry's definition: description, searchable text and schemas.",
  },
  observed: {
    label: "Observed",
    hint: "Only the id was seen in searches or calls; its definition was not recorded.",
  },
};

export function provenanceOf(entry: CatalogEntry): CatalogProvenance {
  return entry.defined ? "defined" : "observed";
}

/** What the entry costs in context when exposed: name, description and input schema, ÷ 4. */
export function definitionTokens(entry: CatalogEntry): number | null {
  if (!entry.defined) return null;
  return estimateTokens(
    `${entry.name}\n${entry.description}\n${JSON.stringify(entry.inputSchema ?? {})}`,
  );
}

/** Resolve filter, sort and a bounded one-based page from URL params. */
export function resolveCatalogView(
  params: Record<string, string | undefined>,
  total?: number,
): CatalogView {
  const requestedSize = Number(params.pageSize);
  const pageSize = (CATALOG_PAGE_SIZES as readonly number[]).includes(requestedSize)
    ? requestedSize
    : DEFAULT_CATALOG_PAGE_SIZE;
  const requestedPage = Number(params.page);
  const unbounded = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageCount =
    total === undefined ? unbounded : Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const page = Math.min(unbounded, pageCount);
  const provenance = params.provenance as ProvenanceFilter;
  return {
    query: params.q ?? "",
    provenance: provenance === "defined" || provenance === "observed" ? provenance : "all",
    sort: SORT_KEYS.includes(params.sort as CatalogSortKey)
      ? (params.sort as CatalogSortKey)
      : DEFAULT_SORT,
    direction: params.dir === "asc" ? "asc" : DEFAULT_DIRECTION,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

/** A view as URL params, omitting defaults so an untouched table has a clean URL. */
export function catalogTableParams(view: CatalogView): Record<string, string> {
  const out: Record<string, string> = {};
  if (view.query.trim() !== "") out.q = view.query;
  if (view.provenance !== "all") out.provenance = view.provenance;
  if (view.sort !== DEFAULT_SORT) out.sort = view.sort;
  if (view.direction !== DEFAULT_DIRECTION) out.dir = view.direction;
  if (view.page > 1) out.page = String(view.page);
  if (view.pageSize !== DEFAULT_CATALOG_PAGE_SIZE) out.pageSize = String(view.pageSize);
  return out;
}

/** Name-and-description substring match plus the provenance facet. */
export function filterCatalogRows(
  rows: readonly CatalogEntry[],
  view: Pick<CatalogView, "query" | "provenance">,
): CatalogEntry[] {
  const needle = view.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (view.provenance !== "all" && provenanceOf(row) !== view.provenance) return false;
    if (needle === "") return true;
    return (
      row.name.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle)
    );
  });
}

/** Sort a copy; ties fall through (calls → retrieved) and then to name, so paging is stable. */
export function sortCatalogRows(
  rows: readonly CatalogEntry[],
  sort: CatalogSortKey,
  direction: SortDirection,
): CatalogEntry[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const primary = compareBy(a, b, sort);
    if (primary !== 0) return primary * sign;
    if (sort === "calls") {
      const retrieved = compareBy(a, b, "retrieved");
      if (retrieved !== 0) return retrieved * sign;
    }
    return a.name.localeCompare(b.name);
  });
}

function compareBy(a: CatalogEntry, b: CatalogEntry, sort: CatalogSortKey): number {
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name);
    case "calls":
      return a.stats.invoked - b.stats.invoked;
    case "retrieved":
      return a.stats.retrieved - b.stats.retrieved;
    case "tokens":
      return (definitionTokens(a) ?? -1) - (definitionTokens(b) ?? -1);
    case "lastSeen":
      // Never-seen rows sort as oldest rather than jumping to the top.
      return (a.lastSeen ?? 0) - (b.lastSeen ?? 0);
  }
}

/** Clicking the active column flips it; a new column starts at its natural end. */
export function nextSortDirection(
  view: Pick<CatalogView, "sort" | "direction">,
  column: CatalogSortKey,
): SortDirection {
  if (view.sort !== column) return column === "name" ? "asc" : "desc";
  return view.direction === "asc" ? "desc" : "asc";
}

/** Human-readable position of one page within its filtered result set. */
export function catalogRangeLabel(offset: number, rowCount: number, total: number): string {
  const fmt = (n: number) => n.toLocaleString("en-US");
  if (rowCount === 0) return `0 of ${fmt(total)}`;
  return `${fmt(offset + 1)}–${fmt(Math.min(offset + rowCount, total))} of ${fmt(total)}`;
}

/** Which provenances the rows actually contain, so the facet offers nothing empty. */
export function presentProvenances(rows: readonly CatalogEntry[]): CatalogProvenance[] {
  return CATALOG_PROVENANCE_ORDER.filter((p) => rows.some((row) => provenanceOf(row) === p));
}
