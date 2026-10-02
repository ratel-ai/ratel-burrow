import { isEvent, type TraceEvent } from "./events.js";

/** What the runtime reported about adaptive ranking, as of the last event. */
export interface RankingState {
  /** Latest `usage_ranking_status.status`, or null when the runtime never reported one. */
  status: "active" | "inactive" | "unknown" | "paused" | null;
  /** True: the runtime learns into the graph online. False: it only ranks from a graph built elsewhere. */
  learn: boolean | null;
  graphKey: string | null;
  rev: number | null;
  model: string | null;
  /** First time ranking turned active. */
  liveSince: number | null;
  /** First `usage_boost` that matched an intent: the graph changed a search. */
  boostingSince: number | null;
}

export function buildRankingState(events: readonly TraceEvent[], graphKey?: string): RankingState {
  const state: RankingState = {
    status: null,
    learn: null,
    graphKey: null,
    rev: null,
    model: null,
    liveSince: null,
    boostingSince: null,
  };
  for (const e of events) {
    if (isEvent(e, "usage_ranking_status")) {
      if (graphKey !== undefined && e.graph_key !== graphKey) continue;
      state.status = e.status;
      state.learn = e.learn;
      state.graphKey = e.graph_key ?? null;
      state.rev = e.rev ?? null;
      state.model = e.model ?? null;
      if (e.status === "active" && state.liveSince === null) state.liveSince = e.ts;
    } else if (isEvent(e, "usage_boost") && e.intent !== null && state.boostingSince === null) {
      state.boostingSince = e.ts;
    }
  }
  return state;
}
