import { isEvent, type TraceEvent } from "./events.js";
import { buildInspector } from "./inspector.js";
import { bucketWidth, mean } from "./stats.js";

export interface BoostBucket {
  start: number;
  /** Searches that consulted the intent graph. */
  boosts: number;
  /** Of those, how many matched a cluster. */
  matched: number;
  promoted: number;
  /** Mean 1-based rank of the invoked tool in its search, for calls that were retrieved. */
  meanInvokedRank: number | null;
  /** Share of calls whose tool was not in the search's hits. */
  missShare: number | null;
}

/** Is adaptive ranking doing anything? Read from `usage_boost` events (Ratel ADR-0014). */
export interface BoostStats {
  active: boolean;
  boosts: number;
  matched: number;
  matchRate: number;
  promoted: number;
  dropped: number;
  series: BoostBucket[];
  warnings: string[];
}

export function buildBoostStats(events: readonly TraceEvent[]): BoostStats {
  const boosts = events.filter((e) => isEvent(e, "usage_boost"));
  const warnings: string[] = [];
  for (const e of events) {
    if (isEvent(e, "usage_model_mismatch")) {
      warnings.push(
        `The intent graph was built with ${e.built} but ${e.active} is active${e.dim_mismatch ? " (different dimensions)" : ""}; it falls back to lexical matching.`,
      );
    } else if (isEvent(e, "usage_cluster_policy_changed")) {
      warnings.push(
        `Cluster policy changed from similarity ${e.built_similarity}/coverage ${e.built_coverage} to ${e.active_similarity}/${e.active_coverage}.`,
      );
    }
  }

  let matched = 0;
  let promoted = 0;
  let dropped = 0;
  for (const e of boosts) {
    if (!isEvent(e, "usage_boost")) continue;
    if (e.intent !== null) matched += 1;
    promoted += e.promoted;
    dropped += e.dropped;
  }

  const series: BoostBucket[] = [];
  const searches = buildInspector(events)
    .flatMap((s) => s.searches)
    .filter((s) => s.kind === "tool");
  const times = [...boosts.map((e) => e.ts), ...searches.map((s) => s.ts)];
  if (times.length > 0) {
    const width = bucketWidth(Math.min(...times), Math.max(...times));
    const buckets = new Map<
      number,
      {
        boosts: number;
        matched: number;
        promoted: number;
        ranks: number[];
        calls: number;
        misses: number;
      }
    >();
    const bucket = (ts: number) => {
      const start = Math.floor(ts / width) * width;
      let b = buckets.get(start);
      if (!b) {
        b = { boosts: 0, matched: 0, promoted: 0, ranks: [], calls: 0, misses: 0 };
        buckets.set(start, b);
      }
      return b;
    };
    for (const e of boosts) {
      if (!isEvent(e, "usage_boost")) continue;
      const b = bucket(e.ts);
      b.boosts += 1;
      if (e.intent !== null) b.matched += 1;
      b.promoted += e.promoted;
    }
    for (const s of searches) {
      if (s.hits.length === 0 && s.hitCount > 0) continue; // gateway-only: no ranks
      const b = bucket(s.ts);
      for (const call of s.invocations) {
        b.calls += 1;
        if (call.rank === null) b.misses += 1;
        else b.ranks.push(call.rank);
      }
    }
    for (const [start, b] of [...buckets].sort((x, y) => x[0] - y[0])) {
      series.push({
        start,
        boosts: b.boosts,
        matched: b.matched,
        promoted: b.promoted,
        meanInvokedRank: mean(b.ranks),
        missShare: b.calls ? b.misses / b.calls : null,
      });
    }
  }

  return {
    active: boosts.length > 0,
    boosts: boosts.length,
    matched,
    matchRate: boosts.length ? matched / boosts.length : 0,
    promoted,
    dropped,
    series,
    warnings,
  };
}
