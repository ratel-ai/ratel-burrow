import { isEvent, type TraceEvent } from "../events.js";
import { collectInvocations } from "../invocations.js";
import type { Step } from "./same-ask.js";

/** One turn (one user request): its searches and calls in order. */
export interface Turn {
  key: string;
  sessionId: string;
  endedAt: number;
  steps: Step[];
  /** Searched and ran nothing. */
  abandoned: boolean;
}

const normalise = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Turns from the trace. A turn is `(session, turn_id)`; events without a turn
 * id start a new turn at each search, and calls join the latest one in their
 * session. A call is credited to the latest earlier search in its turn that
 * listed it (the core's own attribution rule).
 */
export function buildTurns(events: readonly TraceEvent[]): Turn[] {
  const turns = new Map<string, Turn>();
  const order: string[] = [];
  const open = (key: string, sessionId: string) => {
    let turn = turns.get(key);
    if (!turn) {
      turn = { key, sessionId, endedAt: 0, steps: [], abandoned: true };
      turns.set(key, turn);
      order.push(key);
    }
    return turn;
  };

  type Pending = {
    at: number;
    seq: number;
    step: Omit<Step, "ordinal" | "offeredByOrdinal">;
    key: string;
  };
  const pending: Pending[] = [];
  events.forEach((e, seq) => {
    if (!isEvent(e, "search") && !isEvent(e, "skill_search")) return;
    const key = e.turnId ? `${e.sessionId}:${e.turnId}` : `${e.sessionId}:#${seq}`;
    open(key, e.sessionId);
    const hits = e.type === "search" ? e.hits.map((h) => h.tool_id) : e.hits.map((h) => h.skill_id);
    pending.push({
      at: e.ts,
      seq,
      key,
      step: {
        kind: "search",
        occurredAt: e.ts,
        endOccurredAt: e.ts + (e.took_ms ?? 0),
        searchType: e.type,
        queryHash: e.query ? normalise(e.query) : null,
        hitIds: hits,
        hitScores: e.hits.map((h) => h.score),
        targetType: null,
        targetId: null,
        outcome: null,
      },
    });
  });

  // Searches without a turn id: a call joins the latest search before it in its session.
  const searchesBySession = new Map<string, Pending[]>();
  for (const p of pending) {
    const sessionId = turns.get(p.key)?.sessionId ?? "";
    searchesBySession.set(sessionId, [...(searchesBySession.get(sessionId) ?? []), p]);
  }
  for (const call of collectInvocations(events)) {
    let key: string | undefined = call.turnId ? `${call.sessionId}:${call.turnId}` : undefined;
    if (!key) {
      const before = (searchesBySession.get(call.sessionId) ?? []).filter((p) => p.at <= call.ts);
      key = before.at(-1)?.key ?? `${call.sessionId}:call@${call.ts}`;
    }
    open(key, call.sessionId);
    pending.push({
      at: call.ts,
      seq: Number.MAX_SAFE_INTEGER,
      key,
      step: {
        kind: "invoke",
        occurredAt: call.ts,
        endOccurredAt: call.ts + (call.tookMs ?? 0),
        searchType: null,
        queryHash: null,
        hitIds: null,
        hitScores: null,
        targetType: call.kind,
        targetId: call.id,
        outcome: call.error === null ? "ok" : "error",
      },
    });
  }

  pending.sort((a, b) => a.at - b.at || a.seq - b.seq);
  for (const p of pending) {
    const turn = turns.get(p.key);
    if (!turn) continue;
    const ordinal = turn.steps.length;
    let offeredByOrdinal: number | null = null;
    if (p.step.kind === "invoke" && p.step.targetId !== null) {
      for (let i = turn.steps.length - 1; i >= 0; i--) {
        const s = turn.steps[i];
        if (s?.kind === "search" && (s.hitIds ?? []).includes(p.step.targetId)) {
          offeredByOrdinal = s.ordinal;
          break;
        }
      }
      turn.abandoned = false;
    }
    turn.steps.push({ ...p.step, ordinal, offeredByOrdinal });
    turn.endedAt = Math.max(turn.endedAt, p.step.endOccurredAt);
  }
  return order.map((k) => turns.get(k)).filter((t): t is Turn => t !== undefined);
}
