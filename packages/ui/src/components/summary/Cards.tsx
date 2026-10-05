import {
  buildAgentHealth,
  type CapabilityOutcomes,
  formatCount,
  formatMs,
  formatPercent,
  type OutcomeSummary,
} from "@ratel-ai/burrow-model";
import { CircleCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useBurrow } from "../../lib/data";
import { href } from "../../lib/route";
import { Card, cx, KindDot } from "../ui";

const MIX_PARTS = [
  { key: "first", label: "First result", color: "bg-green" },
  { key: "top3", label: "2nd or 3rd", color: "bg-green/45" },
  { key: "lower", label: "4th or lower", color: "bg-amber/70" },
  { key: "missed", label: "Not in results", color: "bg-coral/80" },
] as const;

/** Where the called tool sat in the search before it, as one bar and a legend. */
export function RankMixCard({ outcomes }: { outcomes: OutcomeSummary }) {
  const total = outcomes.ranked;
  return (
    <Card title="Where the called tool ranked">
      {total === 0 ? (
        <p className="text-sm text-warm-muted">No calls after a search yet.</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-forest-300/40">
            {MIX_PARTS.map((p) =>
              outcomes[p.key] ? (
                <div
                  key={p.key}
                  className={p.color}
                  style={{ width: `${(outcomes[p.key] / total) * 100}%` }}
                  title={`${p.label}: ${outcomes[p.key]}`}
                />
              ) : null,
            )}
          </div>
          <ul className="mt-4 space-y-2">
            {MIX_PARTS.map((p) => (
              <li key={p.key} className="flex items-center gap-2.5 text-sm">
                <span className={cx("size-2.5 rounded-sm", p.color)} aria-hidden />
                <span className="text-cream-dim">{p.label}</span>
                <span className="ml-auto font-mono text-xs text-warm-muted">
                  {formatCount(outcomes[p.key])}
                </span>
                <span className="w-12 text-right font-mono text-xs text-cream">
                  {formatPercent(outcomes[p.key] / total)}
                </span>
              </li>
            ))}
          </ul>
          {outcomes.missed > 0 ? (
            <a
              href={href("inspector", { filter: "problems" })}
              className="mt-3 inline-block text-xs text-green hover:underline"
            >
              See the {formatCount(outcomes.missed)} missed searches →
            </a>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Retries, waste and speed: only what actually happened, or one all-clear line. */
export function SearchQualityCard() {
  const { events, health } = useBurrow();
  const agent = useMemo(() => buildAgentHealth(events, { floor: 1 }), [events]);
  const tile = (key: string) => agent.tiles.find((t) => t.key === key);
  const detours = tile("detours");
  const wasted = tile("wasted_calls");
  const junk = tile("junk");
  const rows: { label: string; value: string; sub?: string; bad?: boolean; hint?: string }[] = [];
  if (detours && detours.count > 0)
    rows.push({
      label: "Searched again for the same thing",
      value: formatPercent(detours.value),
      sub: `${formatCount(detours.count)} turns`,
      bad: true,
    });
  if (wasted && wasted.count > 0)
    rows.push({
      label: "Wasted calls",
      value: formatCount(wasted.count),
      sub: "repeats, retries, or searching again",
      bad: true,
    });
  if (health.totals.errors > 0)
    rows.push({
      label: "Failed calls",
      value: formatCount(health.totals.errors),
      sub: `of ${formatCount(health.totals.invocations)}`,
      bad: true,
    });
  if (junk && junk.count > 0)
    rows.push({
      label: "Results that barely matched",
      value: formatPercent(junk.value),
      sub: `${formatCount(junk.count)} of ${formatCount(junk.n)} returned`,
      hint: "Returned results scoring under 90% of the top one. Many of these is normal with a large top K; it costs context, not accuracy.",
    });
  return (
    <Card title="Search quality">
      {rows.some((r) => r.bad) ? null : (
        <p className="mb-2 flex items-center gap-2 text-sm text-cream-dim">
          <CircleCheck className="size-4 text-green" strokeWidth={1.7} aria-hidden />
          All clear: no retries, failures or wasted calls.
        </p>
      )}
      <ul className="divide-y divide-forest-300/50">
        {rows.map((r) => (
          <li key={r.label} className="flex items-baseline gap-3 py-2.5 text-sm" title={r.hint}>
            <span className="text-cream-dim">{r.label}</span>
            {r.sub ? (
              <span className="ml-auto font-mono text-xs text-warm-muted">{r.sub}</span>
            ) : null}
            <span
              className={cx(
                "w-16 text-right font-mono tabular",
                r.sub ? "" : "ml-auto",
                r.bad ? "text-amber" : "text-cream",
              )}
            >
              {r.value}
            </span>
          </li>
        ))}
        <li className="flex items-baseline gap-3 py-2.5 text-sm">
          <span className="text-cream-dim">Typical time</span>
          <span className="ml-auto font-mono text-xs text-warm-muted">
            search {formatMs(health.searchLatency.p50)} · call {formatMs(health.invokeLatency.p50)}
          </span>
        </li>
      </ul>
    </Card>
  );
}

const TOP_TOOLS = 10;

/** The busiest tools, with how often search missed each one. */
export function MostCalledCard({ byTool }: { byTool: Map<string, CapabilityOutcomes> }) {
  const { health } = useBurrow();
  const [all, setAll] = useState(false);
  if (!health.tools.length) return null;
  const tools = all ? health.tools : health.tools.slice(0, TOP_TOOLS);
  const max = Math.max(1, ...health.tools.map((t) => t.calls));
  return (
    <Card
      title="Most called"
      actions={
        <a className="text-xs text-green hover:underline" href={href("catalog", { tab: "tools" })}>
          All tools →
        </a>
      }
    >
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-forest-300/70">
            <th className="eyebrow py-2 pr-4 font-normal">Tool</th>
            <th className="eyebrow w-1/3 py-2 pr-4 font-normal">Calls</th>
            <th className="eyebrow py-2 pr-4 text-right font-normal">Missed by search</th>
            <th className="eyebrow py-2 pr-4 text-right font-normal">Failed</th>
            <th className="eyebrow py-2 text-right font-normal">Typical time</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => {
            const missed = byTool.get(`${t.kind}:${t.id}`)?.missed ?? 0;
            return (
              <tr key={`${t.kind}:${t.id}`} className="border-b border-forest-300/40 last:border-0">
                <td className="max-w-sm py-2 pr-4">
                  <a
                    href={href("catalog", { tab: `${t.kind}s`, id: t.id })}
                    className="flex items-center gap-2 font-mono text-[13px] text-cream hover:underline"
                    title={t.lastError ?? undefined}
                  >
                    <KindDot kind={t.kind} />
                    <span className="truncate">{t.id}</span>
                  </a>
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-forest-300/40">
                      <div
                        className="h-full rounded-full bg-green/70"
                        style={{ width: `${(t.calls / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-xs">{t.calls}</span>
                  </div>
                </td>
                <td
                  className={cx(
                    "py-2 pr-4 text-right font-mono text-xs",
                    missed ? "text-amber" : "text-warm-muted",
                  )}
                >
                  {missed}
                </td>
                <td
                  className={cx(
                    "py-2 pr-4 text-right font-mono text-xs",
                    t.errors ? "text-coral" : "text-warm-muted",
                  )}
                >
                  {t.errors}
                </td>
                <td className="py-2 text-right font-mono text-xs">{formatMs(t.p50)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {health.tools.length > TOP_TOOLS ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-3 text-xs text-green hover:underline"
        >
          {all ? "Show fewer" : `Show all ${health.tools.length}`}
        </button>
      ) : null}
    </Card>
  );
}
