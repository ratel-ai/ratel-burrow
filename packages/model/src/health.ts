import { isEvent, type TraceEvent } from "./events";
import { collectInvocations } from "./invocations";
import { percentile } from "./stats";

export interface LatencySummary {
  count: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
}

export interface ToolHealth extends LatencySummary {
  kind: "tool" | "skill";
  id: string;
  calls: number;
  errors: number;
  lastError: string | null;
}

export type AuthState = "ok" | "needs_auth" | "refresh_failed" | "flow_failed";

export interface ServerHealth extends LatencySummary {
  server: string;
  /** `stdio`, `http`, `sse`, or the raw transport name. */
  transport: string;
  toolCount: number;
  registeredAt: number;
  calls: number;
  errors: number;
  auth: AuthState;
}

export interface EmbedderHealth {
  model: string;
  status: "ok" | "slow" | "failed";
  tookMs: number;
  reason: string | null;
  ts: number;
  downloadedBytes: number;
}

export interface Health {
  totals: { searches: number; invocations: number; errors: number; sessions: number };
  searchLatency: LatencySummary;
  invokeLatency: LatencySummary;
  tools: ToolHealth[];
  servers: ServerHealth[];
  embedders: EmbedderHealth[];
  dropped: { total: number; windows: number };
  warnings: string[];
}

export function summarizeLatency(values: readonly number[]): LatencySummary {
  return {
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.length ? Math.max(...values) : null,
  };
}

export function transportLabel(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("stdio")) return "stdio";
  if (t.includes("sse")) return "sse";
  if (t.includes("http")) return "http";
  return raw;
}

export function buildHealth(events: readonly TraceEvent[]): Health {
  const calls = collectInvocations(events);
  const searchTimes: number[] = [];
  const sessions = new Set<string>();
  const sessionsWithCoreSearch = new Set<string>();
  for (const e of events) if (e.type === "search") sessionsWithCoreSearch.add(e.sessionId);

  const servers = new Map<string, ServerHealth>();
  const serverLatency = new Map<string, number[]>();
  const embedders = new Map<string, EmbedderHealth>();
  const downloads = new Map<string, number>();
  const dropped = { total: 0, windows: 0 };
  const warnings = new Set<string>();

  for (const e of events) {
    sessions.add(e.sessionId);
    if (isEvent(e, "search") || isEvent(e, "skill_search") || isEvent(e, "fact_search")) {
      searchTimes.push(e.took_ms);
    } else if (isEvent(e, "gateway_search") && !sessionsWithCoreSearch.has(e.sessionId)) {
      searchTimes.push(e.took_ms);
    } else if (isEvent(e, "upstream_register")) {
      const prev = servers.get(e.server);
      servers.set(e.server, {
        ...(prev ?? {
          calls: 0,
          errors: 0,
          auth: "ok" as AuthState,
          count: 0,
          p50: null,
          p95: null,
          max: null,
        }),
        server: e.server,
        transport: transportLabel(e.transport),
        toolCount: e.tool_count,
        registeredAt: e.ts,
      });
    } else if (isEvent(e, "upstream_invoke")) {
      serverLatency.set(e.server, [...(serverLatency.get(e.server) ?? []), e.took_ms]);
    } else if (isEvent(e, "upstream_error")) {
      const s = servers.get(e.server);
      if (s) s.errors += 1;
    } else if (isEvent(e, "auth_needs")) {
      const s = servers.get(e.upstream);
      if (s) s.auth = "needs_auth";
    } else if (isEvent(e, "auth_refresh") || isEvent(e, "auth_flow_end")) {
      const s = servers.get(e.upstream);
      if (s) s.auth = e.ok ? "ok" : e.type === "auth_refresh" ? "refresh_failed" : "flow_failed";
    } else if (isEvent(e, "embedder_load")) {
      embedders.set(e.model, {
        model: e.model,
        status: e.status,
        tookMs: e.took_ms,
        reason: e.reason ?? null,
        ts: e.ts,
        downloadedBytes: 0,
      });
    } else if (isEvent(e, "embedder_download")) {
      downloads.set(e.model, (downloads.get(e.model) ?? 0) + e.bytes);
    } else if (isEvent(e, "embedder_model_mismatch")) {
      warnings.add(`Embeddings were built with ${e.built} but ${e.active} is active.`);
    } else if (isEvent(e, "events_dropped")) {
      dropped.total += e.dropped_count;
      dropped.windows += 1;
    }
  }
  for (const [model, bytes] of downloads) {
    const emb = embedders.get(model);
    if (emb) emb.downloadedBytes = bytes;
  }
  for (const [server, values] of serverLatency) {
    const s = servers.get(server);
    if (s) {
      Object.assign(s, summarizeLatency(values));
      s.calls = values.length;
    }
  }
  if (dropped.total > 0) {
    warnings.add(`${dropped.total} trace events were dropped; numbers here undercount.`);
  }

  const byTool = new Map<
    string,
    {
      kind: "tool" | "skill";
      id: string;
      times: number[];
      calls: number;
      errors: number;
      lastError: string | null;
    }
  >();
  for (const c of calls) {
    const key = `${c.kind}:${c.id}`;
    const t = byTool.get(key) ?? {
      kind: c.kind,
      id: c.id,
      times: [],
      calls: 0,
      errors: 0,
      lastError: null,
    };
    t.calls += 1;
    if (c.tookMs !== null) t.times.push(c.tookMs);
    if (c.error !== null) {
      t.errors += 1;
      t.lastError = c.error;
    }
    byTool.set(key, t);
  }
  const tools: ToolHealth[] = [...byTool.values()]
    .map((t) => ({
      kind: t.kind,
      id: t.id,
      calls: t.calls,
      errors: t.errors,
      lastError: t.lastError,
      ...summarizeLatency(t.times),
    }))
    .sort((a, b) => b.calls - a.calls || (a.id < b.id ? -1 : 1));

  return {
    totals: {
      searches: searchTimes.length,
      invocations: calls.length,
      errors: calls.filter((c) => c.error !== null).length,
      sessions: sessions.size,
    },
    searchLatency: summarizeLatency(searchTimes),
    invokeLatency: summarizeLatency(calls.flatMap((c) => (c.tookMs === null ? [] : [c.tookMs]))),
    tools,
    servers: [...servers.values()].sort((a, b) => (a.server < b.server ? -1 : 1)),
    embedders: [...embedders.values()],
    dropped,
    warnings: [...warnings],
  };
}
