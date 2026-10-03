import {
  buildRatelFlow,
  formatBytes,
  formatCount,
  formatPercent,
  type RatelFlow,
  relativeTime,
} from "@ratel-ai/burrow-model";
import { ArrowRight, FileJson, FileText, Network, Repeat } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { BurrowMascot } from "../components/Mascot";
import { Card, Code, cx, Empty, KindDot, Pill } from "../components/ui";
import { useBurrow } from "../lib/data";
import { href, type Page } from "../lib/route";

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
  const { sources, catalog, sessions, savings, boost, boostView, projectGraph, status, project } =
    useBurrow();
  const graph = projectGraph?.graph ?? null;
  const flow = useMemo(
    () =>
      buildRatelFlow({ catalog, sessions, savings, boost: boostView, boostStats: boost, graph }),
    [catalog, sessions, savings, boostView, boost, graph],
  );
  const recent = sessions
    .flatMap((s) => s.searches)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5);
  const now = Date.now();

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-forest-300/60 bg-forest-600/60 px-6 py-4">
        <div className="pixel-grid pixel-grid-fade pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex flex-wrap items-center gap-6">
          <BurrowMascot
            className="w-44 shrink-0"
            title="A honey badger peering out of its burrow"
          />
          <div className="min-w-64 flex-1">
            <div className="eyebrow">Ratel Burrow{project ? ` · ${project}` : ""}</div>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
              See what Ratel is doing.
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-cream-dim/80">
              The free, local view of what Ratel Cloud shows: your catalog, every search and the
              call it led to, and what adaptive ranking learned. Read-only, from the files Ratel
              already writes.
            </p>
          </div>
        </div>
      </section>

      {status === "ready" && sources.length === 0 ? <SetupGuide /> : <HowRatelWorks flow={flow} />}

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
                    {s.invocations[0] ? (
                      <Pill tone={s.invocations[0].rank === 1 ? "green" : "amber"}>
                        {s.invocations[0].rank === null
                          ? "not retrieved"
                          : `rank ${s.invocations[0].rank}`}
                      </Pill>
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
        <Sources className="lg:col-span-2" />
      </div>
    </div>
  );
}

const pct = (n: number, of: number) => (of > 0 ? formatPercent(n / of) : "–");

/**
 * What Ratel does for one request, as five steps with this project's numbers.
 * Each step is a screen here and a page in Ratel Cloud.
 */
function HowRatelWorks({ flow }: { flow: RatelFlow }) {
  const { catalog, search, call, learn, boost } = flow;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">How Ratel works, in this project</h2>
        <span className="text-xs text-warm-muted">one request, from catalog to boost</span>
      </div>
      <ol className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Step
          n={1}
          title="Catalog"
          page="catalog"
          value={`${formatCount(catalog.tools)} tools`}
          detail={`${catalog.skills} skills · ${catalog.facts} facts${catalog.defined ? "" : " · ids only"}`}
        >
          What your agent could use; the model never sees the whole list.
        </Step>
        <Step
          n={2}
          title="Search"
          page="inspector"
          value={`${formatCount(search.searches)} searches`}
          detail={
            search.searches
              ? `returns ${search.avgReturned.toFixed(1)} of ${search.catalogSize} tools${
                  search.tokensSavedPerSearch
                    ? ` · ~${formatCount(search.tokensSavedPerSearch)} tokens kept out`
                    : ""
                }`
              : "none yet"
          }
        >
          Ratel ranks the catalog and hands the model the top few.
        </Step>
        <Step
          n={3}
          title="Call"
          page="inspector"
          value={
            call.ranked ? `${pct(call.topHit, call.ranked)} first pick` : `${call.calls} calls`
          }
          detail={
            call.ranked
              ? `${pct(call.inResults, call.ranked)} in results · ${call.notRetrieved} not retrieved · ${call.failed} failed`
              : "no ranked calls yet"
          }
          tone={call.ranked && call.notRetrieved / call.ranked > 0.2 ? "amber" : "green"}
        >
          Was the tool the agent ran Ratel's first result?
        </Step>
        <Step
          n={4}
          title="Learn"
          page="adaptive"
          value={learn ? `${formatCount(learn.intents)} intents` : "Off"}
          detail={
            learn
              ? `${formatCount(learn.observations)} confirmed searches${
                  learn.seededShare > 0
                    ? ` · ${formatPercent(learn.seededShare)} built offline`
                    : ""
                }`
              : "no intent graph saved"
          }
          tone={learn ? "green" : "muted"}
        >
          Similar asks grouped, with the tool that answered each.
        </Step>
        <Step
          n={5}
          title="Boost"
          page="adaptive"
          value={
            boost.recall1
              ? `${formatPercent(boost.recall1.with)} vs ${formatPercent(boost.recall1.without)}`
              : boost.active
                ? `${formatPercent(boost.matchRate)} matched`
                : "Off"
          }
          detail={
            boost.recall1
              ? "first result with the graph vs without"
              : boost.active
                ? "searches that matched a learned intent"
                : "adaptive ranking is not on"
          }
          tone={
            boost.recall1
              ? boost.recall1.with >= boost.recall1.without
                ? "green"
                : "amber"
              : boost.active
                ? "green"
                : "muted"
          }
        >
          Learned tools are promoted when a new ask matches.
        </Step>
      </ol>
    </section>
  );
}

function Step({
  n,
  title,
  page,
  value,
  detail,
  tone = "green",
  children,
}: {
  n: number;
  title: string;
  page: Page;
  value: string;
  detail: string;
  tone?: "green" | "amber" | "muted";
  children: ReactNode;
}) {
  const dot = { green: "bg-green", amber: "bg-amber", muted: "bg-warm-muted" }[tone];
  return (
    <li>
      <a
        href={href(page)}
        className="group flex h-full flex-col rounded-xl border border-forest-300/60 bg-forest-600/70 px-3.5 py-3 transition-colors hover:border-green/50 hover:bg-forest-300/20"
      >
        <div className="eyebrow flex items-center gap-2">
          <span className="font-mono text-cream-dim">{n}</span>
          <span className={cx("inline-block size-1.5 rounded-full", dot)} aria-hidden />
          {title}
          <ArrowRight className="ml-auto size-3 text-warm-muted transition-colors group-hover:text-green" />
        </div>
        <div className="mt-1.5 font-mono text-lg leading-tight text-cream tabular">{value}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-warm-muted">{detail}</div>
        <p className="mt-2 text-[11px] leading-snug text-cream-dim/70">{children}</p>
      </a>
    </li>
  );
}

function Sources({ className }: { className?: string }) {
  const { sources, badLines, replayError } = useBurrow();
  const [open, setOpen] = useState(false);
  const ordered = [...sources].sort((a, b) => b.mtime - a.mtime);
  return (
    <Card title="What Burrow is reading" className={className}>
      <p className="text-sm text-cream-dim">
        {ordered.filter((s) => s.kind === "trace").length} trace file(s),{" "}
        {ordered.filter((s) => s.kind === "intent_graph").length} intent graph(s)
        {ordered.some((s) => s.kind === "boost_replay")
          ? ", searches replayed with your Ratel SDK"
          : ""}
        .
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs text-green hover:underline"
      >
        {open ? "Hide files" : "Show files"}
      </button>
      {open ? (
        <ul className="mt-3 space-y-2">
          {ordered.map((s) => {
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
      ) : null}
      {badLines > 0 || replayError ? (
        <div className="mt-4 space-y-1 border-t border-forest-300/50 pt-3 text-xs text-warm-muted">
          {badLines > 0 ? <p>{badLines} unreadable trace lines were skipped.</p> : null}
          {replayError ? <p>Replay unavailable: {replayError}</p> : null}
        </div>
      ) : null}
    </Card>
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
