import type { TraceEvent } from "../events.js";

/**
 * A launcher's replay of the trace, the local counterpart of Ratel Cloud's
 * fold (`foldEventsIntoGraph` with `shadow`): every tool search ranked twice
 * before it was learned, without a graph (`plain_ids`) and with the graph as
 * it stood before that search (`boosted_ids`). Turns the runtime reported
 * itself (`base_hits`) carry its own two lists and `reported: true`.
 */
export interface BoostReplayTurn {
  /** {@link boostTurnKey} of the search event. */
  key: string;
  plain_ids: string[];
  boosted_ids: string[];
  /** Whether an intent matched the query and the boost was armed. */
  matched: boolean;
  /** True when the lists are the runtime's own `hits` / `base_hits`, not replayed. */
  reported: boolean;
}

export interface BoostReplay {
  v: 1;
  /** Retrieval method of the replay; `bm25`, like Cloud's lexical replay. */
  method: string;
  k: number;
  turns: BoostReplayTurn[];
}

/** How the replay and the UI name one search: its event id, or `session|ts|query` for v1 lines. */
export function boostTurnKey(event: TraceEvent): string {
  if (event.eventId) return event.eventId;
  const query = typeof event.raw.query === "string" ? event.raw.query : "";
  return `${event.sessionId}|${event.ts}|${query}`;
}

export type BoostReplayParse = { ok: true; replay: BoostReplay } | { ok: false; error: string };

/** Parse what `GET /api/sources/boost-replay` returned. */
export function parseBoostReplay(text: string): BoostReplayParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `not JSON: ${(err as Error).message}` };
  }
  if (raw === null || typeof raw !== "object") return { ok: false, error: "not an object" };
  const obj = raw as Record<string, unknown>;
  if (typeof obj.error === "string") return { ok: false, error: obj.error };
  if (obj.v !== 1 || !Array.isArray(obj.turns)) return { ok: false, error: "unsupported replay" };
  return { ok: true, replay: obj as unknown as BoostReplay };
}
