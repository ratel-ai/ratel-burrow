import {
  formatBytes,
  formatCount,
  formatMs,
  formatPercent,
  relativeTime,
} from "@ratel-ai/burrow-model";
import { AlertTriangle, CircleCheck, CircleX, KeyRound, Server } from "lucide-react";
import { TimeChart } from "../components/charts";
import { Card, Code, Empty, KindDot, PageHeader, Pill, Tile } from "../components/ui";
import { useBurrow } from "../lib/data";
import { href } from "../lib/route";

const AUTH_LABEL = {
  ok: { label: "ok", tone: "green" as const },
  needs_auth: { label: "needs sign-in", tone: "amber" as const },
  refresh_failed: { label: "token refresh failed", tone: "coral" as const },
  flow_failed: { label: "sign-in failed", tone: "coral" as const },
};

export function HealthScreen() {
  const { health, savings } = useBurrow();
  const errorRate = health.totals.invocations
    ? health.totals.errors / health.totals.invocations
    : null;
  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Agent health" title="How fast, how reliable, how lean">
        Search and tool-call latency, the MCP servers behind your catalog, and an estimate of the
        context Ratel kept out of your model's window.
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Search latency"
          value={formatMs(health.searchLatency.p50)}
          sub={`p95 ${formatMs(health.searchLatency.p95)} · ${formatCount(health.searchLatency.count)} searches`}
          tone="green"
        />
        <Tile
          label="Call latency"
          value={formatMs(health.invokeLatency.p50)}
          sub={`p95 ${formatMs(health.invokeLatency.p95)} · ${formatCount(health.invokeLatency.count)} timed calls`}
        />
        <Tile
          label="Failed calls"
          value={formatPercent(errorRate)}
          sub={`${health.totals.errors} of ${health.totals.invocations}`}
          tone={health.totals.errors ? "coral" : "green"}
        />
        <Tile
          label="Tokens saved"
          value={`~${formatCount(savings.savedTotal)}`}
          sub="estimated, see below"
          tone="green"
        />
      </div>

      {health.warnings.length ? (
        <div className="space-y-2 rounded-xl border border-amber/40 bg-amber/5 px-4 py-3 text-sm text-cream-dim">
          {health.warnings.map((w) => (
            <div key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" /> {w}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="MCP servers" hint="Upstreams connected with registerMcpServer.">
          {health.servers.length === 0 ? (
            <p className="text-sm text-warm-muted">No MCP upstreams recorded.</p>
          ) : (
            <ul className="divide-y divide-forest-300/50">
              {health.servers.map((s) => (
                <li key={s.server} className="flex flex-wrap items-center gap-2 py-2.5">
                  <Server className="size-4 text-warm-muted" />
                  <span className="font-mono text-sm text-cream">{s.server}</span>
                  <Pill>{s.transport}</Pill>
                  <Pill>{s.toolCount} tools</Pill>
                  <Pill tone={AUTH_LABEL[s.auth].tone}>
                    <KeyRound className="size-3" /> {AUTH_LABEL[s.auth].label}
                  </Pill>
                  <span className="ml-auto font-mono text-xs text-warm-muted">
                    {s.calls} calls · p50 {formatMs(s.p50)}
                    {s.errors ? <span className="text-coral"> · {s.errors} errors</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Context savings"
          hint={
            savings.basis === "definitions"
              ? "From your tool definitions: tokens ≈ characters ÷ 4 of name, description and input schema."
              : "Burrow needs tool definitions to size the catalog."
          }
        >
          {savings.basis === "none" ? (
            <p className="text-sm text-warm-muted">
              Not enough data yet. Turn on catalog definitions with <Code>burrowConfig()</Code>.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-warm-muted">Full catalog</dt>
                <dd className="text-right font-mono">
                  ~{formatCount(savings.fullCatalogTokens)} tokens · {savings.entryCount} tools
                </dd>
                <dt className="text-warm-muted">Returned per search</dt>
                <dd className="text-right font-mono">
                  {savings.avgReturned.toFixed(1)} tools · ~
                  {formatCount(savings.servedTokensPerSearch)} tokens
                </dd>
                <dt className="text-warm-muted">Saved per search</dt>
                <dd className="text-right font-mono">
                  ~{formatCount(savings.savedPerSearch)} tokens
                </dd>
                <dt className="text-warm-muted">Saved in total</dt>
                <dd className="text-right font-mono text-cream">
                  ~{formatCount(savings.savedTotal)} tokens over {formatCount(savings.searches)}{" "}
                  searches
                </dd>
              </dl>
              {savings.series.length > 1 ? (
                <div className="mt-4">
                  <div className="eyebrow mb-2">Tokens saved over time</div>
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
              <p className="mt-3 text-xs text-warm-muted">
                Compared with sending every tool definition on every turn. An estimate, not a
                measurement.
              </p>
            </>
          )}
        </Card>
      </div>

      <Card
        title="Tools and skills by calls"
        hint="Latency is wall time per call, from Ratel's trace events."
      >
        {health.tools.length === 0 ? (
          <Empty title="No calls recorded yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-forest-300/70">
                  <th className="eyebrow py-2 pr-4 font-normal">Capability</th>
                  <th className="eyebrow py-2 pr-4 text-right font-normal">Calls</th>
                  <th className="eyebrow py-2 pr-4 text-right font-normal">Failed</th>
                  <th className="eyebrow py-2 pr-4 text-right font-normal">p50</th>
                  <th className="eyebrow py-2 pr-4 text-right font-normal">p95</th>
                  <th className="eyebrow py-2 font-normal">Last error</th>
                </tr>
              </thead>
              <tbody>
                {health.tools.slice(0, 50).map((t) => (
                  <tr key={`${t.kind}:${t.id}`} className="border-b border-forest-300/40">
                    <td className="max-w-sm py-2 pr-4">
                      <a
                        href={href("inspector", { tool: t.id })}
                        className="flex items-center gap-2 font-mono text-[13px] text-cream hover:underline"
                      >
                        <KindDot kind={t.kind} />
                        <span className="truncate">{t.id}</span>
                      </a>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-xs">{t.calls}</td>
                    <td className="py-2 pr-4 text-right font-mono text-xs">
                      {t.errors ? (
                        <span className="inline-flex items-center gap-1 text-coral">
                          <CircleX className="size-3" /> {t.errors}
                        </span>
                      ) : (
                        <CircleCheck className="ml-auto size-3 text-green" aria-label="none" />
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-xs">{formatMs(t.p50)}</td>
                    <td className="py-2 pr-4 text-right font-mono text-xs">{formatMs(t.p95)}</td>
                    <td className="max-w-xs truncate py-2 font-mono text-xs text-warm-muted">
                      {t.lastError ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {health.embedders.length || health.dropped.total ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {health.embedders.length ? (
            <Card title="Embedding models">
              <ul className="space-y-2">
                {health.embedders.map((e) => (
                  <li key={e.model} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-cream">{e.model}</span>
                    <Pill
                      tone={e.status === "ok" ? "green" : e.status === "slow" ? "amber" : "coral"}
                    >
                      {e.status}
                    </Pill>
                    <span className="font-mono text-xs text-warm-muted">
                      loaded in {formatMs(e.tookMs)} · {relativeTime(e.ts, now)}
                      {e.downloadedBytes ? ` · downloaded ${formatBytes(e.downloadedBytes)}` : ""}
                    </span>
                    {e.reason ? (
                      <span className="w-full text-xs text-coral">{e.reason}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {health.dropped.total ? (
            <Card title="Telemetry loss">
              <p className="text-sm text-cream-dim">
                {formatCount(health.dropped.total)} events were dropped in {health.dropped.windows}{" "}
                window(s) because the trace queue overflowed. Counts on this page are a lower bound.
              </p>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
