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
import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { Improvements } from "../components/Improvements";
import { BurrowMascot } from "../components/Mascot";
import { MostCalledCard, RankMixCard, SearchQualityCard } from "../components/summary/Cards";
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

  const verdict = [
    savings.basis === "definitions"
      ? `Ratel kept ~${formatCount(savings.savedTotal)} tokens out of your model's context`
      : null,
    first !== null ? `the first result was right ${formatPercent(first)} of the time` : null,
    attention > 0 ? `${formatCount(attention)} tools need attention` : "nothing needs fixing",
  ].filter(Boolean);

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
            {verdict.length ? (
              <p className="mt-3 max-w-xl text-sm text-cream">{capitalize(verdict.join("; "))}.</p>
            ) : null}
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
          label={TERMS.firstResult.label}
          hint={TERMS.firstResult.hint}
          value={first === null ? "–" : formatPercent(first)}
          sub={`${formatCount(outcomes.first)} of ${formatCount(outcomes.ranked)} calls`}
          tone="green"
          trend={<Points now={first} before={prev ? firstResultRate(prev) : null} upIsGood />}
        />
        <Kpi
          label={TERMS.inResults.label}
          hint={TERMS.inResults.hint}
          value={inResults === null ? "–" : formatPercent(inResults)}
          sub={`${formatCount(outcomes.ranked - outcomes.missed)} of ${formatCount(outcomes.ranked)} calls`}
          tone={inResults !== null && inResults < 0.8 ? "amber" : "green"}
          trend={<Points now={inResults} before={prev ? inResultsRate(prev) : null} upIsGood />}
        />
        <Kpi
          label={TERMS.missed.label}
          hint={TERMS.missed.hint}
          value={formatCount(outcomes.missed)}
          sub={`across ${plural(missedTools, "tool")}`}
          tone={outcomes.missed ? "amber" : "green"}
          trend={<Count now={outcomes.missed} before={prev?.missed ?? null} upIsGood={false} />}
        />
        <Kpi
          label={TERMS.failed.label}
          hint={TERMS.failed.hint}
          value={formatCount(outcomes.failed)}
          sub={`of ${formatCount(outcomes.calls)} calls`}
          tone={outcomes.failed ? "coral" : "green"}
          trend={<Count now={outcomes.failed} before={prev?.failed ?? null} upIsGood={false} />}
        />
      </div>

      {observed.ranked > 0 ? (
        <p
          className="rounded-xl border border-forest-300/60 bg-forest-600/40 px-4 py-2.5 text-sm text-cream-dim"
          title={ORIGINS.baseline.hint}
        >
          <span className="eyebrow mr-2">When only watching</span>
          on {formatCount(observed.ranked)} observed calls, the agent's pick was Ratel's first
          result {formatPercent(observed.first / observed.ranked)} of the time and in its results{" "}
          {formatPercent((observed.ranked - observed.missed) / observed.ranked)}. These are not in
          the numbers above.
        </p>
      ) : null}

      <Improvements items={improvements} searches={savings.searches} />

      <div className="grid gap-5 lg:grid-cols-2">
        <RankMixCard outcomes={outcomes} />
        <SearchQualityCard />
      </div>

      <MostCalledCard byTool={byTool} />

      <Environment />
    </div>
  );
}

const capitalize = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s);

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
