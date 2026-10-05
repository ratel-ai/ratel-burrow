import {
  type BoostView,
  buildClusterTableRows,
  buildForceGraphModel,
  buildRankingState,
  buildSummaryTiles,
  graphRows,
  type IntentGraphDocument,
  missingKey,
  pageOfIndex,
  type RankingState,
} from "@ratel-ai/burrow-model";
import { ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { BoostPanel } from "../components/adaptive/BoostPanel";
import { ClusterDrawer } from "../components/adaptive/ClusterDrawer";
import { ClusterTable } from "../components/adaptive/ClusterTable";
import { buildBoostWarning, GraphMeta, GraphWarnings } from "../components/adaptive/GraphMeta";
import { GraphState } from "../components/adaptive/GraphState";
import { SummaryTiles } from "../components/adaptive/SummaryTiles";
import { type GraphMode, IntentGraphForce } from "../components/IntentGraphForce";
import { Code, Empty, PageHeader } from "../components/ui";
import { useBurrow } from "../lib/data";
import { navigate, useRoute } from "../lib/route";

/**
 * Mirrors Ratel Cloud's adaptive-ranking graph page: meta and warnings, the
 * graph's state, summary tiles, then the explorer (graph, Boost panel, the
 * cluster table folded away, and the cluster drawer). Read-only.
 */
export function AdaptiveScreen() {
  const { graphs, projectGraph, allEvents, catalog, boostView: boost } = useBurrow();
  const { params } = useRoute();
  const loaded = graphs.find((g) => g.source.id === params.get("graph")) ?? projectGraph;

  // Learning is cumulative: its state reads the whole history, not the time range.
  const state = useMemo(() => buildRankingState(allEvents), [allEvents]);
  const verdict =
    boost.online.fromTurn !== null ? boost.phases["ndcg@5"].online.verdict : boost.verdict;
  const warning = buildBoostWarning(verdict);

  const missing = useMemo(() => {
    const out = new Set<string>();
    if (!catalog.hasDefinitions || !loaded?.graph) return out;
    const tools = new Set(catalog.tools.filter((t) => !t.removed).map((t) => t.id));
    const skills = new Set(catalog.skills.filter((s) => !s.removed).map((s) => s.id));
    for (const e of graphRows(loaded.graph).edges) {
      const known = e.kind === "tool" ? tools : skills;
      if (!known.has(e.capabilityId)) out.add(missingKey(e.kind, e.capabilityId));
    }
    return out;
  }, [catalog, loaded]);

  return (
    <div className="space-y-5">
      {!loaded ? (
        <>
          <PageHeader eyebrow="Adaptive ranking" title="Intent graph" />
          <GraphWarnings warnings={warning ? [warning] : []} />
          <GraphState state={state} seededShare={null} />
          <Empty title="No intent graph found">
            Save your graph with{" "}
            <Code>new LocalFileIntentGraphStorage({"{ path: burrowPaths().intentGraph }"})</Code> or
            pass <Code>--intent-graph &lt;file&gt;</Code> to <Code>ratel-burrow</Code>.
          </Empty>
          <BoostPanel view={boost} />
        </>
      ) : loaded.error || !loaded.graph ? (
        <>
          <PageHeader eyebrow="Adaptive ranking" title="Intent graph" />
          <Empty title={`Could not read ${loaded.source.label}`}>{loaded.error}</Empty>
        </>
      ) : (
        <GraphPage
          key={loaded.source.id}
          doc={loaded.graph}
          byteSize={loaded.source.size}
          file={loaded.source.label}
          missing={missing}
          state={state}
          boost={boost}
          warning={warning}
        />
      )}
    </div>
  );
}

const MODES: ReadonlyArray<{ id: GraphMode; label: string; caption: string }> = [
  {
    id: "cousage",
    label: "Co-usage",
    caption: "Tools and skills; two are linked when they answered the same ask.",
  },
  {
    id: "intents",
    label: "Intents",
    caption: "Intent clusters as discs, linked to every tool and skill invoked for them.",
  },
];

function GraphPage({
  doc,
  byteSize,
  file,
  warning,
  missing,
  state,
  boost,
}: {
  doc: IntentGraphDocument;
  byteSize: number;
  file: string;
  warning: string | null;
  missing: ReadonlySet<string>;
  state: RankingState;
  boost: BoostView;
}) {
  const { clusters, edges } = useMemo(() => graphRows(doc), [doc]);
  const tiles = useMemo(() => buildSummaryTiles(clusters, edges), [clusters, edges]);
  const rows = useMemo(
    () => buildClusterTableRows(clusters, edges, missing),
    [clusters, edges, missing],
  );
  const model = useMemo(
    () => buildForceGraphModel(clusters, edges, { missing }),
    [clusters, edges, missing],
  );
  const seeded = clusters.reduce((sum, c) => sum + c.seededSupport, 0);
  const seededShare = tiles.totalSupport > 0 ? seeded / tiles.totalSupport : null;

  // One selection shared by the graph, the table and the drawer (Cloud's AdaptiveRankingExplorer).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<GraphMode>("cousage");
  const [tableOpen, setTableOpen] = useState(false);
  const current = MODES.find((m) => m.id === mode) ?? MODES[0];
  const selected = selectedId ? (rows.find((r) => r.clusterId === selectedId) ?? null) : null;
  const close = useCallback(() => setSelectedId(null), []);
  const toggle = useCallback(
    (clusterId: string) => {
      setSelectedId((cur) => {
        const next = cur === clusterId ? null : clusterId;
        if (next) {
          setPage(pageOfIndex(rows.findIndex((row) => row.clusterId === next)));
          setTableOpen(true);
        }
        return next;
      });
    },
    [rows],
  );

  return (
    <>
      {/* Title and state on the left, the graph's provenance beside them, both on the tiles' edge. */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Adaptive ranking</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-cream">Intent graph</h1>
          <div className="mt-3">
            <GraphState state={state} seededShare={seededShare} />
          </div>
        </div>
        <GraphMeta doc={doc} file={file} />
      </header>
      <GraphWarnings warnings={warning ? [warning] : []} />
      <SummaryTiles tiles={tiles} byteSize={byteSize} />

      <section className="rounded-2xl border border-forest-300 bg-forest-600/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-cream">Intent graph</h2>
          <div
            role="radiogroup"
            aria-label="Graph drawing"
            className="inline-flex rounded-md border border-forest-300 p-0.5 text-xs"
          >
            {MODES.map((m) => (
              // biome-ignore lint/a11y/useSemanticElements: a segmented control, as in Ratel Cloud
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`rounded px-2.5 py-1 transition-colors ${
                  mode === m.id ? "bg-forest-300 text-cream" : "text-cream-dim hover:text-cream"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-warm-muted" title={current?.caption}>
          {model.truncated
            ? ` Showing the ${model.truncated.drawn.toLocaleString("en-US")} highest-support clusters of ${model.truncated.total.toLocaleString("en-US")}.`
            : null}
        </p>
        {model.nodes.length === 0 ? (
          <p className="mt-4 text-sm text-warm-muted">
            Nothing to draw until the graph has clusters.
          </p>
        ) : (
          <div className="mt-4">
            <IntentGraphForce
              model={model}
              mode={mode}
              selectedClusterId={selectedId}
              onSelectCluster={toggle}
              onOpenCapability={(kind, id) => navigate("catalog", { tab: `${kind}s`, id })}
            />
          </div>
        )}
      </section>

      <BoostPanel view={boost} />

      <section>
        <button
          type="button"
          aria-expanded={tableOpen}
          onClick={() => setTableOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-sm font-medium text-cream-dim hover:text-cream"
        >
          <span className="inline-flex items-center gap-1.5">
            <ChevronRight
              className={`size-4 transition-transform ${tableOpen ? "rotate-90" : ""}`}
              aria-hidden
            />
            {tableOpen ? "Hide cluster details" : "Show cluster details"}
          </span>
          <span className="text-xs text-warm-muted">
            {rows.length.toLocaleString("en-US")} {rows.length === 1 ? "cluster" : "clusters"}
          </span>
        </button>
        {tableOpen ? (
          <div className="rounded-2xl border border-forest-300 bg-forest-600/60 p-4">
            <ClusterTable
              rows={rows}
              selectedId={selectedId}
              onSelect={toggle}
              page={page}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </section>

      <ClusterDrawer key={selected?.clusterId ?? "none"} row={selected} onClose={close} />
    </>
  );
}
