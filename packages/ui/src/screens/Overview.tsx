import {
  buildImprovements,
  buildRatelFlow,
  formatBytes,
  formatCount,
  formatPercent,
  plural,
  type RatelFlow,
  relativeTime,
} from "@ratel-ai/burrow-model";
import { ArrowRight, FileJson, FileText, Network, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { Improvements } from "../components/Improvements";
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
  const improvements = useMemo(() => buildImprovements({ catalog, sessions }), [catalog, sessions]);
  const recent = sessions
    .flatMap((s) => s.searches)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 5);
  const now = Date.now();

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-forest-300/60 bg-forest-600/60 px-6">
        <div className="pixel-grid pixel-grid-fade pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex items-center justify-between gap-6">
          <div className="min-w-0 py-6">
            <div className="eyebrow">Ratel Burrow{project ? ` · ${project}` : ""}</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">See what Ratel is doing.</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-cream-dim/80">
              Ratel dug this burrow claw by claw. Now it settles in and watches every search, every
              call, and everything it learns along the way.
            </p>
          </div>
          <BurrowMascot
            className="hidden w-80 shrink-0 sm:block"
            title="A honey badger peering out of its burrow"
          />
        </div>
      </section>

      {status === "ready" && sources.length === 0 ? <SetupGuide /> : <HowRatelWorks flow={flow} />}

      <Improvements items={improvements} searches={flow.search.searches} />

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
        <Sources className="self-start lg:col-span-2" />
      </div>
    </div>
  );
}

const pct = (n: number, of: number) => (of > 0 ? formatPercent(n / of) : "–");

/** What Ratel does for one request, as five steps with this project's numbers. */
function HowRatelWorks({ flow }: { flow: RatelFlow }) {
  const { catalog, search, call, learn, boost } = flow;
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">How Ratel works</h2>
      <ol className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Step
          title="Catalog"
          page="catalog"
          value={`${formatCount(catalog.tools)} tools`}
          detail={
            catalog.skills || catalog.facts
              ? `${catalog.skills} skills · ${catalog.facts} facts`
              : undefined
          }
          hint="What your agent could use; the model never sees the whole list."
        />
        <Step
          title="Search"
          page="inspector"
          value={`${formatCount(search.searches)} searches`}
          detail={search.searches ? `top ${search.avgReturned.toFixed(1)} returned` : undefined}
          hint="Ratel ranks the catalog and hands the model the top few."
        />
        <Step
          title="Call"
          page="inspector"
          value={
            call.ranked ? `${pct(call.topHit, call.ranked)} first pick` : `${call.calls} calls`
          }
          detail={call.ranked ? `${pct(call.inResults, call.ranked)} in results` : undefined}
          tone={call.ranked && call.notRetrieved / call.ranked > 0.2 ? "amber" : "green"}
          hint="Was the tool the agent ran Ratel's first result?"
        />
        <Step
          title="Learn"
          page="adaptive"
          value={learn ? `${formatCount(learn.intents)} intents` : "Off"}
          tone={learn ? "green" : "muted"}
          hint="Similar asks grouped, with the tool that answered each."
        />
        <Step
          title="Boost"
          page="adaptive"
          value={
            boost.recall1
              ? `${formatPercent(boost.recall1.with)} vs ${formatPercent(boost.recall1.without)}`
              : boost.active
                ? `${formatPercent(boost.matchRate)} matched`
                : "Off"
          }
          detail={boost.recall1 ? "with vs without" : undefined}
          tone={
            boost.recall1
              ? boost.recall1.with >= boost.recall1.without
                ? "green"
                : "amber"
              : boost.active
                ? "green"
                : "muted"
          }
          hint="Learned tools are promoted when a new ask matches. First result right, with the graph vs without."
        />
      </ol>
    </section>
  );
}

function Step({
  title,
  page,
  value,
  detail,
  hint,
  tone = "green",
}: {
  title: string;
  page: Page;
  value: string;
  detail?: string;
  hint: string;
  tone?: "green" | "amber" | "muted";
}) {
  const dot = { green: "bg-green", amber: "bg-amber", muted: "bg-warm-muted" }[tone];
  return (
    <li>
      <a
        href={href(page)}
        title={hint}
        className="group flex h-full flex-col rounded-xl border border-forest-300/60 bg-forest-600/70 px-3.5 py-3 transition-colors hover:border-green/50 hover:bg-forest-300/20"
      >
        <div className="eyebrow flex items-center gap-2">
          <span className={cx("inline-block size-1.5 rounded-full", dot)} aria-hidden />
          {title}
          <ArrowRight className="ml-auto size-3 text-warm-muted transition-colors group-hover:text-green" />
        </div>
        <div className="mt-1.5 font-mono text-lg leading-tight text-cream tabular">{value}</div>
        {detail ? <div className="mt-0.5 text-[11px] text-warm-muted">{detail}</div> : null}
      </a>
    </li>
  );
}

function Sources({ className }: { className?: string }) {
  const { sources, badLines, replayError } = useBurrow();
  const [open, setOpen] = useState(false);
  const ordered = [...sources].sort((a, b) => b.mtime - a.mtime);
  return (
    <Card title="Files" className={className}>
      <p className="text-sm text-cream-dim">
        {plural(ordered.filter((s) => s.kind === "trace").length, "trace")} ·{" "}
        {plural(ordered.filter((s) => s.kind === "intent_graph").length, "intent graph")}
        {ordered.some((s) => s.kind === "boost_replay") ? " · replay" : ""}
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
