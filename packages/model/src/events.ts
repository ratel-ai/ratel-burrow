/**
 * Ratel trace log parsing (Ratel ADR-0007, `ratel-ai-core` `trace/event.rs`).
 *
 * One JSON envelope per line, tagged by `type`. Envelope `v: 1` carries `ts` and
 * `session_id`; `v: 2` adds `event_id`, `source_id` and optional correlation ids.
 * Payload fields keep their wire (snake_case) names; envelope fields are camelCase.
 * Unknown types are kept with `known: false` so new Ratel events never break Burrow.
 */

export type Origin = "direct" | "agent" | "baseline";
export type ChurnKind = "add" | "remove";
export type CatalogKind = "tool" | "skill" | "fact";

export interface SearchStage {
  name: string;
  took_ms: number;
  top_score: number | null;
}

interface SearchPayload<Hit> {
  query: string;
  origin: Origin;
  top_k: number;
  hits: Hit[];
  /** The top-k without the usage arm; present only when an intent graph matched (Ratel RC-204). */
  base_hits?: Hit[];
  stages: SearchStage[];
  took_ms: number;
}

/** Payload shapes by wire `type`. */
export interface TracePayloads {
  catalog_definition: {
    kind: CatalogKind;
    id: string;
    name: string;
    description: string;
    tags: string[];
    input_schema: unknown;
    output_schema: unknown;
    searchable_description: string;
    searchable_description_overridden: boolean;
    content_hash: string;
  };
  search: SearchPayload<{ tool_id: string; score: number }>;
  skill_search: SearchPayload<{ skill_id: string; score: number }>;
  fact_search: SearchPayload<{ fact_id: string; score: number }>;
  index_churn: { kind: ChurnKind; tool_id: string };
  skill_churn: { kind: ChurnKind; skill_id: string };
  fact_churn: { kind: ChurnKind; fact_id: string };
  skill_invoke: { skill_id: string; took_ms: number };
  fact_inject: { fact_id: string; reason: "never" | "evicted" | "mutated" };
  fact_inject_skip: { fact_id: string };
  fact_snapshot: { fact_id: string };
  invoke_start: { tool_id: string; args_size_bytes: number };
  invoke_end: { tool_id: string; took_ms: number };
  invoke_error: { tool_id: string; took_ms: number; error: string };
  gateway_search: {
    query: string;
    origin: Origin;
    top_k: number;
    hits: number;
    took_ms: number;
  };
  gateway_invoke: { tool_id: string; took_ms: number };
  gateway_error: { tool_id: string; error: string };
  upstream_register: { server: string; transport: string; tool_count: number };
  upstream_invoke: { server: string; tool_id: string; took_ms: number };
  upstream_error: { server: string; tool_id: string; error: string };
  auth_refresh: { upstream: string; ok: boolean };
  auth_needs: { upstream: string };
  auth_flow_start: { upstream: string };
  auth_flow_end: { upstream: string; ok: boolean };
  events_dropped: {
    dropped_count: number;
    reason: string;
    window_start_ts: number;
    window_end_ts: number;
  };
  embedder_load: {
    model: string;
    status: "ok" | "slow" | "failed";
    took_ms: number;
    reason: string | null;
  };
  embedder_download: { model: string; bytes: number };
  embedder_model_mismatch: { built: string; active: string };
  embedder_pooling_assumed: { model: string; pooling: string };
  usage_cluster_policy_changed: {
    built_similarity: number;
    built_coverage: number;
    active_similarity: number;
    active_coverage: number;
  };
  usage_model_mismatch: { built: string; active: string; dim_mismatch: boolean };
  /** Adaptive-ranking state, reported by the SDK on enable, disable and rebuild (Ratel RC-204). */
  usage_ranking_status: {
    status: "active" | "inactive" | "unknown" | "paused";
    reason: "enabled" | "disabled" | "rebuilt";
    rev?: number;
    graph_key?: string;
    /** Whether the registry learns into the graph or only ranks from it. Defaults to true. */
    learn: boolean;
    model?: string;
  };
  usage_boost: {
    intent: string | null;
    similarity: number;
    support: number;
    promoted: number;
    dropped: number;
  };
}

export type KnownEventType = keyof TracePayloads;

export interface Envelope {
  v: number;
  ts: number;
  sessionId: string;
  eventId?: string;
  sourceId?: string;
  invocationId?: string;
  turnId?: string;
  traceId?: string;
  spanId?: string;
  /** The whole parsed line, for raw display and unknown fields. */
  raw: Record<string, unknown>;
}

export type KnownEvent = {
  [K in KnownEventType]: Envelope & { type: K; known: true } & TracePayloads[K];
}[KnownEventType];

export type UnknownEvent = Envelope & { type: string; known: false };

export type TraceEvent = KnownEvent | UnknownEvent;

export type EventOf<K extends KnownEventType> = Extract<KnownEvent, { type: K }>;

const KNOWN_TYPES: ReadonlySet<string> = new Set<KnownEventType>([
  "catalog_definition",
  "search",
  "skill_search",
  "fact_search",
  "index_churn",
  "skill_churn",
  "fact_churn",
  "skill_invoke",
  "fact_inject",
  "fact_inject_skip",
  "fact_snapshot",
  "invoke_start",
  "invoke_end",
  "invoke_error",
  "gateway_search",
  "gateway_invoke",
  "gateway_error",
  "upstream_register",
  "upstream_invoke",
  "upstream_error",
  "auth_refresh",
  "auth_needs",
  "auth_flow_start",
  "auth_flow_end",
  "events_dropped",
  "embedder_load",
  "embedder_download",
  "embedder_model_mismatch",
  "embedder_pooling_assumed",
  "usage_cluster_policy_changed",
  "usage_model_mismatch",
  "usage_boost",
  "usage_ranking_status",
]);

const ENVELOPE_KEYS = new Set([
  "v",
  "ts",
  "session_id",
  "event_id",
  "source_id",
  "invocation_id",
  "turn_id",
  "trace_id",
  "span_id",
  "type",
]);

function optString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Narrow an event to one known type. */
export function isEvent<K extends KnownEventType>(event: TraceEvent, type: K): event is EventOf<K> {
  return event.known && event.type === type;
}

/** Parse one line; `null` for blank, malformed, or envelope-less lines. */
export function parseTraceLine(line: string): TraceEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string" || typeof obj.ts !== "number") return null;
  if (typeof obj.session_id !== "string") return null;

  const envelope: Envelope = {
    v: typeof obj.v === "number" ? obj.v : 1,
    ts: obj.ts,
    sessionId: obj.session_id,
    eventId: optString(obj.event_id),
    sourceId: optString(obj.source_id),
    invocationId: optString(obj.invocation_id),
    turnId: optString(obj.turn_id),
    traceId: optString(obj.trace_id),
    spanId: optString(obj.span_id),
    raw: obj,
  };
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!ENVELOPE_KEYS.has(key)) payload[key] = value;
  }
  const known = KNOWN_TYPES.has(obj.type);
  if (obj.type === "usage_ranking_status" && typeof payload.learn !== "boolean")
    payload.learn = true;
  return { ...payload, ...envelope, type: obj.type, known } as TraceEvent;
}

export interface TraceLog {
  /** Every parsed event, ordered by `ts` (stable for ties). */
  events: TraceEvent[];
  /** Non-empty lines that could not be parsed. */
  badLines: number;
}

/** Parse one or more JSONL texts into a single time-ordered stream. */
export function parseTraceLog(texts: string | readonly string[]): TraceLog {
  const events: TraceEvent[] = [];
  let badLines = 0;
  for (const text of typeof texts === "string" ? [texts] : texts) {
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;
      const event = parseTraceLine(line);
      if (event) events.push(event);
      else badLines += 1;
    }
  }
  events.sort((a, b) => a.ts - b.ts);
  return { events, badLines };
}
