import {
  buildClusterTableRows,
  buildForceGraphModel,
  buildSummaryTiles,
  formatCount,
  formatPercent,
  graphRows,
  type IntentGraphDocument,
  missingKey,
  modelLabel,
  relativeTime,
  SUPPORT_FULL,
  truncateMembers,
} from "@ratel-ai/burrow-model";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { TimeChart } from "../components/charts";
import { type GraphMode, IntentGraphForce } from "../components/IntentGraphForce";
import {
  Card,
  Code,
  cx,
  Drawer,
  Empty,
  Field,
  KindDot,
  Meter,
  PageHeader,
  Pill,
  SearchInput,
  Tabs,
  Tile,
} from "../components/ui";
import { useBurrow } from "../lib/data";
import { href, navigate, useRoute } from "../lib/route";

export function AdaptiveScreen() {
  const { graphs, boost, catalog } = useBurrow();
  const { params } = useRoute();
  const graphParam = params.get("graph");
  const loaded = graphs.find((g) => g.source.id === graphParam) ?? graphs[0] ?? null;
  const clusterParam = params.get("cluster");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Adaptive ranking" title="What Ratel learned from usage">
        Adaptive ranking groups similar queries into <em>intents</em> and remembers which tools and
        skills the agent actually called for each. When a new query matches an intent, Ratel
        promotes those capabilities. The graph shows what it has learned; the panel below shows
        whether it is changing results.
      </PageHeader>

      <IsItWorking />

      {graphs.length === 0 ? (
        <Empty title="No intent graph found">
          Save your graph with{" "}
          <Code>new LocalFileIntentGraphStorage({"{ path: burrowPaths().intentGraph }"})</Code> or
          pass <Code>--intent-graph &lt;file&gt;</Code> to <Code>ratel-burrow</Code>.
        </Empty>
      ) : (
        <>
          {graphs.length > 1 ? (
            <Tabs
              value={loaded?.source.id ?? ""}
              onChange={(id) => navigate("adaptive", { graph: id })}
              options={graphs.map((g) => ({ value: g.source.id, label: g.source.label }))}
            />
          ) : null}
          {loaded?.error ? (
            <Empty title={`Could not read ${loaded.source.label}`}>{loaded.error}</Empty>
          ) : loaded?.graph ? (
            <GraphView
              key={loaded.source.id}
              doc={loaded.graph}
              sourceLabel={loaded.source.label}
              sourceId={loaded.source.id}
              clusterId={clusterParam}
              knownTools={
                catalog.hasDefinitions
                  ? new Set(catalog.tools.filter((t) => !t.removed).map((t) => t.id))
                  : null
              }
              knownSkills={
                catalog.hasDefinitions
                  ? new Set(catalog.skills.filter((t) => !t.removed).map((t) => t.id))
                  : null
              }
            />
          ) : null}
        </>
      )}

      {boost.warnings.length > 0 ? (
        <Card title="Warnings">
          <ul className="space-y-2 text-sm">
            {boost.warnings.map((w) => (
              <li key={w} className="flex gap-2 text-cream-dim">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" /> {w}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function IsItWorking() {
  const { boost } = useBurrow();
  if (!boost.active) {
    return (
      <Card title="Is it working?">
        <p className="text-sm text-warm-muted">
          No <Code>usage_boost</Code> events yet, so adaptive ranking is off or has not run a
          search. Turn it on with <Code>catalog.experimentalEnableAdaptiveRanking(graph)</Code>.
        </p>
      </Card>
    );
  }
  const verdict =
    boost.matchRate >= 0.3 && boost.promoted > 0
      ? {
          tone: "green" as const,
          text: "Yes: queries are matching learned intents and Ratel is promoting capabilities.",
        }
      : boost.matched > 0
        ? {
            tone: "amber" as const,
            text: "Partly: some queries match, but few promotions so far. It strengthens as the agent keeps calling tools.",
          }
        : {
            tone: "amber" as const,
            text: "Not yet: no query has matched a learned intent. The graph grows from invocations.",
          };
  return (
    <Card title="Is it working?" hint={verdict.text}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Searches consulted" value={formatCount(boost.boosts)} />
        <Tile
          label="Matched an intent"
          value={formatPercent(boost.matchRate)}
          sub={`${boost.matched} searches`}
          tone={verdict.tone}
        />
        <Tile label="Capabilities promoted" value={formatCount(boost.promoted)} tone="green" />
        <Tile
          label="Dropped (not in catalog)"
          value={formatCount(boost.dropped)}
          tone={boost.dropped ? "amber" : "muted"}
        />
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="eyebrow mb-2">Share of searches matching an intent</div>
          <TimeChart
            label="Share of searches matching an intent over time"
            points={boost.series.map((b) => ({
              x: b.start,
              y: b.boosts ? b.matched / b.boosts : null,
              detail: [`${b.matched} of ${b.boosts} matched`, `${b.promoted} promoted`],
            }))}
            color="var(--color-green)"
            yMax={1}
            format={(v) => formatPercent(v)}
          />
        </div>
        <div>
          <div className="eyebrow mb-2">Rank of the tool the agent called (lower is better)</div>
          <TimeChart
            kind="line"
            label="Mean rank of the invoked tool over time"
            points={boost.series.map((b) => ({
              x: b.start,
              y: b.meanInvokedRank,
              detail:
                b.missShare === null
                  ? []
                  : [`${formatPercent(b.missShare)} of calls not retrieved`],
            }))}
            color="var(--color-green)"
            format={(v) => v.toFixed(1)}
          />
        </div>
      </div>
    </Card>
  );
}

function GraphView({
  doc,
  sourceLabel,
  sourceId,
  clusterId,
  knownTools,
  knownSkills,
}: {
  doc: IntentGraphDocument;
  sourceLabel: string;
  sourceId: string;
  clusterId: string | null;
  knownTools: Set<string> | null;
  knownSkills: Set<string> | null;
}) {
  const [mode, setMode] = useState<GraphMode>("cousage");
  const [filter, setFilter] = useState("");
  const { clusters, edges } = useMemo(() => graphRows(doc), [doc]);
  const missing = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      const known = e.kind === "tool" ? knownTools : knownSkills;
      if (known && !known.has(e.capabilityId)) set.add(missingKey(e.kind, e.capabilityId));
    }
    return set;
  }, [edges, knownTools, knownSkills]);
  const tiles = useMemo(() => buildSummaryTiles(clusters, edges), [clusters, edges]);
  const rows = useMemo(
    () => buildClusterTableRows(clusters, edges, missing),
    [clusters, edges, missing],
  );
  const model = useMemo(
    () => buildForceGraphModel(clusters, edges, { missing }),
    [clusters, edges, missing],
  );
  const selected = clusterId ? (rows.find((r) => r.clusterId === clusterId) ?? null) : null;
  const now = Date.now();
  const q = filter.trim().toLowerCase();
  const shown = q
    ? rows.filter(
        (r) =>
          r.displayLabel.toLowerCase().includes(q) ||
          r.terms.some((t) => t.toLowerCase().includes(q)) ||
          r.edges.some((e) => e.id.toLowerCase().includes(q)),
      )
    : rows;
  const select = (id: string | null) =>
    navigate("adaptive", { graph: sourceId, cluster: id ?? undefined });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs text-warm-muted">
        <span className="font-mono text-cream-dim">{sourceLabel}</span>
        <Pill>rev {doc.rev ?? 0}</Pill>
        <Pill>{modelLabel(doc.model ?? null)}</Pill>
        {doc.cluster_policy ? (
          <Pill>
            similarity {doc.cluster_policy.similarity ?? "–"} · coverage{" "}
            {doc.cluster_policy.coverage ?? "–"}
          </Pill>
        ) : null}
        <span>built from events up to {relativeTime(doc.built_from_ts, now)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Intents"
          value={formatCount(tiles.clusters)}
          sub={`${tiles.singletonClusters} with one query`}
        />
        <Tile
          label="Fully weighted"
          value={formatPercent(
            tiles.clusters ? tiles.clustersWithFullSupport / tiles.clusters : null,
          )}
          sub={`support ≥ ${SUPPORT_FULL}`}
          tone="green"
        />
        <Tile
          label="Capabilities learned"
          value={`${tiles.distinctTools} · ${tiles.distinctSkills}`}
          sub="tools · skills"
        />
        <Tile
          label="Queries remembered"
          value={formatCount(tiles.membersTotal)}
          sub={`${formatPercent(tiles.centroidCoverage)} with embeddings`}
        />
      </div>

      <Card
        title="Capability graph"
        hint={
          mode === "cousage"
            ? "Tools and skills, linked when they answered the same intent. Bigger means called more often."
            : "Intents (cream discs) with a spoke to every capability called for them."
        }
        actions={
          <Tabs<GraphMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "cousage", label: "Co-usage" },
              { value: "intents", label: "Intents" },
            ]}
          />
        }
      >
        {model.nodes.length === 0 ? (
          <p className="text-sm text-warm-muted">
            No edges yet: the graph has intents but no confirmed calls.
          </p>
        ) : (
          <>
            <IntentGraphForce
              model={model}
              mode={mode}
              selectedClusterId={clusterId}
              onSelectCluster={(id) => select(id)}
              onOpenCapability={(kind, id) => navigate("catalog", { tab: `${kind}s`, id })}
            />
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-warm-muted">
              <span className="flex items-center gap-1.5">
                <KindDot kind="tool" /> tool
              </span>
              <span className="flex items-center gap-1.5">
                <KindDot kind="skill" /> skill
              </span>
              {mode === "intents" ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-cream-dim/60" /> intent
                </span>
              ) : null}
              {missing.size ? <span>dashed ring = not in the current catalog</span> : null}
              {model.truncated ? (
                <span>
                  showing the strongest {model.truncated.drawn} of {model.truncated.total} intents
                </span>
              ) : null}
            </div>
          </>
        )}
      </Card>

      <Card
        title="Intents"
        actions={<SearchInput value={filter} onChange={setFilter} placeholder="Filter intents…" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-forest-300/70">
                <th className="eyebrow py-2 pr-4 font-normal">Intent</th>
                <th className="eyebrow w-40 py-2 pr-4 font-normal">Support</th>
                <th className="eyebrow py-2 pr-4 font-normal">Top tool</th>
                <th className="eyebrow py-2 pr-4 font-normal">Top skill</th>
                <th className="eyebrow py-2 pr-4 text-right font-normal">Queries</th>
                <th className="eyebrow py-2 text-right font-normal">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.clusterId}
                  onClick={() => select(r.clusterId)}
                  className={cx(
                    "cursor-pointer border-b border-forest-300/40 hover:bg-forest-300/25",
                    r.clusterId === clusterId && "bg-forest-300/40",
                  )}
                >
                  <td className="max-w-xs py-2.5 pr-4">
                    <div className="truncate text-cream">{r.displayLabel}</div>
                    <div className="truncate font-mono text-[11px] text-warm-muted">
                      {r.clusterId}
                      {r.terms.length ? ` · ${r.terms.slice(0, 4).join(", ")}` : ""}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <Meter ratio={r.supportRamp} />
                      <span className="w-6 font-mono text-xs text-cream-dim">{r.support}</span>
                    </div>
                  </td>
                  <td className="max-w-48 truncate py-2.5 pr-4 font-mono text-xs text-cream-dim">
                    {r.topTool ? `${r.topTool.id} · ${r.topTool.weight}×` : "–"}
                  </td>
                  <td className="max-w-48 truncate py-2.5 pr-4 font-mono text-xs text-cream-dim">
                    {r.topSkill ? `${r.topSkill.id} · ${r.topSkill.weight}×` : "–"}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs text-cream-dim">
                    {r.memberCount}
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs text-warm-muted">
                    {relativeTime(r.lastTs, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => select(null)}
        title={
          selected ? (
            <div>
              <div className="eyebrow">Intent · {selected.clusterId}</div>
              <div className="mt-1 text-base text-cream">{selected.displayLabel}</div>
            </div>
          ) : null
        }
      >
        {selected ? (
          <>
            <Field label="Weight">
              <div className="flex items-center gap-3">
                <Meter ratio={selected.supportRamp} />
                <span className="whitespace-nowrap font-mono text-xs">
                  support {selected.support}
                  {selected.seededSupport ? ` (${selected.seededSupport} seeded)` : ""}
                </span>
              </div>
              <p className="mt-1 text-xs text-warm-muted">
                One confirmed search nudges ranking; {SUPPORT_FULL} or more give the intent full
                weight.
              </p>
            </Field>
            {selected.terms.length ? (
              <Field label="Terms">
                <div className="flex flex-wrap gap-1.5">
                  {selected.terms.map((t) => (
                    <Pill key={t}>{t}</Pill>
                  ))}
                </div>
              </Field>
            ) : null}
            <Field label={`Queries in this intent (${selected.memberCount})`}>
              <MemberList members={selected.members} />
            </Field>
            <Field label="Promotes">
              <ul className="space-y-1.5">
                {selected.edges.map((e) => (
                  <li
                    key={`${e.kind}:${e.id}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <KindDot kind={e.kind} />
                    <a
                      className="font-mono text-[13px] hover:underline"
                      href={href("catalog", { tab: `${e.kind}s`, id: e.id })}
                    >
                      {e.id}
                    </a>
                    <Pill>{e.weight}× called</Pill>
                    {e.surfaced !== null ? (
                      <Pill title="Damping: min(1, (called + 3) / (shown + 3)). Capabilities shown but not picked lose weight.">
                        shown {e.surfaced}× · keeps {formatPercent(e.damper)}
                      </Pill>
                    ) : null}
                    {e.missing ? <Pill tone="amber">not in catalog</Pill> : null}
                  </li>
                ))}
              </ul>
            </Field>
          </>
        ) : null}
      </Drawer>
    </>
  );
}

function MemberList({ members }: { members: string[] }) {
  const [all, setAll] = useState(false);
  const { shown, hidden } = truncateMembers(members, all ? members.length : 5);
  return (
    <div>
      <ul className="space-y-1">
        {shown.map((m) => (
          <li key={m} className="rounded-md bg-base-deep/40 px-2.5 py-1.5 text-sm text-cream-dim">
            {m}
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-2 text-xs text-green hover:underline"
        >
          Show {hidden} more
        </button>
      ) : null}
    </div>
  );
}
