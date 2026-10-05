import {
  buildAgentHealth,
  formatBytes,
  formatCount,
  formatMs,
  formatPercent,
  type HealthTile,
  relativeTime,
} from "@ratel-ai/burrow-model";
import { AlertTriangle } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Card, cx, KindDot, Pill } from "../components/ui";
import { useBurrow } from "../lib/data";
import { href } from "../lib/route";

const AUTH_LABEL = {
  ok: { label: "ok", tone: "green" as const },
  needs_auth: { label: "needs sign-in", tone: "amber" as const },
  refresh_failed: { label: "token refresh failed", tone: "coral" as const },
  flow_failed: { label: "sign-in failed", tone: "coral" as const },
};

const TOP_TOOLS = 10;

/** Agent health as plain statements: a number, what it means, and what it counts. */
export function HealthScreen() {
  const { health, savings, events, project } = useBurrow();
  const agent = useMemo(() => buildAgentHealth(events), [events]);
  const [allTools, setAllTools] = useState(false);
  const tile = (key: HealthTile["key"]) => agent.tiles.find((t) => t.key === key);
  const firstTry = tile("first_try");
  const detours = tile("detours");
  const junk = tile("junk");
  const wasted = tile("wasted_calls");
  const share = (t: HealthTile | undefined) =>
    t?.value === null || t?.value === undefined ? "–" : formatPercent(t.value);
  const of = (t: HealthTile | undefined, noun: string) =>
    t && t.value !== null
      ? `${formatCount(t.count)} of ${formatCount(t.n)} ${noun}`
      : "needs more turns";
  const calls = health.totals.invocations;
  const shapes = agent.shapes.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  const tools = allTools ? health.tools : health.tools.slice(0, TOP_TOOLS);
  const now = Date.now();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{project ?? "Agent health"}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Agent health</h1>
        </div>
        <span className="font-mono text-xs text-warm-muted">
          {formatCount(agent.turns)} turns · last {agent.windowDays} days
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

      <Section title="Finding tools">
        <Stat
          value={share(firstTry)}
          label="found the tool it needed on the first search"
          detail={of(firstTry, "turns")}
        />
        <Stat
          value={share(detours)}
          label="searched again for the same thing"
          detail={of(detours, "turns")}
          bad={(detours?.count ?? 0) > 0}
        />
        <Stat
          value={share(junk)}
          label="of returned results scored far below the best one"
          detail={of(junk, "results")}
        />
        <Stat
          value={wasted?.value == null ? "–" : wasted.value.toFixed(1)}
          label="wasted calls per 100 turns: repeats, retries, or searching again"
          detail={`${formatCount(wasted?.count ?? 0)} in total`}
          bad={(wasted?.count ?? 0) > 0}
        />
      </Section>

      <Section title="Running tools">
        <Stat
          value={formatMs(health.searchLatency.p50)}
          label="typical search time"
          detail={`slowest 5%: ${formatMs(health.searchLatency.p95)}`}
        />
        <Stat
          value={formatMs(health.invokeLatency.p50)}
          label="typical tool call time"
          detail={`slowest 5%: ${formatMs(health.invokeLatency.p95)}`}
        />
        <Stat
          value={calls ? formatPercent(health.totals.errors / calls) : "–"}
          label="of tool calls failed"
          detail={`${formatCount(health.totals.errors)} of ${formatCount(calls)} calls`}
          bad={health.totals.errors > 0}
        />
        {savings.basis === "definitions" ? (
          <Stat
            value={`~${formatCount(savings.savedTotal)}`}
            label="tokens kept out of the model's context"
            detail={`~${formatCount(savings.savedPerSearch)} per search, estimated`}
          />
        ) : null}
      </Section>

      {shapes.length ? (
        <Section title="How turns went">
          {shapes.map((s) => (
            <li key={s.shape} className="grid grid-cols-[5rem_1fr] items-center gap-4 py-3">
              <span className="font-mono text-lg text-cream tabular">{formatPercent(s.share)}</span>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-cream-dim">{s.description}</span>
                  <span className="shrink-0 font-mono text-xs text-warm-muted">
                    {formatCount(s.count)} turns
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-forest-300/50">
                  <div
                    className={cx(
                      "h-full rounded-full",
                      s.shape === "direct" ? "bg-green" : "bg-amber",
                    )}
                    style={{ width: `${Math.max(1, s.share * 100)}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </Section>
      ) : null}

      {health.tools.length ? (
        <Card title="Most called">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-forest-300/70">
                <th className="eyebrow py-2 pr-4 font-normal">Tool</th>
                <th className="eyebrow py-2 pr-4 text-right font-normal">Calls</th>
                <th className="eyebrow py-2 pr-4 text-right font-normal">Failed</th>
                <th className="eyebrow py-2 text-right font-normal">Typical time</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr
                  key={`${t.kind}:${t.id}`}
                  className="border-b border-forest-300/40 last:border-0"
                >
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
                  <td className="py-2 pr-4 text-right font-mono text-xs">{t.calls}</td>
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
              onClick={() => setAllTools((v) => !v)}
              className="mt-3 text-xs text-green hover:underline"
            >
              {allTools ? "Show fewer" : `Show all ${health.tools.length}`}
            </button>
          ) : null}
        </Card>
      ) : null}

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-1">{title}</h2>
      <ul className="divide-y divide-forest-300/50 rounded-xl border border-forest-300/60 bg-forest-600/70 px-5">
        {children}
      </ul>
    </section>
  );
}

function Stat({
  value,
  label,
  detail,
  bad = false,
}: {
  value: string;
  label: string;
  detail: string;
  bad?: boolean;
}) {
  return (
    <li className="grid grid-cols-[5rem_1fr_auto] items-baseline gap-4 py-3">
      <span className={cx("font-mono text-lg tabular", bad ? "text-amber" : "text-cream")}>
        {value}
      </span>
      <span className="text-sm text-cream-dim">{label}</span>
      <span className="text-right font-mono text-xs text-warm-muted">{detail}</span>
    </li>
  );
}
