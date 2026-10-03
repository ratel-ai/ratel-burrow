import {
  BOOST_DEFAULT_METRIC,
  BOOST_METRICS,
  BOOST_MIN_TURNS,
  type BoostArm,
  type BoostMetric,
  type BoostPoint,
  type BoostView,
} from "@ratel-ai/burrow-model";
import { useRef, useState } from "react";
import { labelEvery, smoothPath } from "../../lib/chart";

/**
 * Ported from Ratel Cloud's `components/adaptive-ranking/BoostPanel.tsx` (keep in sync).
 * Burrow's data comes from the trace: `adaptive` is what the runtime served,
 * `baseline` is the search's `base_hits` (the ranking without the usage arm).
 *
 * Does the graph move the target up the list? Per-turn curves for one metric
 * from the graph's experiment (`adaptive-ranking:<source>`), cumulative over
 * the whole run. Against a baseline both arms are drawn and the target is the
 * invoked tool; against a legacy ranker only the adaptive arm is drawn and the
 * target is the legacy first result, so the curve reads as agreement with it.
 * A dashed rule separates the offline turns from the online ones when the
 * graph has been boosted from. Static SVG, server-renderable.
 */

// The reference is neutral and the adaptive arm is the brand green; the two
// stay distinguishable in greyscale by weight as well as hue.
const ARM_COLOR: Record<BoostArm, string> = {
  reference: "var(--color-cream-dim)",
  adaptive: "var(--color-green)",
};

function shortDate(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 10, right: 12, bottom: 24, left: 36 };
const RADIO = "inline-flex rounded-md border border-forest-300 p-0.5 text-xs";
const radioItem = (active: boolean) =>
  `rounded px-2.5 py-1 transition-colors ${active ? "bg-forest-300 text-cream" : "text-cream-dim hover:text-cream"}`;

function fmt(metric: BoostMetric, value: number): string {
  return metric.startsWith("recall") ? pct(value) : value.toFixed(3);
}

/**
 * Y-axis that fits the drawn values with a little headroom. A full 0..100%
 * axis makes a 7-point lift look like a flat line; fitting the axis to the
 * curves is what lets the gap between the arms be read at all. The tick step
 * is the smallest round one that keeps the axis to at most six intervals, and
 * the bounds snap to it so every gridline is a round number. `includeZero`
 * keeps the zero line in view for a difference series.
 */
const TICK_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25];

export interface Domain {
  low: number;
  high: number;
  step: number;
}

export function fitDomain(values: readonly number[], includeZero = false): Domain {
  if (values.length === 0) return { low: 0, high: 1, step: 0.25 };
  const min = Math.min(...values, includeZero ? 0 : Number.POSITIVE_INFINITY);
  const max = Math.max(...values, includeZero ? 0 : Number.NEGATIVE_INFINITY);
  const pad = Math.max(0.02, (max - min) * 0.15);
  const rawLow = includeZero ? min - pad : Math.max(0, min - pad);
  const rawHigh = Math.min(1, max + pad);
  const step = TICK_STEPS.find((candidate) => (rawHigh - rawLow) / candidate <= 6) ?? 0.25;
  const low = Math.floor(rawLow / step) * step;
  const high = Math.min(1, Math.ceil(rawHigh / step) * step);
  return high > low
    ? { low, high, step }
    : { low: low - step, high: Math.min(1, high + step), step };
}

function ticksFor(domain: Domain): number[] {
  const count = Math.round((domain.high - domain.low) / domain.step);
  return Array.from({ length: count + 1 }, (_, i) => domain.low + domain.step * i);
}

/** One arm's curve: every point from the first turn the arm was measured on. */
function segment(
  points: readonly BoostPoint[],
  arm: BoostArm,
): { start: number; values: number[] } {
  const start = points.findIndex((p) => p.cumulative[arm] !== null);
  if (start < 0) return { start: 0, values: [] };
  return { start, values: points.slice(start).map((p) => p.cumulative[arm] ?? 0) };
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * The one-sentence answer above the chart. Over the online turns when the run
 * has a switch, since that is what the agent lived with; over every measured
 * turn otherwise. The default metric reads as a plain statement; the others
 * name themselves.
 */
function verdictSentence(view: BoostView, metric: BoostMetric, label: string): string {
  const fmtv = (v: number) => (metric.startsWith("recall") ? pct(v) : v.toFixed(3));
  const online = view.online.fromTurn !== null && view.phases[metric].online.turns > 0;
  const phase = view.phases[metric].online;
  const total = view.totals[metric];
  const n = online ? phase.turns : total.turns;
  const adaptive = online ? phase.adaptive : total.value.adaptive;
  const referenceValue = online ? phase.reference : total.value.reference;
  const verdict = online ? phase.verdict : view.verdict;
  const where = online ? "online " : "";
  const { arm, scored, kind, k } = view.reference;
  const plain = metric === BOOST_DEFAULT_METRIC;
  if (arm === null) {
    return plain
      ? `Over ${n} ${where}searches, the tool your agent used was the first result ${fmtv(adaptive)} of the time.`
      : `Over ${n} ${where}searches the graph's ranking scored ${fmtv(adaptive)} on ${label}, measured on the tool your agent used.`;
  }
  if (!scored) {
    return `Over ${n} ${where}searches the graph's ranking agreed with ${arm}'s top ${k ?? 1}: ${fmtv(adaptive)} on ${label}.`;
  }
  const versus = kind === "baseline" ? "without it" : `for your ${arm} ranking`;
  return plain
    ? `Over ${n} ${where}searches, the tool your agent used was the first result ${fmtv(adaptive)} of the time with the graph, against ${fmtv(referenceValue)} ${versus}. Better on ${verdict.better} searches, worse on ${verdict.worse}.`
    : `Over ${n} ${where}searches the graph's ranking scored ${fmtv(adaptive)} on ${label}, against ${fmtv(referenceValue)} ${versus}. Better on ${verdict.better} searches, worse on ${verdict.worse}.`;
}

function xAt(index: number, count: number): number {
  const plotW = WIDTH - PAD.left - PAD.right;
  return PAD.left + (count > 1 ? (plotW * index) / (count - 1) : 0);
}

function yAt(value: number, domain: Domain): number {
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  return PAD.top + plotH * (1 - (value - domain.low) / (domain.high - domain.low));
}

/** A curve over `values` placed at point indexes `offset..offset+n` of a `count`-point axis. */
function curve(values: readonly number[], domain: Domain, count: number, offset = 0): string {
  return smoothPath(values.map((v, i) => [xAt(offset + i, count), yAt(v, domain)] as const));
}

/** Closed region between two curves over the same indexes, for the shaded gap. */
function band(
  upper: readonly number[],
  lower: readonly number[],
  domain: Domain,
  count: number,
  offset = 0,
): string {
  const top = curve(upper, domain, count, offset);
  const bottom = smoothPath(
    lower.map((v, i) => [xAt(offset + i, count), yAt(v, domain)] as const).reverse(),
  );
  return `${top} ${bottom.replace(/^M/, "L")} Z`;
}

export function BoostPanel({ view }: { view: BoostView }) {
  const [metric, setMetric] = useState<BoostMetric>(BOOST_DEFAULT_METRIC);
  const [moreMetrics, setMoreMetrics] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const definition = BOOST_METRICS.find((m) => m.id === metric) ?? {
    id: metric,
    label: metric,
    hint: "",
  };
  // One metric a customer can say out loud; the rest on request.
  const shownMetrics = moreMetrics
    ? BOOST_METRICS
    : BOOST_METRICS.filter((m) => m.id === BOOST_DEFAULT_METRIC || m.id === metric);
  // Drop the opening turns whose running average is one or two samples; a
  // short run keeps everything rather than drawing nothing.
  const all = view.series[metric];
  const points = all.length > BOOST_MIN_TURNS ? all.slice(BOOST_MIN_TURNS - 1) : all;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const showLabel = labelEvery(points.length, 8);
  const reference = view.reference;
  const ref = reference.scored ? segment(points, "reference") : { start: 0, values: [] };
  const adaptive = segment(points, "adaptive");
  const domain = fitDomain([...ref.values, ...adaptive.values]);
  // The shaded gap covers the stretch both arms are drawn on.
  const bandStart = Math.max(ref.start, adaptive.start);
  const bandEnd = Math.min(ref.start + ref.values.length, adaptive.start + adaptive.values.length);
  const ticks = ticksFor(domain);
  const hovered = hover === null ? null : points[hover];
  const hoveredTurn = hovered ? view.turns[hovered.turn - 1] : null;
  // Index into the drawn points where the online period starts, if it falls inside them.
  const onlineFrom = view.online.fromTurn;
  const onlineIndex = onlineFrom === null ? null : points.findIndex((p) => p.turn >= onlineFrom);
  const onlineAt = onlineIndex === null || onlineIndex < 0 ? null : onlineIndex;

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const plotW = WIDTH - PAD.left - PAD.right;
    const index = Math.round(((x - PAD.left) / plotW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  return (
    <section
      data-boost-panel="true"
      data-boost-metric={metric}
      className="rounded-2xl border border-forest-300 bg-forest-600/60 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-cream">Boost</h2>
        {view.empty ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Metric" className={RADIO}>
              {shownMetrics.map((m) => (
                // biome-ignore lint/a11y/useSemanticElements: a segmented control, as in Ratel Cloud
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={metric === m.id}
                  onClick={() => setMetric(m.id)}
                  className={radioItem(metric === m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-expanded={moreMetrics}
              onClick={() => setMoreMetrics((open) => !open)}
              className="text-xs text-warm-muted underline-offset-2 hover:text-cream hover:underline"
            >
              {moreMetrics ? "Fewer metrics" : "More metrics"}
            </button>
          </div>
        )}
      </div>

      {view.empty ? null : (
        <p data-boost-verdict="true" className="mt-3 text-sm leading-6 text-cream">
          {verdictSentence(view, metric, definition.label)}
        </p>
      )}
      {!view.empty && !view.reported && reference.arm === null ? (
        <p className="mt-1 text-xs text-warm-muted">
          Graph ranking only: your SDK doesn't record the ranking without it yet.
        </p>
      ) : null}
      {!view.empty && view.estimated ? (
        <p
          data-boost-estimated={view.reported ? "offline" : "all"}
          className="mt-1 text-xs text-warm-muted"
        >
          {view.reported
            ? "Reported by your runtime where the graph changed a search; the rest replayed locally (BM25)."
            : "Estimated: searches replayed locally (BM25). Your runtime's ranking may differ."}
        </p>
      ) : null}

      {view.empty ? (
        <p data-boost-empty="true" className="mt-4 text-sm text-warm-muted">
          No boosting data yet. Burrow reads it from your trace: the runtime records both rankings
          on every search an intent graph changed (
          <code className="font-mono text-cream-dim">base_hits</code> on{" "}
          <code className="font-mono text-cream-dim">search</code> events) and reports when adaptive
          ranking turns on (<code className="font-mono text-cream-dim">usage_ranking_status</code>).
          Your Ratel SDK does not emit these yet; they arrive with the next core release. Each
          scored turn also needs the tool the agent invoked after the search.
          {view.evidence.skipped > 0
            ? ` ${view.evidence.skipped} recorded searches could not be scored: an arm or a target was missing.`
            : null}
        </p>
      ) : (
        <>
          <div className="relative mt-4">
            <svg
              ref={svgRef}
              role="img"
              aria-label={`${definition.label}, cumulative, ${reference.scored ? `${reference.arm} against adaptive` : `adaptive against ${reference.arm}`} from turn ${points[0]?.turn ?? 1} to ${points.at(-1)?.turn ?? 0}`}
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              width="100%"
              className="block touch-none"
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHover(null)}
            >
              {ticks.map((tick, index) => {
                const y = PAD.top + plotH * (1 - index / (ticks.length - 1));
                return (
                  <g key={tick}>
                    <line
                      x1={PAD.left}
                      x2={WIDTH - PAD.right}
                      y1={y}
                      y2={y}
                      stroke="var(--color-forest-300)"
                      strokeWidth={1}
                      strokeDasharray={index === 0 ? undefined : "2 4"}
                    />
                    <text
                      x={PAD.left - 6}
                      y={y + 3}
                      textAnchor="end"
                      fontSize={9}
                      fill="var(--color-warm-muted)"
                      className="font-mono"
                    >
                      {pct(tick)}
                    </text>
                  </g>
                );
              })}
              {points.map((p, i) =>
                showLabel(i) ? (
                  <text
                    key={p.turn}
                    x={
                      PAD.left +
                      (points.length > 1
                        ? ((WIDTH - PAD.left - PAD.right) * i) / (points.length - 1)
                        : 0)
                    }
                    y={HEIGHT - 8}
                    textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                    fontSize={9}
                    fill="var(--color-warm-muted)"
                    className="font-mono"
                  >
                    {p.turn}
                  </text>
                ) : null,
              )}
              {onlineAt !== null ? (
                <g data-boost-online-from={points[onlineAt]?.turn}>
                  <rect
                    x={xAt(onlineAt, points.length)}
                    y={PAD.top}
                    width={WIDTH - PAD.right - xAt(onlineAt, points.length)}
                    height={plotH}
                    fill="var(--color-cream)"
                    fillOpacity={0.04}
                  />
                  <line
                    x1={xAt(onlineAt, points.length)}
                    x2={xAt(onlineAt, points.length)}
                    y1={PAD.top}
                    y2={HEIGHT - PAD.bottom}
                    stroke="var(--color-cream-dim)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  {onlineAt > 0 ? (
                    <text
                      x={xAt(onlineAt, points.length) - 5}
                      y={PAD.top + 9}
                      textAnchor="end"
                      fontSize={9}
                      fill="var(--color-warm-muted)"
                      className="font-mono uppercase"
                    >
                      offline
                    </text>
                  ) : null}
                  <text
                    x={xAt(onlineAt, points.length) + 5}
                    y={PAD.top + 9}
                    textAnchor="start"
                    fontSize={9}
                    fill="var(--color-green)"
                    className="font-mono uppercase"
                  >
                    online
                  </text>
                </g>
              ) : null}
              {reference.scored && ref.values.length > 0 ? (
                <>
                  {bandEnd > bandStart ? (
                    /* The gap is the finding: shade it so a few points read as a band, not two near-parallel lines. */
                    <path
                      data-boost-gap="true"
                      d={band(
                        adaptive.values.slice(bandStart - adaptive.start, bandEnd - adaptive.start),
                        ref.values.slice(bandStart - ref.start, bandEnd - ref.start),
                        domain,
                        points.length,
                        bandStart,
                      )}
                      fill="var(--color-green)"
                      fillOpacity={0.16}
                      stroke="none"
                    />
                  ) : null}
                  <path
                    data-boost-series="reference"
                    data-boost-reference-arm={reference.arm ?? ""}
                    d={curve(ref.values, domain, points.length, ref.start)}
                    fill="none"
                    stroke={ARM_COLOR.reference}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </>
              ) : null}
              {adaptive.values.length > 0 ? (
                <path
                  data-boost-series="adaptive"
                  d={curve(adaptive.values, domain, points.length, adaptive.start)}
                  fill="none"
                  stroke={ARM_COLOR.adaptive}
                  strokeWidth={2.25}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {hovered && hover !== null ? (
                <g data-boost-crosshair="true" pointerEvents="none">
                  <line
                    x1={xAt(hover, points.length)}
                    x2={xAt(hover, points.length)}
                    y1={PAD.top}
                    y2={HEIGHT - PAD.bottom}
                    stroke="var(--color-cream)"
                    strokeOpacity={0.35}
                    strokeWidth={1}
                  />
                  {(reference.scored
                    ? (["reference", "adaptive"] as const)
                    : (["adaptive"] as const)
                  ).map((pick) => {
                    const value = hovered.cumulative[pick];
                    return value === null ? null : (
                      <circle
                        key={pick}
                        cx={xAt(hover, points.length)}
                        cy={yAt(value, domain)}
                        r={3.5}
                        fill={ARM_COLOR[pick]}
                        stroke="var(--color-forest-600)"
                        strokeWidth={1.5}
                      />
                    );
                  })}
                </g>
              ) : null}
            </svg>
            {hovered && hoveredTurn ? (
              <div
                role="tooltip"
                data-boost-tooltip="true"
                className="pointer-events-none absolute top-2 z-10 rounded-md border border-forest-300 bg-forest-600 px-2.5 py-1.5 text-xs text-cream shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)]"
                style={{
                  left: `${Math.min(88, Math.max(0, (xAt(hover ?? 0, points.length) / WIDTH) * 100 + 1))}%`,
                }}
              >
                <div className="font-medium">
                  Turn {hovered.turn} · cumulative
                  {view.online.fromTurn !== null && hovered.turn >= view.online.fromTurn
                    ? " since online"
                    : ""}
                </div>
                <div className="mt-0.5 tabular-nums text-cream-dim">
                  {reference.scored && hovered.cumulative.reference !== null ? (
                    <>
                      <span style={{ color: ARM_COLOR.reference }}>●</span> {reference.arm}{" "}
                      {fmt(metric, hovered.cumulative.reference)}
                    </>
                  ) : null}
                  {hovered.cumulative.adaptive !== null ? (
                    <>
                      {reference.scored && hovered.cumulative.reference !== null ? " · " : ""}
                      <span style={{ color: ARM_COLOR.adaptive }}>●</span> adaptive{" "}
                      {fmt(metric, hovered.cumulative.adaptive)}
                      {reference.scored && hovered.cumulative.reference !== null ? (
                        <>
                          {" · lift "}
                          {hovered.cumulative.adaptive - hovered.cumulative.reference >= 0
                            ? "+"
                            : ""}
                          {fmt(metric, hovered.cumulative.adaptive - hovered.cumulative.reference)}
                        </>
                      ) : reference.arm && !reference.scored ? (
                        ` against ${reference.arm}`
                      ) : null}
                    </>
                  ) : (
                    " · adaptive not yet running"
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-warm-muted">
                  {hoveredTurn.tier === "revealed"
                    ? `this turn: invoked tool at rank ${hoveredTurn.rank.reference ?? "—"} on the ${reference.arm ?? "served"} list, ${hoveredTurn.rank.adaptive ?? "—"} on the adaptive list`
                    : `this turn: ${reference.arm}'s first result at rank ${hoveredTurn.rank.adaptive ?? "—"} on the adaptive list`}
                  {view.online.since !== null ? ` · ${hoveredTurn.phase}` : ""}
                </div>
              </div>
            ) : null}
          </div>

          <p data-boost-evidence="true" className="mt-4 text-[11px] leading-5 text-warm-muted">
            {view.turns.length} turns, top-{view.k}
            {all.length > BOOST_MIN_TURNS ? `, drawn from turn ${BOOST_MIN_TURNS}` : ""}. Reference:{" "}
            {reference.arm ?? "none"}
            {reference.arm && reference.k ? ` (top ${reference.k})` : ""}. Targets:{" "}
            {view.evidence.revealed} invoked tools
            {view.evidence.reference > 0
              ? `, ${view.evidence.reference} ${reference.arm} lists`
              : ""}
            {view.evidence.skipped > 0 ? `, ${view.evidence.skipped} unscored` : ""}.
            {view.online.since !== null
              ? view.online.fromTurn === null
                ? ` All turns are offline: no runtime had boosted from this graph before ${shortDate(view.online.since)} UTC.`
                : view.online.fromTurn === 1
                  ? ` All turns are online: runtimes have boosted from this graph since ${shortDate(view.online.since)} UTC.`
                  : ` Offline through turn ${view.online.fromTurn - 1}, online from turn ${view.online.fromTurn} (${shortDate(view.online.since)} UTC${view.online.source === "served" ? ", when the graph's ranking started reaching your agent" : ""}).`
              : ""}
            {reference.scored &&
            view.phases[metric].offline.turns > 0 &&
            view.phases[metric].online.turns > 0
              ? ` ${reference.arm} ${definition.label} ${fmt(metric, view.phases[metric].offline.reference)} offline, ${fmt(metric, view.phases[metric].online.reference)} online.`
              : ""}
            {view.evidence.bias.adaptive === "independent" &&
            view.evidence.revealed > 0 &&
            reference.arm
              ? ` Your agent saw the ${reference.arm} results; the graph's ranking ran alongside without affecting them.`
              : null}
            {view.evidence.bias.adaptive === "self-selected" && view.evidence.revealed > 0
              ? " Your agent saw the graph's ranking for these searches and could only pick from it, so read the result as an upper bound."
              : null}
            {view.evidence.bias.adaptive === "mixed" && view.evidence.revealed > 0 && reference.arm
              ? ` Before the switch your agent saw the ${reference.arm} results; after it, the graph's ranking.`
              : null}
          </p>
        </>
      )}
    </section>
  );
}
