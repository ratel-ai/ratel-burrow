import { formatBytes, formatCount, formatMs, plural } from "@ratel-ai/burrow-model";
import { ChevronRight } from "lucide-react";
import { useBurrow } from "../../lib/data";
import { cx } from "../ui";

const AUTH_LABEL = {
  ok: "signed in",
  needs_auth: "needs sign-in",
  refresh_failed: "token refresh failed",
  flow_failed: "sign-in failed",
};

/** What Burrow reads and the runtime around the agent, folded into one line. */
export function Environment() {
  const { sources, badLines, replayError, health } = useBurrow();
  const traces = sources.filter((s) => s.kind === "trace").length;
  const graphs = sources.filter((s) => s.kind === "intent_graph").length;
  const replay = sources.some((s) => s.kind === "boost_replay");
  const problems = [
    badLines > 0 ? `${formatCount(badLines)} unreadable trace lines skipped` : null,
    replayError ? `replay unavailable: ${replayError}` : null,
    health.dropped.total
      ? `${formatCount(health.dropped.total)} trace events dropped, so counts are a lower bound`
      : null,
    ...health.servers
      .filter((s) => s.auth !== "ok")
      .map((s) => `${s.server}: ${AUTH_LABEL[s.auth]}`),
  ].filter((p): p is string => p !== null);

  const summary = [
    plural(traces, "trace"),
    plural(graphs, "intent graph"),
    replay ? "replayed with your SDK" : null,
    health.servers.length ? plural(health.servers.length, "MCP server") : null,
    health.embedders[0]?.model ?? null,
  ].filter(Boolean);

  return (
    <details className="group rounded-xl border border-forest-300/60 bg-forest-600/40 px-4 py-2.5 text-xs text-warm-muted">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        <span className="eyebrow">Environment</span>
        <span className="truncate">{summary.join(" · ")}</span>
        {problems.length ? (
          <span className="ml-auto shrink-0 text-amber">{plural(problems.length, "notice")}</span>
        ) : null}
      </summary>
      <div className="mt-3 grid gap-4 border-t border-forest-300/50 pt-3 lg:grid-cols-2">
        <div>
          <div className="eyebrow mb-1.5">Files</div>
          <ul className="space-y-1">
            {[...sources]
              .sort((a, b) => b.mtime - a.mtime)
              .map((s) => (
                <li key={s.id} className="flex gap-2" title={s.path}>
                  <span className="min-w-0 flex-1 truncate font-mono text-cream-dim">
                    {s.label}
                  </span>
                  <span className="font-mono">{formatBytes(s.size)}</span>
                </li>
              ))}
          </ul>
        </div>
        <div className="space-y-3">
          {health.servers.length ? (
            <div>
              <div className="eyebrow mb-1.5">MCP servers</div>
              <ul className="space-y-1">
                {health.servers.map((s) => (
                  <li key={s.server} className="flex gap-2">
                    <span className="font-mono text-cream-dim">{s.server}</span>
                    <span className={cx(s.auth === "ok" ? "" : "text-amber")}>
                      {AUTH_LABEL[s.auth]}
                    </span>
                    <span className="ml-auto font-mono">
                      {s.toolCount} tools · {s.calls} calls · {formatMs(s.p50)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {health.embedders.length ? (
            <div>
              <div className="eyebrow mb-1.5">Embedding models</div>
              <ul className="space-y-1">
                {health.embedders.map((e) => (
                  <li key={e.model} className="flex gap-2">
                    <span className="font-mono text-cream-dim">{e.model}</span>
                    <span className={cx(e.status === "ok" ? "" : "text-amber")}>{e.status}</span>
                    <span className="ml-auto font-mono">loaded in {formatMs(e.tookMs)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {problems.length ? (
            <ul className="space-y-1 text-amber">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </details>
  );
}
