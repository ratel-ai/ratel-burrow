import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { projectFileName } from "@ratel-ai/burrow-model";
import {
  BURROW_DIR,
  CATALOG_SNAPSHOT_FILE,
  INTENT_GRAPH_FILE,
  INTENT_GRAPHS_DIR,
} from "./discovery.js";

export interface BurrowConfigOptions {
  /** Defaults to `./.ratel/burrow`, which `ratel-burrow` discovers with no flags. */
  dir?: string;
  /** Defaults to a fresh UUID; one trace file per session. */
  sessionId?: string;
  /**
   * The project this runtime belongs to: becomes its `source_id`, which Burrow (like Ratel
   * Cloud) separates everything by, and names its own intent graph file. Defaults to the
   * SDK's source id (`OTEL_SERVICE_NAME`, else `ratel`).
   */
  project?: string;
}

export interface BurrowPaths {
  dir: string;
  traces: string;
  /** Pass to `new LocalFileIntentGraphStorage({ path })`. */
  intentGraph: string;
  /** Write `JSON.stringify(ratel.catalog.snapshot())` here to show definitions without events. */
  catalogSnapshot: string;
}

/**
 * The slice of a Ratel config (`ratel({ ...config, ...burrowConfig() })`) that
 * points Ratel's own JSONL trace sink at a Burrow dir and turns catalog
 * definitions on. It configures nothing by itself and Burrow never writes it.
 */
export interface BurrowRatelConfig {
  trace: { kind: "jsonl"; sessionId: string; path: string };
  events: { sessionId: string; sourceId?: string; experimentalCatalogDefinitions: true };
}

export function burrowPaths(
  options: Pick<BurrowConfigOptions, "dir" | "project"> = {},
): BurrowPaths {
  const dir = resolve(options.dir ?? BURROW_DIR);
  return {
    dir,
    traces: join(dir, "traces"),
    intentGraph: options.project
      ? join(dir, INTENT_GRAPHS_DIR, projectFileName(options.project))
      : join(dir, INTENT_GRAPH_FILE),
    catalogSnapshot: join(dir, CATALOG_SNAPSHOT_FILE),
  };
}

export function burrowConfig(options: BurrowConfigOptions = {}): BurrowRatelConfig {
  const paths = burrowPaths(options);
  const sessionId = options.sessionId ?? randomUUID();
  mkdirSync(paths.traces, { recursive: true });
  // LocalFileIntentGraphStorage needs the folder to exist.
  if (options.project) mkdirSync(join(paths.dir, INTENT_GRAPHS_DIR), { recursive: true });
  return {
    trace: { kind: "jsonl", sessionId, path: join(paths.traces, `${sessionId}.jsonl`) },
    events: {
      sessionId,
      ...(options.project ? { sourceId: options.project } : {}),
      experimentalCatalogDefinitions: true,
    },
  };
}
