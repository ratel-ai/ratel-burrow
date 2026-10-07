import type { Catalog } from "./catalog.js";
import { isEvent, type TraceEvent } from "./events.js";
import { bucketWidth } from "./stats.js";

/**
 * Context savings, estimated the way Ratel Cloud does (`lib/quality/tokens.ts`):
 * without Ratel every turn would carry the whole tool catalog; with it, a search
 * returns `avgReturned` of `entryCount` tools. Tokens are `ceil(chars / 4)`.
 */
export interface SavingsEstimate {
  /** `none` until tool definitions are recorded (they size the catalog). */
  basis: "definitions" | "none";
  fullCatalogTokens: number;
  entryCount: number;
  searches: number;
  avgReturned: number;
  servedTokensPerSearch: number;
  savedPerSearch: number;
  savedTotal: number;
  /** Every bucket from the first search to the last (empty ones included), with a running total. */
  series: { start: number; searches: number; saved: number; cumulative: number }[];
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function catalogSize(catalog: Catalog) {
  const defined = catalog.tools.filter((t) => t.defined && !t.removed);
  if (defined.length === 0) return { basis: "none" as const, tokens: 0, count: 0 };
  const tokens = defined.reduce(
    (sum, t) =>
      sum + estimateTokens(`${t.name}\n${t.description}\n${JSON.stringify(t.inputSchema ?? {})}`),
    0,
  );
  return { basis: "definitions" as const, tokens, count: defined.length };
}

export function estimateSavings(events: readonly TraceEvent[], catalog: Catalog): SavingsEstimate {
  const size = catalogSize(catalog);
  const coreSearchSessions = new Set(
    events.filter((e) => e.type === "search").map((e) => e.sessionId),
  );
  const searches: { ts: number; returned: number }[] = [];
  for (const e of events) {
    if (isEvent(e, "search")) searches.push({ ts: e.ts, returned: e.hits.length });
    else if (isEvent(e, "gateway_search") && !coreSearchSessions.has(e.sessionId)) {
      searches.push({ ts: e.ts, returned: e.hits });
    }
  }
  const avgReturned = searches.length
    ? searches.reduce((sum, s) => sum + s.returned, 0) / searches.length
    : 0;
  const share = size.count > 0 ? Math.min(1, avgReturned / size.count) : 1;
  const served = Math.round(size.tokens * share);
  const savedPerSearch = Math.max(0, size.tokens - served);

  const series: SavingsEstimate["series"] = [];
  if (searches.length > 0) {
    const first = searches.reduce((min, s) => Math.min(min, s.ts), Number.POSITIVE_INFINITY);
    const last = searches.reduce((max, s) => Math.max(max, s.ts), first);
    const width = bucketWidth(first, last);
    const buckets = new Map<number, number>();
    for (const s of searches) {
      const start = Math.floor(s.ts / width) * width;
      buckets.set(start, (buckets.get(start) ?? 0) + 1);
    }
    let cumulative = 0;
    for (let start = Math.floor(first / width) * width; start <= last; start += width) {
      const n = buckets.get(start) ?? 0;
      cumulative += n * savedPerSearch;
      series.push({ start, searches: n, saved: n * savedPerSearch, cumulative });
    }
  }

  return {
    basis: size.basis,
    fullCatalogTokens: size.tokens,
    entryCount: size.count,
    searches: searches.length,
    avgReturned,
    servedTokensPerSearch: served,
    savedPerSearch,
    savedTotal: savedPerSearch * searches.length,
    series,
  };
}
