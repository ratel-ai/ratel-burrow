import {
  type BoostStats,
  buildBoostStats,
  buildCatalog,
  buildHealth,
  buildInspector,
  type Catalog,
  type CatalogSnapshotFile,
  estimateSavings,
  type Health,
  type IntentGraphDocument,
  parseIntentGraph,
  type SavingsEstimate,
  type SessionTimeline,
  type TraceEvent,
  TraceTail,
} from "@ratel-ai/burrow-model";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** Mirrors the launcher's `GET /api/sources` (ADR 0002). */
export interface Source {
  id: string;
  kind: "trace" | "intent_graph" | "catalog_snapshot";
  path: string;
  label: string;
  size: number;
  mtime: number;
}

export interface LoadedGraph {
  source: Source;
  graph: IntentGraphDocument | null;
  error: string | null;
}

export interface BurrowData {
  status: "loading" | "ready" | "unauthorized" | "offline";
  sources: Source[];
  events: TraceEvent[];
  badLines: number;
  catalog: Catalog;
  sessions: SessionTimeline[];
  health: Health;
  savings: SavingsEstimate;
  boost: BoostStats;
  graphs: LoadedGraph[];
  snapshotError: string | null;
  lastUpdated: number | null;
}

const POLL_MS = 2_500;

const token = new URLSearchParams(window.location.search).get("t") ?? "";

async function api(path: string): Promise<Response> {
  return fetch(path, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
}

const Ctx = createContext<BurrowData | null>(null);

export function useBurrow(): BurrowData {
  const value = useContext(Ctx);
  if (!value) throw new Error("useBurrow outside <BurrowProvider>");
  return value;
}

interface RawState {
  status: BurrowData["status"];
  sources: Source[];
  version: number;
  graphs: LoadedGraph[];
  snapshot: CatalogSnapshotFile | null;
  snapshotError: string | null;
  lastUpdated: number | null;
}

export function BurrowProvider({ children }: { children: ReactNode }) {
  const tails = useRef(new Map<string, TraceTail>());
  const files = useRef(new Map<string, { size: number; mtime: number }>());
  const [raw, setRaw] = useState<RawState>({
    status: "loading",
    sources: [],
    version: 0,
    graphs: [],
    snapshot: null,
    snapshotError: null,
    lastUpdated: null,
  });

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const res = await api("/api/sources");
        if (res.status === 401) {
          setRaw((r) => ({ ...r, status: "unauthorized" }));
          return; // a bad token will not get better; stop polling
        }
        if (!res.ok) throw new Error(String(res.status));
        const { sources } = (await res.json()) as { sources: Source[] };
        let changed = false;

        for (const s of sources.filter((x) => x.kind === "trace")) {
          let tail = tails.current.get(s.id);
          if (!tail) {
            tail = new TraceTail();
            tails.current.set(s.id, tail);
          }
          if (s.size < tail.offset) {
            tail.reset();
            changed = true;
          }
          if (s.size > tail.offset) {
            const chunk = await api(`/api/sources/${s.id}?offset=${tail.offset}`);
            if (chunk.ok) {
              tail.push(new Uint8Array(await chunk.arrayBuffer()));
              changed = true;
            }
          }
        }
        for (const id of [...tails.current.keys()]) {
          if (!sources.some((s) => s.id === id)) {
            tails.current.delete(id);
            changed = true;
          }
        }

        const jsonSources = sources.filter((x) => x.kind !== "trace");
        const jsonChanged =
          jsonSources.some((s) => {
            const prev = files.current.get(s.id);
            return !prev || prev.size !== s.size || prev.mtime !== s.mtime;
          }) || [...files.current.keys()].some((id) => !jsonSources.some((s) => s.id === id));
        let graphs: LoadedGraph[] | undefined;
        let snapshot: CatalogSnapshotFile | null | undefined;
        let snapshotError: string | null = null;
        if (jsonChanged) {
          files.current = new Map(jsonSources.map((s) => [s.id, { size: s.size, mtime: s.mtime }]));
          graphs = [];
          snapshot = null;
          for (const s of jsonSources) {
            const text = await (await api(`/api/sources/${s.id}`)).text();
            if (s.kind === "intent_graph") {
              const parsed = parseIntentGraph(text);
              graphs.push(
                parsed.ok
                  ? { source: s, graph: parsed.graph, error: null }
                  : { source: s, graph: null, error: parsed.details.join("; ") },
              );
            } else {
              try {
                snapshot = JSON.parse(text) as CatalogSnapshotFile;
              } catch (err) {
                snapshotError = `${s.label}: ${(err as Error).message}`;
              }
            }
          }
          changed = true;
        }

        if (!stopped) {
          setRaw((r) => ({
            status: "ready",
            sources,
            version: changed ? r.version + 1 : r.version,
            graphs: graphs ?? r.graphs,
            snapshot: snapshot === undefined ? r.snapshot : snapshot,
            snapshotError: jsonChanged ? snapshotError : r.snapshotError,
            lastUpdated: Date.now(),
          }));
        }
      } catch {
        if (!stopped) setRaw((r) => ({ ...r, status: "offline" }));
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Derived models are recomputed only when the data version moves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `raw.version` is the change signal for the tails held in refs.
  const derived = useMemo(() => {
    const all: TraceEvent[] = [];
    let badLines = 0;
    for (const tail of tails.current.values()) {
      for (const e of tail.events) all.push(e);
      badLines += tail.badLines;
    }
    all.sort((a, b) => a.ts - b.ts);
    const catalog = buildCatalog(all, raw.snapshot);
    return {
      events: all,
      badLines,
      catalog,
      sessions: buildInspector(all),
      health: buildHealth(all),
      savings: estimateSavings(all, catalog),
      boost: buildBoostStats(all),
    };
  }, [raw.version, raw.snapshot]);

  const value: BurrowData = {
    status: raw.status,
    sources: raw.sources,
    graphs: raw.graphs,
    snapshotError: raw.snapshotError,
    lastUpdated: raw.lastUpdated,
    ...derived,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
