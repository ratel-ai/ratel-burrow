import { isEvent, type TraceEvent } from "../events.js";
import type { ArmRanking, EvaluableSelection } from "./ground-truth.js";
import { BOOST_BASELINE_ARM, BOOST_TREATMENT_ARM } from "./view.js";

/**
 * Selections for the Boost panel, straight from the trace (Ratel Cloud's
 * "reported" path): no experiment needed, but the runtime must emit `base_hits`
 * on searches an intent graph changed, and `usage_ranking_status`.
 *
 * One selection per turn that invoked a tool: the turn's latest tool search
 * before its first `invoke_start`. A turn is `session:turn_id`, or, for events
 * without a turn id, a search together with the invocations that follow it.
 *
 * - Online (adaptive ranking was active at the search): `adaptive` served the
 *   hits, and `baseline` shadowed with `base_hits`. No `base_hits` means the
 *   usage arm changed nothing, so the baseline equals what was served.
 * - Offline: only `baseline` ran, and it served.
 *
 * Active means the latest `usage_ranking_status` before the search was
 * `active` (for `graphKey`, when given); without status events, a
 * `usage_boost` on the same turn marks the search as ranked by the graph.
 */
export function buildBoostSelections(
  events: readonly TraceEvent[],
  options: { graphKey?: string } = {},
): EvaluableSelection[] {
  const hasStatus = events.some(
    (e) =>
      isEvent(e, "usage_ranking_status") &&
      (options.graphKey === undefined || e.graph_key === options.graphKey),
  );
  const boostedTurns = new Set<string>();
  const turnKey = (e: TraceEvent, fallback: number) =>
    e.turnId ? `${e.sessionId}:${e.turnId}` : `${e.sessionId}:#${fallback}`;

  // Pass 1, the fallback without status events: the core emits `usage_boost` on
  // every search a graph is attached to (matched or not), so any boost marks the turn.
  let lastSearchIndex = -1;
  events.forEach((e, i) => {
    if (isEvent(e, "search")) lastSearchIndex = i;
    else if (isEvent(e, "usage_boost")) boostedTurns.add(turnKey(e, lastSearchIndex));
  });

  interface Pending {
    search: Extract<TraceEvent, { type: "search" }>;
    active: boolean;
    invoked: string | null;
  }
  const turns = new Map<string, Pending>();
  const order: string[] = [];
  const active = new Map<string, boolean>(); // session → ranking active
  let searchIndex = -1;

  events.forEach((e, i) => {
    if (isEvent(e, "usage_ranking_status")) {
      if (options.graphKey === undefined || e.graph_key === options.graphKey) {
        active.set(e.sessionId, e.status === "active");
      }
      return;
    }
    if (isEvent(e, "search")) {
      searchIndex = i;
      const key = turnKey(e, i);
      const existing = turns.get(key);
      if (existing?.invoked) return; // the turn already invoked; later searches don't replace it
      const isActive = hasStatus ? (active.get(e.sessionId) ?? false) : boostedTurns.has(key);
      if (!existing) order.push(key);
      turns.set(key, { search: e, active: isActive, invoked: null });
      return;
    }
    if (isEvent(e, "invoke_start")) {
      const turn = turns.get(turnKey(e, searchIndex));
      if (turn && turn.invoked === null) turn.invoked = e.tool_id;
    }
  });

  const selections: EvaluableSelection[] = [];
  for (const key of order) {
    const turn = turns.get(key);
    if (!turn?.invoked) continue;
    const served = turn.search.hits.map((h) => h.tool_id);
    const base = turn.search.base_hits?.length
      ? turn.search.base_hits.map((h) => h.tool_id)
      : served;
    const arms: ArmRanking[] = turn.active
      ? [
          { arm: BOOST_TREATMENT_ARM, role: "serving", resultIds: served },
          { arm: BOOST_BASELINE_ARM, role: "shadow", resultIds: base },
        ]
      : [{ arm: BOOST_BASELINE_ARM, role: "serving", resultIds: served }];
    selections.push({
      selectionId: key,
      occurredAt: new Date(turn.search.ts),
      query: turn.search.query,
      arms,
      invokedToolId: turn.invoked,
    });
  }
  return selections;
}
