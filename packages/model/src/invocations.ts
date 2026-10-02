import { isEvent, type TraceEvent } from "./events.js";

/** One capability call, deduplicated across the event families that report it. */
export interface Invocation {
  kind: "tool" | "skill";
  id: string;
  /** Approximate start time (end `ts` minus `took_ms`). */
  ts: number;
  sessionId: string;
  turnId?: string;
  invocationId?: string;
  tookMs: number | null;
  error: string | null;
  /** The MCP upstream that served it, when known. */
  server?: string;
}

/** Gateway errors within this window of an `invoke_error` for the same tool are the same failure. */
const SAME_FAILURE_MS = 100;

/** Tool id → upstream server, from `upstream_invoke` / `upstream_register` + `server__tool` ids. */
export function serverIndex(events: readonly TraceEvent[]): (toolId: string) => string | undefined {
  const byTool = new Map<string, string>();
  const servers = new Set<string>();
  for (const e of events) {
    if (isEvent(e, "upstream_invoke")) byTool.set(e.tool_id, e.server);
    else if (isEvent(e, "upstream_register")) servers.add(e.server);
  }
  return (toolId) => {
    const direct = byTool.get(toolId);
    if (direct) return direct;
    const sep = toolId.indexOf("__");
    if (sep > 0) {
      const prefix = toolId.slice(0, sep);
      if (servers.has(prefix)) return prefix;
    }
    return undefined;
  };
}

/**
 * Every tool and skill call in the log. One call through an MCP gateway can be
 * reported as `invoke_*`, `upstream_invoke` and `gateway_invoke`; a session with `invoke_*`
 * events is read from those alone, otherwise from `gateway_invoke`. Gateway errors
 * (an agent asking for an unknown tool id, say) are kept as failed calls.
 */
export function collectInvocations(events: readonly TraceEvent[]): Invocation[] {
  const serverOf = serverIndex(events);
  const sessionsWithInvoke = new Set<string>();
  for (const e of events) {
    if (isEvent(e, "invoke_end") || isEvent(e, "invoke_error") || isEvent(e, "invoke_start")) {
      sessionsWithInvoke.add(e.sessionId);
    }
  }
  const errorTimes = new Map<string, number[]>();
  for (const e of events) {
    if (isEvent(e, "invoke_error")) {
      const key = `${e.sessionId}\u0000${e.tool_id}`;
      errorTimes.set(key, [...(errorTimes.get(key) ?? []), e.ts]);
    }
  }

  const out: Invocation[] = [];
  const base = (e: TraceEvent) => ({
    sessionId: e.sessionId,
    ...(e.turnId ? { turnId: e.turnId } : {}),
    ...(e.invocationId ? { invocationId: e.invocationId } : {}),
  });
  const tool = (e: TraceEvent, id: string, tookMs: number | null, error: string | null) => {
    const server = serverOf(id);
    out.push({
      kind: "tool",
      id,
      ts: e.ts - (tookMs ?? 0),
      ...base(e),
      tookMs,
      error,
      ...(server ? { server } : {}),
    });
  };

  for (const e of events) {
    const direct = sessionsWithInvoke.has(e.sessionId);
    if (isEvent(e, "invoke_end")) tool(e, e.tool_id, e.took_ms, null);
    else if (isEvent(e, "invoke_error")) tool(e, e.tool_id, e.took_ms, e.error || "error");
    else if (isEvent(e, "gateway_invoke") && !direct) tool(e, e.tool_id, e.took_ms, null);
    else if (isEvent(e, "gateway_error")) {
      const near = errorTimes.get(`${e.sessionId}\u0000${e.tool_id}`) ?? [];
      if (!near.some((t) => Math.abs(t - e.ts) <= SAME_FAILURE_MS)) {
        tool(e, e.tool_id, null, e.error || "error");
      }
    } else if (isEvent(e, "skill_invoke")) {
      out.push({
        kind: "skill",
        id: e.skill_id,
        ts: e.ts - e.took_ms,
        ...base(e),
        tookMs: e.took_ms,
        error: null,
      });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}
