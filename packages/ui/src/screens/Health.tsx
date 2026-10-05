import {
  buildAgentHealth,
  formatBytes,
  formatCount,
  formatMs,
  formatPercent,
  type HealthTile,
  relativeTime,
  type SessionTimeline,
} from "@ratel-ai/burrow-model";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { TimeChart } from "../components/charts";
import { Card, Code, cx, KindDot, Pill } from "../components/ui";
import { useBurrow } from "../lib/data";
import { href } from "../lib/route";

const AUTH_LABEL = {
  ok: { label: "ok", tone: "green" as const },
  needs_auth: { label: "needs sign-in", tone: "amber" as const },
  refresh_failed: { label: "token refresh failed", tone: "coral" as const },
  flow_failed: { label: "sign-in failed", tone: "coral" as const },
};

const TOP_TOOLS = 10;

/** Where each called tool sat in the search before it, across every session. */
function rankMix(sessions: readonly SessionTimeline[]) {
  const mix = { first: 0, top: 0, lower: 0, missed: 0, calls: 0 };
  for (const session of sessions) {
    for (const search of session.searches) {
      if (search.kind !== "tool") continue;
      for (const call of search.invocations) {
        mix.calls += 1;
        if (call.rank === null) mix.missed += 1;
        else if (call.rank === 1) mix.first += 1;
        else if (call.rank <= 3) mix.top += 1;
        else mix.lower += 1;
      }
    }
  }
  return mix;
}

const MIX_PARTS = [
  { key: "first", label: "First result", color: "bg-green" },
  { key: "top", label: "2nd or 3rd", color: "bg-green/45" },
  { key: "lower", label: "4th or lower", color: "bg-amber/70" },
  { key: "missed", label: "Not in results", color: "bg-coral/80" },
] as const;

/** A local dashboard: tokens saved first, then how well search worked, then the runtime. */
export function HealthScreen() {
  const { health, events, sessions, project } = useBurrow();
  const agent = useMemo(() => buildAgentHealth(events), [events]);
  const mix = useMemo(() => rankMix(sessions), [sessions]);
  const tile = (key: HealthTile["key"]) => agent.tiles.find((t) => t.key === key);
  const firstTry = tile("first_try");
  const detours = tile("detours");
  const junk = tile("junk");
  const wasted = tile("wasted_calls");
  const calls = health.totals.invocations;
  const shapes = agent.shapes.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  const now = Date.now();

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{project ?? "Agent health"}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Agent health</h1>
        </div>
        <span className="font-mono text-xs text-warm-muted">
          {formatCount(health.searchLatency.count)} searches · {formatCount(calls)} calls ·{" "}
          {formatCount(agent.turns)} turns
        </span>
      </header>

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
          label="Found on first search"
          value={pct(firstTry?.value)}
          sub={
            firstTry?.value != null
              ? `${firstTry.count} of ${firstTry.n} turns`
              : "needs more turns"
          }
          tone="green"
        />
        <Kpi
          label="Called tool was in results"
          value={mix.calls ? formatPercent((mix.calls - mix.missed) / mix.calls) : "–"}
          sub={`${formatCount(mix.missed)} calls it wasn't`}
          tone={mix.calls && mix.missed / mix.calls > 0.2 ? "amber" : "green"}
        />
        <Kpi
          label="Failed calls"
          value={calls ? formatPercent(health.totals.errors / calls) : "–"}
          sub={`${formatCount(health.totals.errors)} of ${formatCount(calls)}`}
          tone={health.totals.errors ? "coral" : "green"}
        />
        <Kpi
          label="Typical search time"
          value={formatMs(health.searchLatency.p50)}
          sub={`slowest 5%: ${formatMs(health.searchLatency.p95)}`}
          tone="muted"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Where the called tool ranked">
          {mix.calls === 0 ? (
            <p className="text-sm text-warm-muted">No calls after a search yet.</p>
          ) : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-forest-300/40">
                {MIX_PARTS.map((p) =>
                  mix[p.key] ? (
                    <div
                      key={p.key}
                      className={p.color}
                      style={{ width: `${(mix[p.key] / mix.calls) * 100}%` }}
                      title={`${p.label}: ${mix[p.key]}`}
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
                      {formatCount(mix[p.key])}
                    </span>
                    <span className="w-12 text-right font-mono text-xs text-cream">
                      {formatPercent(mix[p.key] / mix.calls)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Search quality">
          <ul className="divide-y divide-forest-300/50">
            <Line
              label="Searched again for the same thing"
              value={pct(detours?.value)}
              sub={detours?.value != null ? `${detours.count} turns` : undefined}
              bad={(detours?.count ?? 0) > 0}
            />
            <Line
              label="Results far below the best one"
              value={pct(junk?.value)}
              sub={
                junk?.value != null
                  ? `${formatCount(junk.count)} of ${formatCount(junk.n)}`
                  : undefined
              }
            />
            <Line
              label="Wasted calls per 100 turns"
              value={wasted?.value == null ? "–" : wasted.value.toFixed(1)}
              sub={`${formatCount(wasted?.count ?? 0)} total`}
              bad={(wasted?.count ?? 0) > 0}
            />
            <Line
              label="Typical tool call time"
              value={formatMs(health.invokeLatency.p50)}
              sub={`slowest 5%: ${formatMs(health.invokeLatency.p95)}`}
            />
          </ul>
          {shapes.length ? (
            <div className="mt-4 border-t border-forest-300/50 pt-3">
              <div className="eyebrow mb-2">How turns went</div>
              <ul className="space-y-2">
                {shapes.map((s) => (
                  <li key={s.shape} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-cream-dim">{s.description}</span>
                      <span className="font-mono text-xs text-cream">{formatPercent(s.share)}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-forest-300/50">
                      <div
                        className={cx(
                          "h-full rounded-full",
                          s.shape === "direct" ? "bg-green" : "bg-amber",
                        )}
                        style={{ width: `${Math.max(1, s.share * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      <MostCalled />

      {health.servers.length ? (
        <Card title="MCP servers">
          <ul className="divide-y divide-forest-300/50">
            {health.servers.map((s) => (
              <li key={s.server} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="font-mono text-sm text-cream">{s.server}</span>
                <Pill tone={AUTH_LABEL[s.auth].tone}>{AUTH_LABEL[s.auth].label}</Pill>
                <span className="ml-auto font-mono text-xs text-warm-muted">
                  {s.toolCount} tools · {s.calls} calls · {formatMs(s.p50)}
                  {s.errors ? <span className="text-coral"> · {s.errors} failed</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {health.embedders.length ? (
        <Card title="Embedding models">
          <ul className="space-y-2">
            {health.embedders.map((e) => (
              <li key={e.model} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-cream">{e.model}</span>
                <Pill tone={e.status === "ok" ? "green" : e.status === "slow" ? "amber" : "coral"}>
                  {e.status}
                </Pill>
                <span className="font-mono text-xs text-warm-muted">
                  loaded in {formatMs(e.tookMs)} · {relativeTime(e.ts, now)}
                  {e.downloadedBytes ? ` · ${formatBytes(e.downloadedBytes)}` : ""}
                </span>
                {e.reason ? <span className="w-full text-xs text-coral">{e.reason}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {health.dropped.total ? (
        <p className="text-xs text-warm-muted">
          {formatCount(health.dropped.total)} trace events were dropped, so these numbers are a
          lower bound.
        </p>
      ) : null}
    </div>
  );
}

const pct = (v: number | null | undefined) => (v == null ? "–" : formatPercent(v));

/** The headline: context Ratel kept out of the model, with and without it side by side. */
function TokensSaved() {
  const { savings } = useBurrow();
  if (savings.basis === "none") {
    return (
      <section className="rounded-2xl border border-forest-300/60 bg-forest-600/70 p-6">
        <div className="eyebrow">Tokens saved</div>
        <p className="mt-2 text-sm text-cream-dim">
          Turn on catalog definitions with <Code>burrowConfig()</Code> to measure how much context
          Ratel keeps out of your model.
        </p>
      </section>
    );
  }
  const full = savings.fullCatalogTokens;
  const served = savings.servedTokensPerSearch;
  const reduction = full > 0 ? 1 - served / full : 0;
  return (
    <section className="relative overflow-hidden rounded-2xl border border-green/30 bg-forest-600/70 p-6">
      <div className="pixel-grid pixel-grid-fade pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-full bg-green" aria-hidden />
            Tokens saved
          </div>
          <div className="mt-2 font-mono text-5xl font-semibold text-cream tabular">
            ~{formatCount(savings.savedTotal)}
          </div>
          <p className="mt-2 text-sm text-cream-dim">
            kept out of your model's context over {formatCount(savings.searches)} searches
          </p>
          <div className="mt-5 flex flex-wrap gap-6">
            <Mini label="Less context per search" value={formatPercent(reduction)} />
            <Mini label="Saved per search" value={`~${formatCount(savings.savedPerSearch)}`} />
          </div>
        </div>

        <div className="space-y-4 self-center">
          <Compare
            label="Without Ratel"
            note={`all ${formatCount(savings.entryCount)} tool definitions, every turn`}
            tokens={full}
            width={1}
            color="bg-coral/70"
          />
          <Compare
            label="With Ratel"
            note={`only the top ${savings.avgReturned.toFixed(1)} tools`}
            tokens={served}
            width={full > 0 ? served / full : 0}
            color="bg-green"
          />
          <p className="text-[11px] text-warm-muted">
            Estimated from your tool definitions (characters ÷ 4).
          </p>
        </div>
      </div>

      {savings.series.length > 1 ? (
        <div className="relative mt-6 border-t border-forest-300/50 pt-4">
          <div className="eyebrow mb-2">Saved over time</div>
          <TimeChart
            label="Estimated tokens saved over time"
            points={savings.series.map((b) => ({
              x: b.start,
              y: b.saved,
              detail: [`${b.searches} searches`],
            }))}
            color="var(--color-green)"
            format={(v) => formatCount(v)}
            height={140}
          />
        </div>
      ) : null}
    </section>
  );
}

function Compare({
  label,
  note,
  tokens,
  width,
  color,
}: {
  label: string;
  note: string;
  tokens: number;
  width: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-cream">
          {label} <span className="text-xs text-warm-muted">· {note}</span>
        </span>
        <span className="font-mono text-cream tabular">~{formatCount(tokens)} tokens</span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-forest-300/40">
        <div
          className={cx("h-full rounded-full", color)}
          style={{ width: `${Math.max(1, width * 100)}%` }}
        />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-xl text-green tabular">{value}</div>
      <div className="text-xs text-warm-muted">{label}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "green" | "amber" | "coral" | "muted";
}) {
  const dot = { green: "bg-green", amber: "bg-amber", coral: "bg-coral", muted: "bg-warm-muted" }[
    tone
  ];
  return (
    <div className="rounded-xl border border-forest-300/60 bg-forest-600/70 px-4 py-3.5">
      <div className="eyebrow flex items-center gap-2">
        <span className={cx("inline-block size-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 font-mono text-3xl text-cream tabular">{value}</div>
      <div className="mt-0.5 text-xs text-warm-muted">{sub}</div>
    </div>
  );
}

function Line({
  label,
  value,
  sub,
  bad = false,
}: {
  label: string;
  value: string;
  sub?: string;
  bad?: boolean;
}) {
  return (
    <li className="flex items-baseline gap-3 py-2.5 text-sm">
      <span className="text-cream-dim">{label}</span>
      {sub ? <span className="ml-auto font-mono text-xs text-warm-muted">{sub}</span> : null}
      <span
        className={cx(
          "w-16 text-right font-mono tabular",
          sub ? "" : "ml-auto",
          bad ? "text-amber" : "text-cream",
        )}
      >
        {value}
      </span>
    </li>
  );
}

function MostCalled() {
  const { health } = useBurrow();
  const [all, setAll] = useState(false);
  if (!health.tools.length) return null;
  const tools = all ? health.tools : health.tools.slice(0, TOP_TOOLS);
  const max = Math.max(1, ...health.tools.map((t) => t.calls));
  return (
    <Card title="Most called">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-forest-300/70">
            <th className="eyebrow py-2 pr-4 font-normal">Tool</th>
            <th className="eyebrow w-1/3 py-2 pr-4 font-normal">Calls</th>
            <th className="eyebrow py-2 pr-4 text-right font-normal">Failed</th>
            <th className="eyebrow py-2 text-right font-normal">Typical time</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => (
            <tr key={`${t.kind}:${t.id}`} className="border-b border-forest-300/40 last:border-0">
              <td className="max-w-sm py-2 pr-4">
                <a
                  href={href("inspector", { tool: t.id })}
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
                  t.errors ? "text-coral" : "text-warm-muted",
                )}
              >
                {t.errors}
              </td>
              <td className="py-2 text-right font-mono text-xs">{formatMs(t.p50)}</td>
            </tr>
          ))}
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
