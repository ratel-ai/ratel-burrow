import {
  formatBytes,
  formatCount,
  formatPercent,
  plural,
  relativeTime,
} from "@ratel-ai/burrow-model";
import { FileJson, FileText, Network, Repeat } from "lucide-react";
import { useState } from "react";
import { BurrowMascot } from "../components/Mascot";
import { Card, Code, Empty, KindDot, Pill, Tile } from "../components/ui";
import { useBurrow } from "../lib/data";
import { href } from "../lib/route";

const SOURCE_ICON = {
  trace: FileText,
  intent_graph: Network,
  catalog_snapshot: FileJson,
  boost_replay: Repeat,
};
const SOURCE_KIND = {
  trace: "trace",
  intent_graph: "intent graph",
  catalog_snapshot: "catalog",
  boost_replay: "replay",
};

export function OverviewScreen() {
  const { sources, catalog, health, savings, sessions, boost, graphs, status, badLines } =
    useBurrow();
  const recent = sessions
    .flatMap((s) => s.searches)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6);
  const now = Date.now();
  const [showAll, setShowAll] = useState(false);
  // Newest first; long trace histories collapse behind a toggle.
  const ordered = [...sources].sort((a, b) => b.mtime - a.mtime);
  const visibleSources = showAll ? ordered : ordered.slice(0, 8);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-forest-300/60 bg-forest-600/60 px-8 py-7">
        <div className="pixel-grid pixel-grid-fade pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex flex-wrap items-center gap-8">
          <BurrowMascot
            className="w-64 shrink-0"
            title="A honey badger stepping out of its burrow"
          />
          <div className="min-w-64 flex-1">
            <div className="eyebrow">Ratel Burrow</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">See what Ratel is doing.</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-cream-dim/80">
              A read-only view over the files Ratel already writes: your catalog, every search and
              the calls it led to, the intent graph adaptive ranking learns, and how healthy your
              agent's tools are. Nothing here changes your Ratel config.
            </p>
          </div>
        </div>
      </section>

      {status === "ready" && sources.length === 0 ? <SetupGuide /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile
          label="Searches"
          value={formatCount(health.totals.searches)}
          sub={plural(health.totals.sessions, "session")}
          tone="green"
        />
        <Tile
          label="Calls"
          value={formatCount(health.totals.invocations)}
          sub={`${formatPercent(health.totals.invocations ? health.totals.errors / health.totals.invocations : null)} failed`}
          tone={health.totals.errors ? "coral" : "green"}
        />
        <Tile
          label="Tools"
          value={catalog.tools.length}
          sub={catalog.hasDefinitions ? "with definitions" : "ids only"}
        />
        <Tile label="Skills" value={catalog.skills.length} />
        <Tile label="Facts" value={catalog.facts.length} />
        <Tile
          label="Tokens saved"
          value={`~${formatCount(savings.savedTotal)}`}
          sub={savings.basis === "none" ? "no catalog size yet" : "estimated"}
          tone="green"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          title="Latest searches"
          className="lg:col-span-3"
          actions={
            <a className="text-xs text-green hover:underline" href={href("inspector")}>
              Open inspector →
            </a>
          }
        >
          {recent.length === 0 ? (
            <p className="text-sm text-warm-muted">No searches recorded yet.</p>
          ) : (
            <ul className="divide-y divide-forest-300/50">
              {recent.map((s) => (
                <li key={s.key}>
                  <a
                    href={href("inspector", { session: s.sessionId, search: s.key })}
                    className="flex items-center gap-3 py-2.5 hover:bg-forest-300/20"
                  >
                    <KindDot kind={s.kind} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {s.query || <em className="text-warm-muted">empty query</em>}
                    </span>
                    <span className="font-mono text-xs text-warm-muted">{s.hitCount} hits</span>
                    {s.invocations.length ? (
                      <Pill tone="green">{s.invocations.length} called</Pill>
                    ) : null}
                    <span className="w-16 text-right font-mono text-xs text-warm-muted">
                      {relativeTime(s.ts, now)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="What Burrow is reading" className="lg:col-span-2">
          {sources.length === 0 ? (
            <p className="text-sm text-warm-muted">
              Nothing yet. Burrow re-checks every few seconds.
            </p>
          ) : (
            <ul className="space-y-2">
              {visibleSources.map((s) => {
                const Icon = SOURCE_ICON[s.kind];
                return (
                  <li key={s.id} className="flex items-center gap-2.5 text-sm" title={s.path}>
                    <Icon className="size-4 shrink-0 text-warm-muted" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-cream-dim">
                      {s.label}
                    </span>
                    <span className="eyebrow">{SOURCE_KIND[s.kind]}</span>
                    <span className="w-14 text-right font-mono text-xs text-warm-muted">
                      {formatBytes(s.size)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {ordered.length > 8 ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs text-green hover:underline"
            >
              {showAll ? "Show fewer" : `Show all ${ordered.length} files`}
            </button>
          ) : null}
          <div className="mt-4 space-y-1 border-t border-forest-300/50 pt-3 text-xs text-warm-muted">
            {!catalog.hasDefinitions && catalog.tools.length > 0 ? (
              <p>
                Tool descriptions and schemas were not recorded. Use <Code>burrowConfig()</Code> or
                turn on catalog definitions.
              </p>
            ) : null}
            {graphs.length === 0 ? <p>No intent graph found, so the graph view is empty.</p> : null}
            {boost.active ? (
              <p>
                Adaptive ranking is on: {formatPercent(boost.matchRate)} of searches matched a
                learned intent.
              </p>
            ) : null}
            {badLines > 0 ? <p>{badLines} unreadable trace lines were skipped.</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SetupGuide() {
  return (
    <Empty title="No Ratel data found yet">
      <p>
        Add <Code>...burrowConfig()</Code> to your <Code>ratel()</Code> config (or{" "}
        <Code>ToolCatalog(**burrow_config())</Code> in Python) and run <Code>ratel-burrow</Code>{" "}
        from the same folder. Traces land in <Code>./.ratel/burrow</Code>.
      </p>
      <p className="mt-2">
        Already writing traces elsewhere? Pass <Code>--trace &lt;file|dir&gt;</Code>.
      </p>
    </Empty>
  );
}
