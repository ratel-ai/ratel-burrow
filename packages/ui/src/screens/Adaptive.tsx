import {
  type BoostView,
  buildClusterTableRows,
  buildForceGraphModel,
  buildRankingState,
  formatBytes,
  formatCount,
  formatPercent,
  graphRows,
  type IntentGraphDocument,
  learnedAsks,
  MAX_INTENT_GRAPH_CLUSTERS,
  missingKey,
  modelLabel,
  pageOfIndex,
  plural,
  relativeTime,
} from "@ratel-ai/burrow-model";
import { ArrowRight, ChevronRight } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { BoostPanel } from "../components/adaptive/BoostPanel";
import { ClusterDrawer } from "../components/adaptive/ClusterDrawer";
import { ClusterTable } from "../components/adaptive/ClusterTable";
import { GraphState } from "../components/adaptive/GraphState";
import { buildBoostWarning, GraphWarnings } from "../components/adaptive/GraphWarnings";
import { type GraphMode, IntentGraphForce } from "../components/IntentGraphForce";
import { Kpi } from "../components/summary/Kpi";
import { Card, Code, cx, Empty, PageHeader, SearchInput } from "../components/ui";
import { useBurrow } from "../lib/data";
import { navigate, useRoute } from "../lib/route";
import { TERMS } from "../lib/terms";

/**
 * Learning: did adaptive ranking help, and what did it learn? The answer first
 * (lift, patterns, searches it recognised), then the patterns in plain text; the
 * map and the full pattern table are one click away.
 */
export function AdaptiveScreen() {
  const { graphs, projectGraph, allEvents, catalog, boostView: boost, boost: stats } = useBurrow();
  const { params } = useRoute();
  const loaded = graphs.find((g) => g.source.id === params.get("graph")) ?? projectGraph;

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

  const lift = liftOf(boost);
  const doc = loaded?.graph ?? null;
  const support = doc ? doc.intents.reduce((n, i) => n + i.support, 0) : 0;
  const seeded = doc ? doc.intents.reduce((n, i) => n + (i.seeded_support ?? 0), 0) : 0;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Learning" title="What Ratel learned from your agent" />
      <GraphState state={state} seededShare={support > 0 ? seeded / support : null} />
      <GraphWarnings warnings={warning ? [warning] : []} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="Learning lift"
          hint="How often the first result was right with learning, against the same searches without it."
          value={lift ? `${lift.pts >= 0 ? "+" : ""}${lift.pts} pts` : "–"}
          sub={
            lift
              ? `${formatPercent(lift.with)} first result right, vs ${formatPercent(lift.without)} without`
              : "needs searches ranked both ways"
          }
          tone={lift ? (lift.pts >= 0 ? "green" : "coral") : "muted"}
        />
        <Kpi
          label={TERMS.patterns.label}
          hint={TERMS.patterns.hint}
          value={doc ? formatCount(doc.intents.length) : "–"}
          sub={doc ? `from ${formatCount(support)} confirmed searches` : "no saved graph"}
          tone={doc ? "green" : "muted"}
        />
        <Kpi
          label="Searches it recognised"
          hint="Searches that matched a learned pattern, so learning could reorder the results."
          value={stats.boosts ? formatPercent(stats.matchRate) : "–"}
          sub={
            stats.boosts
              ? `${formatCount(stats.matched)} of ${formatCount(stats.boosts)} · ${plural(stats.promoted, "tool")} promoted`
              : "adaptive ranking is not on"
          }
          tone={stats.boosts ? "green" : "muted"}
        />
      </div>

      {!loaded ? (
        <>
          <Empty title="No intent graph found">
            Save your graph with{" "}
            <Code>new LocalFileIntentGraphStorage({"{ path: burrowPaths().intentGraph }"})</Code> or
            pass <Code>--intent-graph &lt;file&gt;</Code> to <Code>ratel-burrow</Code>.
          </Empty>
          <BoostPanel view={boost} />
        </>
      ) : loaded.error || !loaded.graph ? (
        <Empty title={`Could not read ${loaded.source.label}`}>{loaded.error}</Empty>
      ) : (
        <GraphPage
          key={loaded.source.id}
          doc={loaded.graph}
          file={loaded.source.label}
          byteSize={loaded.source.size}
          missing={missing}
          boost={boost}
        />
      )}
    </div>
  );
}

/** First result right with learning vs without: online when the graph served, else overall. */
function liftOf(boost: BoostView): { with: number; without: number; pts: number } | null {
  if (boost.empty || !boost.reference.scored) return null;
  const online = boost.online.fromTurn !== null && boost.phases["recall@1"].online.turns > 0;
  const w = online
    ? boost.phases["recall@1"].online.adaptive
    : boost.totals["recall@1"].value.adaptive;
  const wo = online
    ? boost.phases["recall@1"].online.reference
    : boost.totals["recall@1"].value.reference;
  return { with: w, without: wo, pts: Math.round((w - wo) * 100) };
}

const MODES: ReadonlyArray<{ id: GraphMode; label: string }> = [
  { id: "intents", label: "Patterns and their tools" },
  { id: "cousage", label: "Tools used together" },
];

const ASKS_SHOWN = 12;

function GraphPage({
  doc,
  file,
  byteSize,
  missing,
  boost,
}: {
  doc: IntentGraphDocument;
  file: string;
  byteSize: number;
  missing: ReadonlySet<string>;
  boost: BoostView;
}) {
  const { clusters, edges } = useMemo(() => graphRows(doc), [doc]);
  const rows = useMemo(
    () => buildClusterTableRows(clusters, edges, missing),
    [clusters, edges, missing],
  );
  const model = useMemo(
    () => buildForceGraphModel(clusters, edges, { missing }),
    [clusters, edges, missing],
  );
  const [filter, setFilter] = useState("");
  const asks = useMemo(() => learnedAsks(doc, filter), [doc, filter]);
  const [allAsks, setAllAsks] = useState(false);

  // One selection shared by the patterns list, the map, the table and the drawer.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<GraphMode>("intents");
  const [mapOpen, setMapOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const selected = selectedId ? (rows.find((r) => r.clusterId === selectedId) ?? null) : null;
  const close = useCallback(() => setSelectedId(null), []);
  const toggle = useCallback(
    (clusterId: string) => {
      setSelectedId((cur) => {
        const next = cur === clusterId ? null : clusterId;
        if (next) setPage(pageOfIndex(rows.findIndex((row) => row.clusterId === next)));
        return next;
      });
    },
    [rows],
  );
  const shown = allAsks ? asks : asks.slice(0, ASKS_SHOWN);

  return (
    <>
      <Card
        title="What your agent asks for"
        hint="Each pattern groups similar requests and remembers which tools answered them; learning promotes those tools when a similar request comes in."
        actions={<SearchInput value={filter} onChange={setFilter} placeholder="Filter patterns…" />}
      >
        {asks.length === 0 ? (
          <p className="text-sm text-warm-muted">
            {filter ? "No pattern matches this filter." : "Nothing learned yet."}
          </p>
        ) : (
          <ul className="divide-y divide-forest-300/50">
            {shown.map((ask) => (
              <li key={ask.id}>
                <button
                  type="button"
                  onClick={() => toggle(ask.id)}
                  className={cx(
                    "grid w-full gap-x-4 gap-y-1.5 rounded-md px-2 py-3 text-left transition-colors hover:bg-forest-300/20 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]",
                    selectedId === ask.id && "bg-forest-300/30",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-cream">{ask.label}</div>
                    {ask.examples.length ? (
                      <div className="mt-0.5 truncate text-xs text-warm-muted">
                        also: {ask.examples.map((e) => `“${e}”`).join(" · ")}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <ArrowRight className="size-3.5 shrink-0 text-warm-muted" aria-hidden />
                    {ask.answers.map((a) => (
                      <span
                        key={`${a.kind}:${a.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-forest-300 bg-base-deep/40 px-1.5 py-0.5 font-mono text-[11px] text-cream-dim"
                        title={`${formatCount(a.count)} confirmed calls`}
                      >
                        {a.id}
                        <span className="text-warm-muted">{formatPercent(a.share)}</span>
                      </span>
                    ))}
                  </div>
                  <div className="text-right font-mono text-xs text-warm-muted">
                    {plural(ask.support, "search", "searches")}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {asks.length > ASKS_SHOWN ? (
          <button
            type="button"
            onClick={() => setAllAsks((v) => !v)}
            className="mt-2 text-xs text-green hover:underline"
          >
            {allAsks ? "Show fewer" : `Show all ${formatCount(asks.length)}`}
          </button>
        ) : null}
      </Card>

      <BoostPanel view={boost} />

      <Disclosure
        open={mapOpen}
        onToggle={() => setMapOpen((v) => !v)}
        label="Show the map"
        openLabel="Hide the map"
        aside="how patterns and tools connect"
      >
        <div className="mb-3 flex justify-end">
          <div
            role="radiogroup"
            aria-label="Map drawing"
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
        {model.nodes.length === 0 ? (
          <p className="text-sm text-warm-muted">Nothing to draw until something is learned.</p>
        ) : (
          <IntentGraphForce
            model={model}
            mode={mode}
            selectedClusterId={selectedId}
            onSelectCluster={toggle}
            onOpenCapability={(kind, id) => navigate("catalog", { tab: `${kind}s`, id })}
          />
        )}
      </Disclosure>

      <Disclosure
        open={tableOpen}
        onToggle={() => setTableOpen((v) => !v)}
        label="Show every pattern in detail"
        openLabel="Hide pattern details"
        aside={plural(rows.length, "pattern")}
      >
        <ClusterTable
          rows={rows}
          selectedId={selectedId}
          onSelect={toggle}
          page={page}
          onPageChange={setPage}
        />
      </Disclosure>

      <p className="font-mono text-[11px] text-warm-muted" title={doc.model}>
        {formatCount(doc.intents.length)} of {formatCount(MAX_INTENT_GRAPH_CLUSTERS)} patterns ·{" "}
        {formatBytes(byteSize)} · updated {relativeTime(doc.built_from_ts)} · rev {doc.rev ?? 0} ·{" "}
        {file}
        {` · ${modelLabel(doc.model ?? null)}`}
      </p>

      <ClusterDrawer key={selected?.clusterId ?? "none"} row={selected} onClose={close} />
    </>
  );
}

function Disclosure({
  open,
  onToggle,
  label,
  openLabel,
  aside,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  openLabel: string;
  aside: string;
  children: ReactNode;
}) {
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2 text-sm font-medium text-cream-dim hover:text-cream"
      >
        <span className="inline-flex items-center gap-1.5">
          <ChevronRight
            className={`size-4 transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden
          />
          {open ? openLabel : label}
        </span>
        <span className="text-xs text-warm-muted">{aside}</span>
      </button>
      {open ? (
        <div className="rounded-2xl border border-forest-300 bg-forest-600/60 p-4">{children}</div>
      ) : null}
    </section>
  );
}
