import {
  buildImprovements,
  callOutcomes,
  firstResultRate,
  formatCount,
  formatPercent,
  inResultsRate,
  needsAttention,
  outcomesByCapability,
  plural,
  servedOnly,
  summarizeOutcomes,
} from "@ratel-ai/burrow-model";
import {
  AlertTriangle,
  CircleCheck,
  CircleX,
  Eye,
  ListChecks,
  SearchX,
  Target,
  TriangleAlert,
} from "lucide-react";
import { useMemo } from "react";
import { Improvements } from "../components/Improvements";
import { BurrowMascot } from "../components/Mascot";
import { MostCalledCard, RankMixCard } from "../components/summary/Cards";
import { Environment } from "../components/summary/Environment";
import { Kpi } from "../components/summary/Kpi";
import { TokensSaved } from "../components/summary/TokensSaved";
import { pointDelta, relativeDelta, TrendChip } from "../components/summary/Trend";
import { Code, Empty } from "../components/ui";
import { useBurrow } from "../lib/data";
import { ORIGINS, TERMS } from "../lib/terms";

/** Summary: is Ratel working for this agent, and what should be fixed first? */
export function OverviewScreen() {
  const { sources, catalog, sessions, savings, health, previous, status, project } = useBurrow();
  const allOutcomes = useMemo(() => callOutcomes(sessions), [sessions]);
  // Rates count only searches Ratel served; observed ones are compared separately below.
  const outcomeList = useMemo(() => servedOnly(allOutcomes), [allOutcomes]);
  const observed = useMemo(
    () => summarizeOutcomes(allOutcomes.filter((o) => o.origin === "baseline")),
    [allOutcomes],
  );
  const outcomes = useMemo(() => summarizeOutcomes(outcomeList), [outcomeList]);
  const byTool = useMemo(() => outcomesByCapability(outcomeList), [outcomeList]);
  const improvements = useMemo(() => buildImprovements({ catalog, sessions }), [catalog, sessions]);
  const missedTools = new Set(
    outcomeList.filter((o) => o.outcome === "missed").map((o) => `${o.kind}:${o.id}`),
  ).size;
  const first = firstResultRate(outcomes);
  const inResults = inResultsRate(outcomes);
  const prev = previous?.outcomes ?? null;
  // Same thresholds as "What to improve" (needsAttention), so the counts agree.
  const attention = [...byTool.values()].filter(needsAttention).length;

  if (status === "ready" && sources.length === 0) return <SetupGuide />;

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-forest-300/60 bg-forest-600/60 px-6">
        <div className="pixel-grid pixel-grid-fade pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex items-center justify-between gap-6">
          <div className="min-w-0 py-6">
            <div className="eyebrow">Ratel Burrow{project ? ` · ${project}` : ""}</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">See what Ratel is doing.</h1>
            <p className="mt-2 text-sm text-cream-dim/80">Every search, call and lesson.</p>
            {attention > 0 ? (
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("improve")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs text-cream transition-colors hover:border-amber/70"
              >
                <TriangleAlert className="size-3.5 text-amber" strokeWidth={1.8} aria-hidden />
                {plural(attention, "tool")} to fix
              </button>
            ) : (
              <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-green/40 bg-green/10 px-3 py-1 text-xs text-cream">
                <CircleCheck className="size-3.5 text-green" strokeWidth={1.8} aria-hidden />
                All clear
              </span>
            )}
          </div>
          <BurrowMascot
            className="hidden w-80 shrink-0 sm:block"
            title="A honey badger peering out of its burrow"
          />
        </div>
      </section>

      {health.warnings.length ? (
        <div className="space-y-2 rounded-xl border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-cream-dim">
          {health.warnings.map((w) => (
            <div key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" /> {w}
            </div>
          ))}
        </div>
      ) : null}

      <TokensSaved />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Target}
          label={TERMS.firstResult.label}
          hint={TERMS.firstResult.hint}
          value={first === null ? "–" : formatPercent(first)}
          sub={`${formatCount(outcomes.first)} / ${formatCount(outcomes.ranked)} calls`}
          tone="green"
          trend={<Points now={first} before={prev ? firstResultRate(prev) : null} upIsGood />}
        />
        <Kpi
          icon={ListChecks}
          label={TERMS.inResults.label}
          hint={TERMS.inResults.hint}
          value={inResults === null ? "–" : formatPercent(inResults)}
          sub={`${formatCount(outcomes.ranked - outcomes.missed)} / ${formatCount(outcomes.ranked)} calls`}
          tone={inResults !== null && inResults < 0.8 ? "amber" : "green"}
          trend={<Points now={inResults} before={prev ? inResultsRate(prev) : null} upIsGood />}
        />
        <Kpi
          icon={SearchX}
          label={TERMS.missed.label}
          hint={TERMS.missed.hint}
          value={formatCount(outcomes.missed)}
          sub={plural(missedTools, "tool")}
          tone={outcomes.missed ? "amber" : "green"}
          trend={<Count now={outcomes.missed} before={prev?.missed ?? null} upIsGood={false} />}
        />
        <Kpi
          icon={CircleX}
          label={TERMS.failed.label}
          hint={TERMS.failed.hint}
          value={formatCount(outcomes.failed)}
          sub={`/ ${formatCount(outcomes.calls)} calls`}
          tone={outcomes.failed ? "coral" : "green"}
          trend={<Count now={outcomes.failed} before={prev?.failed ?? null} upIsGood={false} />}
        />
      </div>

      {observed.ranked > 0 ? (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-forest-300/60 bg-forest-600/40 px-4 py-2.5 text-sm"
          title={`${ORIGINS.baseline.hint} ${formatCount(observed.ranked)} observed calls.`}
        >
          <span className="eyebrow flex items-center gap-2">
            <Eye className="size-3.5" strokeWidth={1.7} aria-hidden />
            {ORIGINS.baseline.label} · {formatCount(observed.ranked)}
          </span>
          <span className="flex items-center gap-1.5 text-cream-dim">
            <Target className="size-3.5 text-warm-muted" strokeWidth={1.7} aria-hidden />
            <span className="font-mono text-cream tabular">
              {formatPercent(observed.first / observed.ranked)}
            </span>
            {TERMS.firstResult.label.toLowerCase()}
          </span>
          <span className="flex items-center gap-1.5 text-cream-dim">
            <ListChecks className="size-3.5 text-warm-muted" strokeWidth={1.7} aria-hidden />
            <span className="font-mono text-cream tabular">
              {formatPercent((observed.ranked - observed.missed) / observed.ranked)}
            </span>
            {TERMS.inResults.label.toLowerCase()}
          </span>
          <span className="ml-auto text-xs text-warm-muted">not counted above</span>
        </div>
      ) : null}

      <Improvements id="improve" items={improvements} searches={savings.searches} />

      <RankMixCard outcomes={outcomes} />

      <MostCalledCard byTool={byTool} />

      <Environment />
    </div>
  );
}

function Points({
  now,
  before,
  upIsGood,
}: {
  now: number | null;
  before: number | null;
  upIsGood: boolean;
}) {
  const d = pointDelta(now, before);
  return d ? <TrendChip text={d.text} up={d.up} good={d.up === upIsGood} /> : null;
}

function Count({
  now,
  before,
  upIsGood,
}: {
  now: number;
  before: number | null;
  upIsGood: boolean;
}) {
  const d = before === null ? null : relativeDelta(now, before);
  return d ? <TrendChip text={d.text} up={d.up} good={d.up === upIsGood} /> : null;
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
