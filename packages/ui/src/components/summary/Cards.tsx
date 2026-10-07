import {
  type CapabilityOutcomes,
  type CatalogEntry,
  formatCount,
  formatMs,
  formatPercent,
  type OutcomeSummary,
} from "@ratel-ai/burrow-model";
import { useCallback, useState } from "react";
import { useBurrow } from "../../lib/data";
import { href } from "../../lib/route";
import { EntryModal } from "../catalog/EntryModal";
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
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {MIX_PARTS.map((p) => (
              <li key={p.key}>
                <div className="font-mono text-2xl text-cream tabular">
                  {formatPercent(outcomes[p.key] / total)}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-cream-dim">
                  <span className={cx("size-2.5 shrink-0 rounded-sm", p.color)} aria-hidden />
                  {p.label}
                  <span className="font-mono text-warm-muted">{formatCount(outcomes[p.key])}</span>
                </div>
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

const TOP_TOOLS = 10;

/** The busiest tools, with how often search missed each one. A click opens the tool in place. */
export function MostCalledCard({ byTool }: { byTool: Map<string, CapabilityOutcomes> }) {
  const { health, catalog } = useBurrow();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<{ kind: "tool" | "skill" | "fact"; id: string } | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const entry = open
    ? (catalog[`${open.kind}s`].find((e: CatalogEntry) => e.id === open.id) ?? null)
    : null;
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
                  {catalog[`${t.kind}s`].some((e: CatalogEntry) => e.id === t.id) ? (
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: t.kind, id: t.id })}
                      className="flex max-w-full items-center gap-2 text-left font-mono text-[13px] text-cream hover:underline"
                      title={t.lastError ?? undefined}
                    >
                      <KindDot kind={t.kind} />
                      <span className="truncate">{t.id}</span>
                    </button>
                  ) : (
                    <span
                      className="flex items-center gap-2 font-mono text-[13px] text-cream"
                      title={t.lastError ?? undefined}
                    >
                      <KindDot kind={t.kind} />
                      <span className="truncate">{t.id}</span>
                    </span>
                  )}
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
      {entry ? (
        <EntryModal
          entry={entry}
          onClose={close}
          catalogHref={href("catalog", { tab: `${entry.kind}s`, id: entry.id })}
        />
      ) : null}
    </Card>
  );
}
