/**
 * One definition of "did search find the tool", used on every page.
 *
 * Each call linked to a tool or skill search gets an outcome from where that
 * search ranked it. A search that recorded only a hit count (a gateway search)
 * makes the rank unknowable, so its calls are `unknown` and sit outside the
 * denominator of every rate.
 *
 * - First result right = first ÷ ranked
 * - In results = (ranked − missed) ÷ ranked
 * - Missed by search = missed
 *
 * A `baseline` search was only observed: the agent chose from its own full tool
 * list, not Ratel's results. Its calls keep their outcome but stay out of the
 * rates (`servedOnly`), so a miss there is not counted against Ratel.
 */
import type { Origin } from "./events.js";
import type { SessionTimeline } from "./inspector.js";

export type Outcome = "first" | "top3" | "lower" | "missed" | "unknown";

export interface CallOutcome {
  kind: "tool" | "skill";
  id: string;
  outcome: Outcome;
  /** Who made the search: the agent, your code (`direct`), or observed only (`baseline`). */
  origin: Origin;
  rank: number | null;
  failed: boolean;
  ts: number;
  sessionId: string;
  searchKey: string;
  query: string;
}

export interface OutcomeSummary {
  calls: number;
  /** Calls whose rank is knowable: the denominator of every rate. */
  ranked: number;
  first: number;
  top3: number;
  lower: number;
  missed: number;
  failed: number;
}

export interface CapabilityOutcomes extends OutcomeSummary {
  /** Known ranks of this capability's calls, for medians. */
  ranks: number[];
}

export function callOutcomes(sessions: readonly SessionTimeline[]): CallOutcome[] {
  const out: CallOutcome[] = [];
  for (const session of sessions) {
    for (const search of session.searches) {
      if (search.kind !== "tool" && search.kind !== "skill") continue;
      const knowsHits = search.hits.length > 0 || search.hitCount === 0;
      for (const call of search.invocations) {
        out.push({
          kind: call.kind,
          id: call.id,
          outcome: !knowsHits
            ? "unknown"
            : call.rank === null
              ? "missed"
              : call.rank === 1
                ? "first"
                : call.rank <= 3
                  ? "top3"
                  : "lower",
          origin: search.origin,
          rank: knowsHits ? call.rank : null,
          failed: call.error !== null,
          ts: call.ts,
          sessionId: search.sessionId,
          searchKey: search.key,
          query: search.query,
        });
      }
    }
  }
  return out;
}

/** Calls after searches Ratel actually served: everything but `baseline`. */
export function servedOnly(outcomes: readonly CallOutcome[]): CallOutcome[] {
  return outcomes.filter((o) => o.origin !== "baseline");
}

const emptySummary = (): OutcomeSummary => ({
  calls: 0,
  ranked: 0,
  first: 0,
  top3: 0,
  lower: 0,
  missed: 0,
  failed: 0,
});

function add(summary: OutcomeSummary, o: CallOutcome) {
  summary.calls += 1;
  if (o.failed) summary.failed += 1;
  if (o.outcome === "unknown") return;
  summary.ranked += 1;
  summary[o.outcome] += 1;
}

export function summarizeOutcomes(outcomes: readonly CallOutcome[]): OutcomeSummary {
  const summary = emptySummary();
  for (const o of outcomes) add(summary, o);
  return summary;
}

export function outcomesByCapability(
  outcomes: readonly CallOutcome[],
): Map<string, CapabilityOutcomes> {
  const by = new Map<string, CapabilityOutcomes>();
  for (const o of outcomes) {
    const key = `${o.kind}:${o.id}`;
    let summary = by.get(key);
    if (!summary) {
      summary = { ...emptySummary(), ranks: [] };
      by.set(key, summary);
    }
    add(summary, o);
    if (o.rank !== null) summary.ranks.push(o.rank);
  }
  return by;
}

export function firstResultRate(s: OutcomeSummary): number | null {
  return s.ranked > 0 ? s.first / s.ranked : null;
}

export function inResultsRate(s: OutcomeSummary): number | null {
  return s.ranked > 0 ? (s.ranked - s.missed) / s.ranked : null;
}
