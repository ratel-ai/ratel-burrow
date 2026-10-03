import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type BoostReplay,
  type BoostReplayTurn,
  boostTurnKey,
  buildCatalog,
  type CatalogSnapshotFile,
  isEvent,
  parseTraceLog,
  projectOf,
  type TraceEvent,
} from "@ratel-ai/burrow-model";
import type * as Sdk from "@ratel-ai/sdk";

/**
 * The Boost panel's replay, the local port of Ratel Cloud's fold
 * (`lib/intent-graph/fold.ts`, `foldEventsIntoGraph` with `shadow`), run with
 * the Ratel SDK the user already has installed (ADR 0005).
 *
 * In log order, every tool search is ranked twice before it is learned:
 * `plain` (no graph) and `boosted` (the graph as it stood before the search).
 * Then the learner absorbs it, and absorbs each invoke, through `recordEvent`
 * exactly as the runtime would. A search the runtime reported itself
 * (`base_hits`) keeps the runtime's two lists. Lexical (BM25), like Cloud.
 *
 * Each project (`source_id`) is folded on its own, from its own catalog
 * definitions into its own graph, as Cloud keeps one graph per project.
 */

export type SdkModule = typeof Sdk;

export const REPLAY_K = 5;
/** The origin Cloud's own shadow searches carry. */
const SHADOW_ORIGIN = "agent";
const KNOWN_ORIGINS = new Set(["direct", "agent", "baseline"]);

/** `@ratel-ai/sdk` as the project in `cwd` resolves it, or null when it has none. */
export async function loadSdk(cwd: string, name = "@ratel-ai/sdk"): Promise<SdkModule | null> {
  try {
    const require = createRequire(join(cwd, "package.json"));
    const entry = require.resolve(name);
    return (await import(pathToFileURL(entry).href)) as SdkModule;
  } catch {
    return null;
  }
}

/** Cloud's `toCoreEvent`: the wire shape the core's learner accepts for the four learning events. */
function toCoreEvent(e: TraceEvent): Record<string, unknown> | null {
  const origin = (o: unknown) => (typeof o === "string" && KNOWN_ORIGINS.has(o) ? o : "direct");
  if (isEvent(e, "search")) {
    if (!e.query) return null;
    return {
      type: "search",
      query: e.query,
      origin: origin(e.origin),
      top_k: e.top_k ?? e.hits.length,
      hits: e.hits.map((h) => ({ tool_id: h.tool_id, score: h.score ?? 0 })),
      stages: [],
      took_ms: e.took_ms ?? 0,
    };
  }
  if (isEvent(e, "skill_search")) {
    if (!e.query) return null;
    return {
      type: "skill_search",
      query: e.query,
      origin: origin(e.origin),
      top_k: e.top_k ?? e.hits.length,
      hits: e.hits.map((h) => ({ skill_id: h.skill_id, score: h.score ?? 0 })),
      stages: [],
      took_ms: e.took_ms ?? 0,
    };
  }
  if (isEvent(e, "invoke_start"))
    return { type: "invoke_start", tool_id: e.tool_id, args_size_bytes: 0 };
  if (isEvent(e, "skill_invoke"))
    return { type: "skill_invoke", skill_id: e.skill_id, took_ms: e.took_ms ?? 0 };
  return null;
}

export async function computeReplay(
  traceTexts: readonly string[],
  snapshot: CatalogSnapshotFile | null,
  sdk: SdkModule,
): Promise<BoostReplay | { error: string }> {
  const { events } = parseTraceLog(traceTexts);
  // Projects in the order they first appear; the Python launcher folds in the same order.
  const byProject = new Map<string, TraceEvent[]>();
  for (const e of events) {
    const id = projectOf(e);
    const list = byProject.get(id);
    if (list) list.push(e);
    else byProject.set(id, [e]);
  }
  const turns: BoostReplayTurn[] = [];
  let folded = 0;
  for (const projectEvents of byProject.values()) {
    const result = await foldProject(projectEvents, snapshot, sdk);
    if (result === null) continue;
    folded += 1;
    turns.push(...result);
  }
  if (folded === 0) {
    return {
      error:
        "No tool definitions in the trace: turn on catalog definitions (burrowConfig() does) so Burrow can replay searches.",
    };
  }
  return { v: 1, method: "bm25", k: REPLAY_K, turns };
}

/** One project's fold, or null when it recorded no tool definitions. */
async function foldProject(
  events: readonly TraceEvent[],
  snapshot: CatalogSnapshotFile | null,
  sdk: SdkModule,
): Promise<BoostReplayTurn[] | null> {
  const tools = buildCatalog(events, snapshot).tools.filter((t) => t.defined && !t.removed);
  if (tools.length === 0) return null;
  const definitions = tools.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    ...(t.searchableOverridden
      ? { experimentalSearchableDescription: t.searchableDescription }
      : {}),
    inputSchema: (t.inputSchema as Sdk.ExecutableTool["inputSchema"]) ?? {
      type: "object" as const,
    },
    outputSchema: (t.outputSchema as Sdk.ExecutableTool["outputSchema"]) ?? {
      type: "object" as const,
    },
    execute: () => ({}),
  }));

  const noop = { kind: "noop" as const };
  const plain = new sdk.ToolCatalog({ trace: noop });
  const boosted = new sdk.ToolCatalog({ trace: noop });
  await plain.register(definitions);
  await boosted.register(definitions);

  const graph = new sdk.IntentGraph();
  const learner = new sdk.ToolCatalog({ trace: noop });
  learner.experimentalEnableAdaptiveRanking(graph, {
    origins: "any",
    provenance: "seeded",
    warnOnModelMismatch: false,
  });

  // Cloud attaches the live graph to `boosted` with `learn: false`. Released SDKs lack that
  // option, so `boosted` ranks from a snapshot taken whenever the learner moved the graph:
  // the graph as it stood before this search, never touched by the shadow search itself.
  let snapshotRev = -1;
  const boostFrom = () => {
    if (graph.rev === snapshotRev) return;
    boosted.experimentalDisableAdaptiveRanking();
    boosted.experimentalEnableAdaptiveRanking(sdk.IntentGraph.fromJson(graph.toJson()), {
      origins: "any",
      warnOnModelMismatch: false,
    });
    snapshotRev = graph.rev;
  };

  const turns: BoostReplayTurn[] = [];
  try {
    for (const e of events) {
      const core = toCoreEvent(e);
      if (!core) continue;
      if (isEvent(e, "search")) {
        const served = e.hits.map((h) => h.tool_id);
        if (e.base_hits?.length) {
          turns.push({
            key: boostTurnKey(e),
            plain_ids: e.base_hits.slice(0, REPLAY_K).map((h) => h.tool_id),
            boosted_ids: served.slice(0, REPLAY_K),
            matched: true,
            reported: true,
          });
        } else {
          boostFrom();
          const p = plain.search(e.query, REPLAY_K, SHADOW_ORIGIN);
          const b = boosted.search(e.query, REPLAY_K, SHADOW_ORIGIN);
          turns.push({
            key: boostTurnKey(e),
            plain_ids: p.map((h) => h.toolId),
            boosted_ids: b.map((h) => h.toolId),
            matched: b[0]?.fused === true,
            reported: false,
          });
        }
      }
      learner.recordEvent(core, {
        eventId: boostTurnKey(e),
        turnId: `${e.sessionId}:${e.turnId ?? ""}`,
      });
    }
  } finally {
    boosted.experimentalDisableAdaptiveRanking();
    learner.experimentalDisableAdaptiveRanking();
  }
  return turns;
}
