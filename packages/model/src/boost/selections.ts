import { type EventOf, isEvent, type TraceEvent } from "../events.js";
import { attachBoosts } from "./attach.js";
import type { ArmRanking, EvaluableSelection } from "./ground-truth.js";
import { BOOST_BASELINE_ARM, BOOST_TREATMENT_ARM, type BoostView, buildBoostView } from "./view.js";

export interface BoostSelectionOptions {
  /** Only count `usage_ranking_status` reports for this graph. */
  graphKey?: string;
}

/**
 * Whether this runtime reports both rankings: it emits `usage_ranking_status`
 * or has written `base_hits` on some search (Ratel RC-204 and later). Before
 * that, a search carries only what was served, and the ranking without the
 * graph is unknown.
 */
export function reportsBaseHits(events: readonly TraceEvent[]): boolean {
  return events.some(
    (e) =>
      isEvent(e, "usage_ranking_status") ||
      ((isEvent(e, "search") || isEvent(e, "skill_search")) && (e.base_hits?.length ?? 0) > 0),
  );
}

/**
 * Selections for the Boost panel, straight from the trace (Ratel Cloud's
 * "reported" path): no experiment needed.
 *
 * One selection per turn that invoked a tool: the turn's latest tool search
 * before its first `invoke_start`. A turn is `session:turn_id`, or a search and
 * the invocations after it when events carry no turn id.
 *
 * A search is **online** when adaptive ranking was active for it: the latest
 * `usage_ranking_status` before it was `active` (for `graphKey`, when given),
 * or, without status events, a `usage_boost` was emitted for it (the core
 * emits one on every search a graph is attached to). Online turns get the
 * `adaptive` arm, which served the hits; when the runtime reports both
 * rankings they also get `baseline` (shadow) from `base_hits`, and a search
 * without `base_hits` is one the graph left unchanged. Offline turns get one
 * `baseline` arm, which served.
 */
export function buildBoostSelections(
  events: readonly TraceEvent[],
  options: BoostSelectionOptions = {},
): EvaluableSelection[] {
  const forGraph = (e: EventOf<"usage_ranking_status">) =>
    options.graphKey === undefined || e.graph_key === options.graphKey;
  const hasStatus = events.some((e) => isEvent(e, "usage_ranking_status") && forGraph(e));
  const both = reportsBaseHits(events);
  const turnKey = (e: TraceEvent, index: number) =>
    e.turnId ? `${e.sessionId}:${e.turnId}` : `${e.sessionId}:#${index}`;

  // Searches a usage_boost was emitted for (the fallback without status events).
  const boosted = hasStatus ? new Map() : attachBoosts(events);

  interface Pending {
    search: EventOf<"search">;
    active: boolean;
    invoked: string | null;
  }
  const turns = new Map<string, Pending>();
  const order: string[] = [];
  const active = new Map<string, boolean>();
  let lastSearchIndex = -1;

  events.forEach((e, index) => {
    if (isEvent(e, "usage_ranking_status")) {
      if (forGraph(e)) active.set(e.sessionId, e.status === "active");
      return;
    }
    if (isEvent(e, "search")) {
      lastSearchIndex = index;
      const key = turnKey(e, index);
      const existing = turns.get(key);
      if (existing?.invoked) return; // the turn already invoked; a later search does not replace it
      if (!existing) order.push(key);
      const isActive = hasStatus ? (active.get(e.sessionId) ?? false) : boosted.has(e);
      turns.set(key, { search: e, active: isActive, invoked: null });
      return;
    }
    if (isEvent(e, "invoke_start")) {
      const turn = turns.get(turnKey(e, lastSearchIndex));
      if (turn && turn.invoked === null) turn.invoked = e.tool_id;
    }
  });

  const selections: EvaluableSelection[] = [];
  for (const key of order) {
    const turn = turns.get(key);
    if (!turn?.invoked) continue;
    const served = turn.search.hits.map((h) => h.tool_id);
    let arms: ArmRanking[];
    if (!turn.active) {
      arms = [{ arm: BOOST_BASELINE_ARM, role: "serving", resultIds: served }];
    } else if (both) {
      const base = turn.search.base_hits?.length
        ? turn.search.base_hits.map((h) => h.tool_id)
        : served;
      arms = [
        { arm: BOOST_TREATMENT_ARM, role: "serving", resultIds: served },
        { arm: BOOST_BASELINE_ARM, role: "shadow", resultIds: base },
      ];
    } else {
      arms = [{ arm: BOOST_TREATMENT_ARM, role: "serving", resultIds: served }];
    }
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

/**
 * The Boost panel's view model from a trace. Without both rankings the
 * reference arm is left out, so the panel shows the adaptive arm alone rather
 * than a baseline it cannot know.
 */
export function buildBoostFromTrace(
  events: readonly TraceEvent[],
  options: BoostSelectionOptions = {},
): BoostView {
  const both = reportsBaseHits(events);
  return buildBoostView(buildBoostSelections(events, options), {
    reported: both,
    ...(both ? {} : { referenceArm: null }),
  });
}
