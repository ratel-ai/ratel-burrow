import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { BURROW_DIR, CATALOG_SNAPSHOT_FILE, INTENT_GRAPH_FILE } from "./discovery.js";

export interface BurrowConfigOptions {
  /** Defaults to `./.ratel/burrow`, which `ratel-burrow` discovers with no flags. */
  dir?: string;
  /** Defaults to a fresh UUID; one trace file per session. */
  sessionId?: string;
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
  events: { sessionId: string; experimentalCatalogDefinitions: true };
}

export function burrowPaths(options: Pick<BurrowConfigOptions, "dir"> = {}): BurrowPaths {
  const dir = resolve(options.dir ?? BURROW_DIR);
  return {
    dir,
    traces: join(dir, "traces"),
    intentGraph: join(dir, INTENT_GRAPH_FILE),
    catalogSnapshot: join(dir, CATALOG_SNAPSHOT_FILE),
  };
}

export function burrowConfig(options: BurrowConfigOptions = {}): BurrowRatelConfig {
  const paths = burrowPaths(options);
  const sessionId = options.sessionId ?? randomUUID();
  mkdirSync(paths.traces, { recursive: true });
  return {
    trace: { kind: "jsonl", sessionId, path: join(paths.traces, `${sessionId}.jsonl`) },
    events: { sessionId, experimentalCatalogDefinitions: true },
  };
}
