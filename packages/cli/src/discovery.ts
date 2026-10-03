import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export type SourceKind = "trace" | "intent_graph" | "catalog_snapshot" | "boost_replay";

/** One data file Burrow can serve (ADR 0002 / 0003). */
export interface Source {
  /** Stable for a path; safe in a URL. */
  id: string;
  kind: SourceKind;
  path: string;
  /** Short human label. */
  label: string;
  size: number;
  mtime: number;
}

export interface DiscoveryOptions {
  cwd: string;
  /** Burrow dirs (`traces/`, `intent-graph.json`, `catalog-snapshot.json`). */
  dirs?: string[];
  /** Trace files or dirs of `*.jsonl`. */
  traces?: string[];
  intentGraphs?: string[];
  catalogs?: string[];
}

export const BURROW_DIR = join(".ratel", "burrow");
export const INTENT_GRAPH_FILE = "intent-graph.json";
/** One intent graph per project: `intent-graphs/<project>.json`. */
export const INTENT_GRAPHS_DIR = "intent-graphs";
export const CATALOG_SNAPSHOT_FILE = "catalog-snapshot.json";

export function sourceId(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 12);
}

function stat(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function list(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

function jsonlIn(dir: string): string[] {
  return list(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => join(dir, name))
    .filter((p) => stat(p)?.isFile());
}

export function discoverSources(options: DiscoveryOptions): Source[] {
  const { cwd } = options;
  const out: Source[] = [];
  const seen = new Set<string>();
  const add = (kind: SourceKind, path: string, label: string) => {
    const abs = resolve(cwd, path);
    if (seen.has(abs)) return;
    const s = stat(abs);
    if (!s?.isFile()) return;
    seen.add(abs);
    out.push({ id: sourceId(abs), kind, path: abs, label, size: s.size, mtime: s.mtimeMs });
  };
  const display = (abs: string) => {
    const rel = relative(cwd, abs);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : abs;
  };
  const addBurrowDir = (dir: string) => {
    const abs = resolve(cwd, dir);
    for (const p of [...jsonlIn(join(abs, "traces")), ...jsonlIn(abs)]) add("trace", p, display(p));
    add("intent_graph", join(abs, INTENT_GRAPH_FILE), display(join(abs, INTENT_GRAPH_FILE)));
    for (const name of list(join(abs, INTENT_GRAPHS_DIR)).filter((n) => n.endsWith(".json"))) {
      const p = join(abs, INTENT_GRAPHS_DIR, name);
      add("intent_graph", p, display(p));
    }
    add(
      "catalog_snapshot",
      join(abs, CATALOG_SNAPSHOT_FILE),
      display(join(abs, CATALOG_SNAPSHOT_FILE)),
    );
  };

  const explicit =
    (options.dirs?.length ?? 0) +
      (options.traces?.length ?? 0) +
      (options.intentGraphs?.length ?? 0) +
      (options.catalogs?.length ?? 0) >
    0;

  if (!explicit) addBurrowDir(BURROW_DIR);

  for (const dir of options.dirs ?? []) addBurrowDir(dir);
  for (const t of options.traces ?? []) {
    const abs = resolve(cwd, t);
    if (stat(abs)?.isDirectory()) for (const p of jsonlIn(abs)) add("trace", p, display(p));
    else add("trace", abs, display(abs));
  }
  for (const g of options.intentGraphs ?? []) add("intent_graph", g, display(resolve(cwd, g)));
  for (const c of options.catalogs ?? []) add("catalog_snapshot", c, display(resolve(cwd, c)));
  return out;
}
