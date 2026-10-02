/**
 * Wire shape of Ratel's adaptive-ranking intent graph (ADR-0014; `IntentGraph.toJson()`,
 * `LocalFileIntentGraphStorage`). Ported from Ratel Cloud's `lib/intent-graph/wire.ts`.
 * Types are open: the contract is additive, so unknown fields are preserved.
 *
 * `members` holds raw user query text; Burrow only shows it locally.
 */

export interface IntentGraphIntent {
  id: string;
  /** Display only: the medoid member. */
  label: string;
  terms: string[];
  /** The match key: raw query texts. */
  members: string[];
  /** L2-normalised mean embedding; absent for a lexically clustered graph. */
  centroid?: number[];
  /** Confirmed searches behind this cluster. */
  support: number;
  seeded_support?: number;
  last_ts?: number;
  /** Tool id → confirmed invocation count. */
  tools: Record<string, number>;
  /** Skill id → confirmed invocation count. */
  skills: Record<string, number>;
  /** Times shown at or above the pick without being picked. */
  surfaced_tools?: Record<string, number>;
  surfaced_skills?: Record<string, number>;
  [extra: string]: unknown;
}

export interface IntentGraphDocument {
  v: 1;
  built_from_ts: number;
  rev?: number;
  /** Embedding-model fingerprint when centroids exist. */
  model?: string;
  cluster_policy?: { similarity?: number; coverage?: number; [extra: string]: unknown };
  intents: IntentGraphIntent[];
  [extra: string]: unknown;
}

export type IntentGraphEdgeKind = "tool" | "skill";

export type IntentGraphParse =
  | { ok: true; graph: IntentGraphDocument }
  | { ok: false; details: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Structural validation, collecting every violation. Messages name paths, never values. */
export function validateIntentGraph(input: unknown): IntentGraphParse {
  const details: string[] = [];
  if (!isRecord(input)) return { ok: false, details: ["graph: must be an object"] };
  if (input.v !== 1) details.push("graph.v: unsupported schema version (only 1 is known)");
  if (!isNonNegativeInteger(input.built_from_ts)) {
    details.push("graph.built_from_ts: must be a non-negative integer");
  }
  if (input.rev !== undefined && !isNonNegativeInteger(input.rev)) {
    details.push("graph.rev: must be a non-negative integer when present");
  }
  if (!Array.isArray(input.intents)) {
    details.push("graph.intents: must be an array");
    return { ok: false, details };
  }
  const seen = new Set<string>();
  input.intents.forEach((intent, i) => {
    const at = `graph.intents[${i}]`;
    if (!isRecord(intent)) {
      details.push(`${at}: must be an object`);
      return;
    }
    if (typeof intent.id !== "string" || intent.id.length === 0) {
      details.push(`${at}.id: must be a non-empty string`);
    } else if (seen.has(intent.id)) {
      details.push(`${at}.id: duplicates another cluster id`);
    } else {
      seen.add(intent.id);
    }
    if (typeof intent.label !== "string") details.push(`${at}.label: must be a string`);
    if (!isStringArray(intent.terms)) details.push(`${at}.terms: must be an array of strings`);
    if (!isStringArray(intent.members)) details.push(`${at}.members: must be an array of strings`);
    if (!isNonNegativeInteger(intent.support)) details.push(`${at}.support: must be an integer`);
    for (const kind of ["tools", "skills"] as const) {
      if (!isRecord(intent[kind])) details.push(`${at}.${kind}: must be an object of id to weight`);
    }
  });
  return details.length === 0
    ? { ok: true, graph: input as unknown as IntentGraphDocument }
    : { ok: false, details };
}

/** Parse the JSON text of an intent-graph file. */
export function parseIntentGraph(text: string): IntentGraphParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, details: [`not JSON: ${(err as Error).message}`] };
  }
  return validateIntentGraph(raw);
}
