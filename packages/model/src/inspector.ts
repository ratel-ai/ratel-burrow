import { attachBoosts } from "./boost/attach.js";
import { type EventOf, isEvent, type Origin, type SearchStage, type TraceEvent } from "./events.js";
import { collectInvocations, type Invocation } from "./invocations.js";

export type SearchKind = "tool" | "skill" | "fact";

export interface LinkedInvocation extends Invocation {
  /** 1-based position in the linked search's hits; `null` when it was not retrieved. */
  rank: number | null;
}

export type BoostInfo = Pick<
  EventOf<"usage_boost">,
  "intent" | "similarity" | "support" | "promoted" | "dropped"
>;

export interface SearchRecord {
  key: string;
  kind: SearchKind;
  ts: number;
  sessionId: string;
  turnId?: string;
  query: string;
  origin: Origin;
  topK: number;
  hits: { id: string; score: number }[];
  /** Equals `hits.length`, except for gateway-only records, which carry a count but no ids. */
  hitCount: number;
  stages: SearchStage[];
  tookMs: number;
  boost?: BoostInfo;
  invocations: LinkedInvocation[];
}

export interface SessionStats {
  searches: number;
  invocations: number;
  errors: number;
  /** Calls whose tool was not in the linked search's hits. */
  notRetrieved: number;
  emptySearches: number;
}

export interface SessionTimeline {
  sessionId: string;
  sourceId?: string;
  start: number;
  end: number;
  searches: SearchRecord[];
  /** Calls made before the session's first search. */
  orphans: LinkedInvocation[];
  stats: SessionStats;
}

function searchRecord(e: TraceEvent, index: number): SearchRecord | null {
  const common = {
    key: `${e.sessionId}:${index}`,
    ts: e.ts,
    sessionId: e.sessionId,
    ...(e.turnId ? { turnId: e.turnId } : {}),
    invocations: [],
  };
  if (isEvent(e, "search") || isEvent(e, "skill_search") || isEvent(e, "fact_search")) {
    const kind: SearchKind =
      e.type === "search" ? "tool" : e.type === "skill_search" ? "skill" : "fact";
    const hits = e.hits.map((h) => ({
      id: "tool_id" in h ? h.tool_id : "skill_id" in h ? h.skill_id : h.fact_id,
      score: h.score,
    }));
    return {
      ...common,
      kind,
      query: e.query,
      origin: e.origin,
      topK: e.top_k,
      hits,
      hitCount: hits.length,
      stages: e.stages ?? [],
      tookMs: e.took_ms,
    };
  }
  if (isEvent(e, "gateway_search")) {
    return {
      ...common,
      kind: "tool",
      query: e.query,
      origin: e.origin,
      topK: e.top_k,
      hits: [],
      hitCount: e.hits,
      stages: [],
      tookMs: e.took_ms,
    };
  }
  return null;
}

/** Per-session timelines of searches and the calls each one led to, newest session first. */
export function buildInspector(events: readonly TraceEvent[]): SessionTimeline[] {
  const bySession = new Map<string, TraceEvent[]>();
  for (const e of events) {
    const list = bySession.get(e.sessionId);
    if (list) list.push(e);
    else bySession.set(e.sessionId, [e]);
  }
  const calls = collectInvocations(events);
  const boosts = attachBoosts(events);

  const sessions: SessionTimeline[] = [];
  for (const [sessionId, list] of bySession) {
    const hasCoreSearch = list.some((e) => e.type === "search");
    const searches: SearchRecord[] = [];
    list.forEach((e, i) => {
      if (e.type === "gateway_search" && hasCoreSearch) return;
      const record = searchRecord(e, i);
      if (!record) return;
      const boost = (isEvent(e, "search") || isEvent(e, "skill_search")) && boosts.get(e);
      if (boost) {
        record.boost = {
          intent: boost.intent,
          similarity: boost.similarity,
          support: boost.support,
          promoted: boost.promoted,
          dropped: boost.dropped,
        };
      }
      searches.push(record);
    });

    const orphans: LinkedInvocation[] = [];
    for (const call of calls) {
      if (call.sessionId !== sessionId) continue;
      const want: SearchKind = call.kind;
      let linked: SearchRecord | undefined;
      for (const s of searches) {
        if (s.kind !== want || s.ts > call.ts) continue;
        if (call.turnId && s.turnId && call.turnId !== s.turnId) continue;
        linked = s;
      }
      if (!linked) {
        orphans.push({ ...call, rank: null });
        continue;
      }
      const index = linked.hits.findIndex((h) => h.id === call.id);
      linked.invocations.push({ ...call, rank: index >= 0 ? index + 1 : null });
    }

    const linkedCalls = searches.flatMap((s) => s.invocations);
    const allCalls = [...linkedCalls, ...orphans];
    const times = list.map((e) => e.ts);
    const sourceId = list.find((e) => e.sourceId)?.sourceId;
    sessions.push({
      sessionId,
      ...(sourceId ? { sourceId } : {}),
      start: Math.min(...times),
      end: Math.max(...times),
      searches,
      orphans,
      stats: {
        searches: searches.length,
        invocations: allCalls.length,
        errors: allCalls.filter((c) => c.error !== null).length,
        notRetrieved: searches
          .filter((s) => s.hits.length > 0 || s.hitCount === 0)
          .flatMap((s) => s.invocations)
          .filter((c) => c.rank === null).length,
        emptySearches: searches.filter((s) => s.hitCount === 0).length,
      },
    });
  }
  return sessions.sort((a, b) => b.end - a.end);
}
