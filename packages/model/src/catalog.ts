import { type CatalogKind, isEvent, type TraceEvent } from "./events.js";
import { collectInvocations, serverIndex } from "./invocations.js";
import { percentile } from "./stats.js";

export interface CatalogStats {
  /** Times it appeared in a search's hits. */
  retrieved: number;
  invoked: number;
  errors: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface CatalogEntry {
  kind: CatalogKind;
  id: string;
  name: string;
  /** False when only the id is known (definitions were not recorded). */
  defined: boolean;
  description: string;
  /** The text Ratel actually ranks. */
  searchableDescription: string;
  searchableOverridden: boolean;
  tags: string[];
  inputSchema: unknown;
  outputSchema: unknown;
  contentHash?: string;
  server?: string;
  removed: boolean;
  firstSeen: number | null;
  lastSeen: number | null;
  stats: CatalogStats;
}

export interface Catalog {
  tools: CatalogEntry[];
  skills: CatalogEntry[];
  facts: CatalogEntry[];
  /** True when at least one full definition was found. */
  hasDefinitions: boolean;
}

/** `catalog.snapshot()` as a host may save it; accepts camelCase (TS) and snake_case (Python). */
export interface CatalogSnapshotFile {
  source_id?: string;
  tools?: readonly Record<string, unknown>[];
  skills?: readonly Record<string, unknown>[];
  facts?: readonly Record<string, unknown>[];
}

function emptyEntry(kind: CatalogKind, id: string): CatalogEntry {
  return {
    kind,
    id,
    name: id,
    defined: false,
    description: "",
    searchableDescription: "",
    searchableOverridden: false,
    tags: [],
    inputSchema: null,
    outputSchema: null,
    removed: false,
    firstSeen: null,
    lastSeen: null,
    stats: { retrieved: 0, invoked: 0, errors: 0, avgLatencyMs: null, p95LatencyMs: null },
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pick(record: Record<string, unknown>, camel: string, snake: string): unknown {
  return record[camel] !== undefined ? record[camel] : record[snake];
}

export function buildCatalog(
  events: readonly TraceEvent[],
  snapshot?: CatalogSnapshotFile | null,
): Catalog {
  const maps: Record<CatalogKind, Map<string, CatalogEntry>> = {
    tool: new Map(),
    skill: new Map(),
    fact: new Map(),
  };
  const entry = (kind: CatalogKind, id: string): CatalogEntry => {
    let e = maps[kind].get(id);
    if (!e) {
      e = emptyEntry(kind, id);
      maps[kind].set(id, e);
    }
    return e;
  };
  const seen = (e: CatalogEntry, ts: number) => {
    e.firstSeen = e.firstSeen === null ? ts : Math.min(e.firstSeen, ts);
    e.lastSeen = e.lastSeen === null ? ts : Math.max(e.lastSeen, ts);
  };

  if (snapshot) {
    const kinds: [CatalogKind, readonly Record<string, unknown>[] | undefined][] = [
      ["tool", snapshot.tools],
      ["skill", snapshot.skills],
      ["fact", snapshot.facts],
    ];
    for (const [kind, list] of kinds) {
      for (const def of list ?? []) {
        const id = str(def.id);
        if (!id) continue;
        const e = entry(kind, id);
        const override = str(
          pick(def, "experimentalSearchableDescription", "experimental_searchable_description"),
        );
        e.defined = true;
        e.name = str(def.name) ?? id;
        e.description = str(def.description) ?? "";
        e.searchableDescription = override ?? e.description;
        e.searchableOverridden = override !== undefined;
        e.tags = Array.isArray(def.tags) ? def.tags.filter((t) => typeof t === "string") : [];
        e.inputSchema = pick(def, "inputSchema", "input_schema") ?? null;
        e.outputSchema = pick(def, "outputSchema", "output_schema") ?? null;
      }
    }
  }

  for (const ev of events) {
    if (isEvent(ev, "catalog_definition")) {
      const e = entry(ev.kind, ev.id);
      e.defined = true;
      e.name = ev.name || ev.id;
      e.description = ev.description;
      e.searchableDescription = ev.searchable_description;
      e.searchableOverridden = ev.searchable_description_overridden;
      e.tags = ev.tags ?? [];
      e.inputSchema = ev.input_schema ?? null;
      e.outputSchema = ev.output_schema ?? null;
      e.contentHash = ev.content_hash;
      e.removed = false;
      seen(e, ev.ts);
    } else if (
      isEvent(ev, "index_churn") ||
      isEvent(ev, "skill_churn") ||
      isEvent(ev, "fact_churn")
    ) {
      const [kind, id] =
        ev.type === "index_churn"
          ? (["tool", ev.tool_id] as const)
          : ev.type === "skill_churn"
            ? (["skill", ev.skill_id] as const)
            : (["fact", ev.fact_id] as const);
      const e = entry(kind, id);
      e.removed = ev.kind === "remove";
      seen(e, ev.ts);
    } else if (isEvent(ev, "search")) {
      for (const h of ev.hits) {
        const e = entry("tool", h.tool_id);
        e.stats.retrieved += 1;
        seen(e, ev.ts);
      }
    } else if (isEvent(ev, "skill_search")) {
      for (const h of ev.hits) {
        const e = entry("skill", h.skill_id);
        e.stats.retrieved += 1;
        seen(e, ev.ts);
      }
    } else if (isEvent(ev, "fact_search")) {
      for (const h of ev.hits) {
        const e = entry("fact", h.fact_id);
        e.stats.retrieved += 1;
        seen(e, ev.ts);
      }
    }
  }

  // Calls only update entries the catalog knows; an unknown id (a typo, say) is not a tool.
  const latencies = new Map<CatalogEntry, number[]>();
  for (const call of collectInvocations(events)) {
    const e = maps[call.kind].get(call.id);
    if (!e) continue;
    e.stats.invoked += 1;
    if (call.error !== null) e.stats.errors += 1;
    if (call.tookMs !== null) latencies.set(e, [...(latencies.get(e) ?? []), call.tookMs]);
    seen(e, call.ts);
  }
  for (const [e, values] of latencies) {
    e.stats.avgLatencyMs = values.reduce((a, b) => a + b, 0) / values.length;
    e.stats.p95LatencyMs = percentile(values, 0.95);
  }

  const serverOf = serverIndex(events);
  for (const e of maps.tool.values()) {
    const server = serverOf(e.id);
    if (server) e.server = server;
  }

  const sorted = (m: Map<string, CatalogEntry>) =>
    [...m.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const tools = sorted(maps.tool);
  const skills = sorted(maps.skill);
  const facts = sorted(maps.fact);
  return {
    tools,
    skills,
    facts,
    hasDefinitions: [...tools, ...skills, ...facts].some((e) => e.defined),
  };
}
