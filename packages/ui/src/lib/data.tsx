import {
  type BoostReplay,
  type BoostStats,
  type BoostView,
  buildBoostFromTrace,
  buildBoostStats,
  buildCatalog,
  buildHealth,
  buildInspector,
  type Catalog,
  type CatalogSnapshotFile,
  callOutcomes,
  estimateSavings,
  type Health,
  type IntentGraphDocument,
  inWindow,
  isRange,
  listProjects,
  type OutcomeSummary,
  type ProjectSummary,
  parseBoostReplay,
  parseIntentGraph,
  previousWindow,
  projectFileName,
  type SavingsEstimate,
  type SessionTimeline,
  scopeToProject,
  servedOnly,
  summarizeOutcomes,
  type TimeRange,
  type TimeWindow,
  type TraceEvent,
  TraceTail,
  windowFor,
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
  kind: "trace" | "intent_graph" | "catalog_snapshot" | "boost_replay";
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
  /** Every project (runtime source_id) in the traces, busiest first. */
  projects: ProjectSummary[];
  /** The selected project; every model below is scoped to it. */
  project: string | null;
  setProject: (id: string) => void;
  /** The time range every page reads, ending at the latest event. */
  range: TimeRange;
  setRange: (range: TimeRange) => void;
  window: TimeWindow | null;
  /** The newest event's time in the selected project, for freshness. */
  latestTs: number | null;
  /** The selected project's events inside the range. */
  events: TraceEvent[];
  /** The selected project's events over all time (learning history). */
  allEvents: TraceEvent[];
  /** The same figures for the window just before, for trends; null for "all" or no data. */
  previous: { outcomes: OutcomeSummary; savedTotal: number } | null;
  badLines: number;
  catalog: Catalog;
  sessions: SessionTimeline[];
  health: Health;
  savings: SavingsEstimate;
  boost: BoostStats;
  /** Ratel Cloud's Boost view for the selected project (trace + launcher replay). */
  boostView: BoostView;
  graphs: LoadedGraph[];
  /** The selected project's intent graph: `intent-graphs/<project>.json`, else the shared one. */
  projectGraph: LoadedGraph | null;
  snapshotError: string | null;
  /** The launcher's Boost replay (ADR 0005), or null when it has none. */
  replay: BoostReplay | null;
  /** Why the replay is missing, when the launcher said. */
  replayError: string | null;
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
  replay: BoostReplay | null;
  replayError: string | null;
  lastUpdated: number | null;
}

const PROJECT_KEY = "burrow.project";
const RANGE_KEY = "burrow.range";

/** `#/...?range=7d`, else the last one chosen, else 7 days. */
function rememberedRange(): TimeRange {
  const fromUrl = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("range");
  if (isRange(fromUrl)) return fromUrl;
  try {
    const stored = window.localStorage.getItem(RANGE_KEY);
    if (isRange(stored)) return stored;
  } catch {
    // fall through
  }
  return "7d";
}

/** `#/...?project=<id>` opens a project directly (shareable); otherwise the last one chosen. */
function rememberedProject(): string | null {
  const fromUrl = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("project");
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

export function BurrowProvider({ children }: { children: ReactNode }) {
  const [chosenProject, setChosenProject] = useState<string | null>(rememberedProject);
  const setProject = (id: string) => {
    setChosenProject(id);
    try {
      window.localStorage.setItem(PROJECT_KEY, id);
    } catch {
      // a convenience only
    }
  };
  const [range, setRangeState] = useState<TimeRange>(rememberedRange);
  const setRange = (next: TimeRange) => {
    setRangeState(next);
    try {
      window.localStorage.setItem(RANGE_KEY, next);
    } catch {
      // a convenience only
    }
  };
  const tails = useRef(new Map<string, TraceTail>());
  const files = useRef(new Map<string, { size: number; mtime: number }>());
  const [raw, setRaw] = useState<RawState>({
    status: "loading",
    sources: [],
    version: 0,
    graphs: [],
    snapshot: null,
    snapshotError: null,
    replay: null,
    replayError: null,
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
        let replay: BoostReplay | null = null;
        let replayError: string | null = null;
        if (jsonChanged) {
          files.current = new Map(jsonSources.map((s) => [s.id, { size: s.size, mtime: s.mtime }]));
          graphs = [];
          snapshot = null;
          for (const s of jsonSources) {
            const text = await (await api(`/api/sources/${s.id}`)).text();
            if (s.kind === "boost_replay") {
              const parsed = parseBoostReplay(text);
              if (parsed.ok) replay = parsed.replay;
              else replayError = parsed.error;
            } else if (s.kind === "intent_graph") {
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
            replay: jsonChanged ? replay : r.replay,
            replayError: jsonChanged ? replayError : r.replayError,
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

  // All events, recomputed only when the data version moves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `raw.version` is the change signal for the tails held in refs.
  const all = useMemo(() => {
    const events: TraceEvent[] = [];
    let badLines = 0;
    for (const tail of tails.current.values()) {
      for (const e of tail.events) events.push(e);
      badLines += tail.badLines;
    }
    events.sort((a, b) => a.ts - b.ts);
    return { events, badLines, projects: listProjects(events) };
  }, [raw.version]);

  // The selected project: the remembered one if it still exists, else the busiest.
  const project =
    all.projects.find((p) => p.id === chosenProject)?.id ?? all.projects[0]?.id ?? null;

  const derived = useMemo(() => {
    const allEvents = scopeToProject(all.events, project);
    const latestTs = allEvents.at(-1)?.ts ?? null;
    const win = latestTs === null ? null : windowFor(range, latestTs);
    const events = win ? inWindow(allEvents, win) : allEvents;
    // Definitions come from every event; usage only from the range.
    const catalog = buildCatalog(allEvents, raw.snapshot, { since: win?.from });
    const sessions = buildInspector(events);
    const savings = estimateSavings(events, catalog);

    const prevWindow = latestTs === null ? null : previousWindow(range, latestTs);
    const prevEvents = prevWindow ? inWindow(allEvents, prevWindow) : [];
    const previous =
      prevEvents.length > 0
        ? {
            outcomes: summarizeOutcomes(servedOnly(callOutcomes(buildInspector(prevEvents)))),
            savedTotal: estimateSavings(prevEvents, catalog).savedTotal,
          }
        : null;

    return {
      events,
      allEvents,
      latestTs,
      window: win,
      previous,
      catalog,
      sessions,
      health: buildHealth(events),
      savings,
      // Learning is cumulative: the Boost view reads the project's whole history.
      boost: buildBoostStats(allEvents),
      boostView: buildBoostFromTrace(allEvents, { replay: raw.replay }),
    };
  }, [all, project, range, raw.snapshot, raw.replay]);

  const value: BurrowData = {
    status: raw.status,
    sources: raw.sources,
    projects: all.projects,
    project,
    setProject,
    range,
    setRange,
    badLines: all.badLines,
    graphs: raw.graphs,
    projectGraph: graphForProject(raw.graphs, project),
    snapshotError: raw.snapshotError,
    replay: raw.replay,
    replayError: raw.replayError,
    lastUpdated: raw.lastUpdated,
    ...derived,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** A project's own graph file wins; otherwise the dir's shared `intent-graph.json`, else the first. */
function graphForProject(
  graphs: readonly LoadedGraph[],
  project: string | null,
): LoadedGraph | null {
  const own = project ? `/intent-graphs/${projectFileName(project)}` : null;
  return (
    (own ? graphs.find((g) => g.source.path.endsWith(own)) : undefined) ??
    graphs.find((g) => g.source.path.endsWith("/intent-graph.json")) ??
    graphs[0] ??
    null
  );
}
