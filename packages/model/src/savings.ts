import type { Catalog } from "./catalog";
import { isEvent, type TraceEvent } from "./events";
import { bucketWidth } from "./stats";

/**
 * Context savings, estimated the way Ratel Cloud does (`lib/quality/tokens.ts`):
 * without Ratel every turn would carry the whole tool catalog; with it, a search
 * returns `avgReturned` of `entryCount` tools. Tokens are `ceil(chars / 4)`.
 */
export interface SavingsEstimate {
  /** Where the catalog size came from. */
  basis: "definitions" | "payload" | "none";
  fullCatalogTokens: number;
  entryCount: number;
  searches: number;
  avgReturned: number;
  servedTokensPerSearch: number;
  savedPerSearch: number;
  savedTotal: number;
  series: { start: number; searches: number; saved: number }[];
}

/** ratel-local's fallback when only a tool count is known. */
export const TOKENS_PER_TOOL_FALLBACK = 130;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function catalogSize(events: readonly TraceEvent[], catalog: Catalog) {
  const defined = catalog.tools.filter((t) => t.defined && !t.removed);
  if (defined.length > 0) {
    const tokens = defined.reduce(
      (sum, t) =>
        sum + estimateTokens(`${t.name}\n${t.description}\n${JSON.stringify(t.inputSchema ?? {})}`),
      0,
    );
    return { basis: "definitions" as const, tokens, count: defined.length };
  }
  const perServer = new Map<string, { tokens: number; count: number }>();
  for (const e of events) {
    if (isEvent(e, "upstream_register") && !perServer.has(e.server)) {
      perServer.set(e.server, { tokens: e.tool_count * TOKENS_PER_TOOL_FALLBACK, count: e.tool_count });
    } else if (isEvent(e, "ratel_tool_payload")) {
      perServer.set(e.server, { tokens: e.estimated_tokens, count: e.tool_count });
    }
  }
  if (perServer.size === 0) return { basis: "none" as const, tokens: 0, count: 0 };
  let tokens = 0;
  let count = 0;
  for (const s of perServer.values()) {
    tokens += s.tokens;
    count += s.count;
  }
  return { basis: "payload" as const, tokens, count };
}

export function estimateSavings(events: readonly TraceEvent[], catalog: Catalog): SavingsEstimate {
  const size = catalogSize(events, catalog);
  const coreSearchSessions = new Set(events.filter((e) => e.type === "search").map((e) => e.sessionId));
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
    const first = searches[0]?.ts ?? 0;
    const last = searches.at(-1)?.ts ?? first;
    const width = bucketWidth(first, last);
    const buckets = new Map<number, number>();
    for (const s of searches) {
      const start = Math.floor(s.ts / width) * width;
      buckets.set(start, (buckets.get(start) ?? 0) + 1);
    }
    for (const [start, n] of [...buckets].sort((a, b) => a[0] - b[0])) {
      series.push({ start, searches: n, saved: n * savedPerSearch });
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
