import {
  formatMs,
  formatPercent,
  type LinkedInvocation,
  plural,
  relativeTime,
  type SearchRecord,
  type SessionTimeline,
} from "@ratel-ai/burrow-model";
import { AlertTriangle, ArrowRight, CircleCheck, CircleX, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScoreBar } from "../components/charts";
import { Card, cx, Empty, KindDot, PageHeader, Pill, SearchInput, Tabs } from "../components/ui";
import { useBurrow } from "../lib/data";
import { href, useRoute } from "../lib/route";

type Filter = "all" | "called" | "problems";

const KIND_COLOR = {
  tool: "var(--color-cap-tool)",
  skill: "var(--color-cap-skill)",
  fact: "var(--color-cap-fact)",
};

function hasProblem(s: SearchRecord): boolean {
  return (
    s.hitCount === 0 ||
    s.invocations.some((c) => c.error !== null || (c.rank === null && s.hits.length > 0))
  );
}

export function InspectorScreen() {
  const { sessions } = useBurrow();
  const { params } = useRoute();
  const toolFilter = params.get("tool");
  const sessionId = params.get("session") ?? (toolFilter ? null : (sessions[0]?.sessionId ?? null));
  const focusKey = params.get("search");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const session = sessions.find((s) => s.sessionId === sessionId) ?? null;
  const base = useMemo(() => {
    if (toolFilter) {
      return sessions
        .flatMap((s) => s.searches)
        .filter((s) => s.invocations.some((c) => c.id === toolFilter))
        .sort((a, b) => b.ts - a.ts);
    }
    return session ? [...session.searches].sort((a, b) => b.ts - a.ts) : [];
  }, [sessions, session, toolFilter]);

  const searches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter((s) => {
      if (filter === "called" && s.invocations.length === 0) return false;
      if (filter === "problems" && !hasProblem(s)) return false;
      if (!q) return true;
      return (
        s.query.toLowerCase().includes(q) ||
        s.hits.some((h) => h.id.toLowerCase().includes(q)) ||
        s.invocations.some((c) => c.id.toLowerCase().includes(q))
      );
    });
  }, [base, query, filter]);

  return (
    <div>
      <PageHeader eyebrow="Search inspector" title="Every search, and what happened next" />

      {sessions.length === 0 ? (
        <Empty title="No searches yet">Searches appear here as soon as Ratel logs them.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <SessionList
            sessions={sessions}
            activeId={toolFilter ? null : sessionId}
            onFilter={setFilter}
          />
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                {toolFilter ? (
                  <div className="flex items-center gap-2 text-sm">
                    Searches that led to <span className="font-mono text-cream">{toolFilter}</span>
                    <a className="text-xs text-green hover:underline" href={href("inspector")}>
                      clear
                    </a>
                  </div>
                ) : session ? (
                  <div className="text-sm text-cream-dim">
                    Session <span className="font-mono text-cream">{session.sessionId}</span>
                    {session.sourceId ? (
                      <span className="text-warm-muted"> · {session.sourceId}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs<Filter>
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "All" },
                    { value: "called", label: "Led to a call" },
                    { value: "problems", label: "Problems" },
                  ]}
                />
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Filter by query or tool…"
                />
              </div>
            </div>
            {session && !toolFilter && session.orphans.length > 0 ? (
              <Card title="Calls before any search" hint="Called without a Ratel search first.">
                <CallList calls={session.orphans} />
              </Card>
            ) : null}
            {searches.length === 0 ? (
              <Empty title="Nothing matches">Try another filter.</Empty>
            ) : (
              searches.map((s) => (
                <SearchCard key={s.key} search={s} focused={s.key === focusKey} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Where the called tool sat in its search, per session: the inspector's one-line health read. */
function rankMix(session: SessionTimeline) {
  const mix = { first: 0, top: 0, lower: 0, missed: 0, failed: 0, calls: 0 };
  for (const search of session.searches) {
    if (search.kind !== "tool" || (search.hits.length === 0 && search.hitCount > 0)) continue;
    for (const call of search.invocations) {
      mix.calls += 1;
      if (call.error) mix.failed += 1;
      if (call.rank === null) mix.missed += 1;
      else if (call.rank === 1) mix.first += 1;
      else if (call.rank <= 3) mix.top += 1;
      else mix.lower += 1;
    }
  }
  return mix;
}

const MIX_PARTS = [
  { key: "first", label: "rank 1", color: "bg-green" },
  { key: "top", label: "rank 2–3", color: "bg-green/45" },
  { key: "lower", label: "rank 4+", color: "bg-amber/70" },
  { key: "missed", label: "not retrieved", color: "bg-coral/80" },
] as const;

function MixBar({ mix, className }: { mix: ReturnType<typeof rankMix>; className?: string }) {
  if (mix.calls === 0)
    return <div className={cx("h-1.5 rounded-full bg-forest-300/50", className)} />;
  return (
    <div className={cx("flex h-1.5 gap-px overflow-hidden rounded-full", className)} aria-hidden>
      {MIX_PARTS.map((p) =>
        mix[p.key] ? (
          <div
            key={p.key}
            className={p.color}
            style={{ width: `${(mix[p.key] / mix.calls) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function SessionList({
  sessions,
  activeId,
  onFilter,
}: {
  sessions: SessionTimeline[];
  activeId: string | null;
  onFilter: (f: Filter) => void;
}) {
  const now = Date.now();
  const active = sessions.find((s) => s.sessionId === activeId) ?? null;
  return (
    <aside className="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <nav className="space-y-1.5">
        <div className="eyebrow px-1 pb-1">Sessions · {sessions.length}</div>
        {sessions.map((s) => {
          const mix = rankMix(s);
          return (
            <a
              key={s.sessionId}
              href={href("inspector", { session: s.sessionId })}
              className={cx(
                "block rounded-lg border px-3 py-2.5 transition-colors",
                s.sessionId === activeId
                  ? "border-green/60 bg-forest-300/50"
                  : "border-forest-300/60 bg-forest-600/60 hover:bg-forest-300/30",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono text-xs text-cream" title={s.sessionId}>
                  {s.sessionId.slice(0, 8)}
                </span>
                <span className="shrink-0 text-[11px] text-warm-muted">
                  {relativeTime(s.end, now)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-warm-muted">
                <span>{plural(s.stats.searches, "search", "searches")}</span>
                <span>{plural(s.stats.invocations, "call")}</span>
                {mix.calls ? (
                  <span className="text-cream-dim">
                    {formatPercent(mix.first / mix.calls)} first
                  </span>
                ) : null}
                {s.stats.errors ? (
                  <span className="text-coral">{s.stats.errors} failed</span>
                ) : null}
              </div>
              <MixBar mix={mix} className="mt-2" />
            </a>
          );
        })}
      </nav>
      {active ? <SessionSummary session={active} onFilter={onFilter} /> : null}
    </aside>
  );
}

/** The selected session at a glance: span, where called tools ranked, the tools it ran most. */
function SessionSummary({
  session,
  onFilter,
}: {
  session: SessionTimeline;
  onFilter: (f: Filter) => void;
}) {
  const mix = rankMix(session);
  const tools = new Map<string, number>();
  for (const s of session.searches)
    for (const c of s.invocations) tools.set(c.id, (tools.get(c.id) ?? 0) + 1);
  const topTools = [...tools].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const problems = session.searches.filter(hasProblem).length;
  const span = session.end - session.start;
  return (
    <section className="rounded-xl border border-forest-300/60 bg-forest-600/60 p-3.5">
      <div className="eyebrow">This session</div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <dt className="text-warm-muted">Started</dt>
        <dd className="text-right font-mono text-cream-dim">
          {new Date(session.start).toLocaleTimeString()}
        </dd>
        <dt className="text-warm-muted">Duration</dt>
        <dd className="text-right font-mono text-cream-dim">{formatMs(span)}</dd>
        <dt className="text-warm-muted">Project</dt>
        <dd className="truncate text-right font-mono text-cream-dim">
          {session.sourceId ?? "default"}
        </dd>
      </dl>
      <div className="mt-3 text-[11px] text-warm-muted">Where the called tool ranked</div>
      <MixBar mix={mix} className="mt-1.5 h-2" />
      <ul className="mt-2 space-y-1 text-[11px]">
        {MIX_PARTS.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className={cx("inline-block size-2 rounded-sm", p.color)} aria-hidden />
            <span className="text-cream-dim">{p.label}</span>
            <span className="ml-auto font-mono text-warm-muted">
              {mix[p.key]} · {mix.calls ? formatPercent(mix[p.key] / mix.calls) : "–"}
            </span>
          </li>
        ))}
      </ul>
      {topTools.length ? (
        <>
          <div className="mt-3 text-[11px] text-warm-muted">Called most</div>
          <ul className="mt-1.5 space-y-1">
            {topTools.map(([id, n]) => (
              <li key={id} className="flex items-center gap-2 text-[11px]">
                <a
                  href={href("catalog", { tab: "tools", id })}
                  className="min-w-0 flex-1 truncate font-mono text-cream-dim hover:underline"
                >
                  {id}
                </a>
                <span className="font-mono text-warm-muted">{n}×</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {problems ? (
        <button
          type="button"
          onClick={() => onFilter("problems")}
          className="mt-3 w-full rounded-md border border-amber/40 bg-amber/10 px-2 py-1.5 text-left text-[11px] text-cream-dim hover:bg-amber/20"
        >
          {problems} searches with a problem → show only those
        </button>
      ) : null}
    </section>
  );
}

function SearchCard({ search, focused }: { search: SearchRecord; focused: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center" });
  }, [focused]);
  const top = Math.max(0, ...search.hits.map((h) => h.score)) || 1;
  const called = new Map(search.invocations.map((c) => [c.id, c]));
  const color = KIND_COLOR[search.kind];

  return (
    <article
      ref={ref}
      className={cx(
        "rounded-xl border bg-forest-600/70 p-4",
        focused ? "border-green/70" : "border-forest-300/60",
      )}
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <KindDot kind={search.kind} />
        <div className="min-w-0 flex-1">
          <div className="break-words text-[15px] text-cream">
            {search.query || <em className="text-warm-muted">empty query</em>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill>{search.kind} search</Pill>
            <Pill>{search.origin}</Pill>
            <Pill>top {search.topK}</Pill>
            <Pill>{formatMs(search.tookMs)}</Pill>
            {search.stages.map((st) => (
              <Pill
                key={st.name}
                title={st.top_score === null ? "no hits" : `top score ${st.top_score.toFixed(3)}`}
              >
                {st.name} {formatMs(st.took_ms)}
              </Pill>
            ))}
            {search.boost ? (
              search.boost.intent ? (
                <Pill
                  tone="green"
                  title={`similarity ${search.boost.similarity.toFixed(2)} · support ${search.boost.support}`}
                >
                  <Sparkles className="size-3" /> {search.boost.intent} · {search.boost.promoted}{" "}
                  promoted
                </Pill>
              ) : (
                <Pill title="Adaptive ranking found no matching intent">no intent match</Pill>
              )
            ) : null}
          </div>
        </div>
        <span className="font-mono text-[11px] text-warm-muted">
          {new Date(search.ts).toLocaleString()}
        </span>
      </header>

      <div className="mt-3 space-y-1">
        {search.hits.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-warm-muted">
            {search.hitCount === 0 ? (
              <>
                <AlertTriangle className="size-4 text-amber" /> No hits: nothing in the catalog
                matched this query.
              </>
            ) : (
              <>{search.hitCount} hits (this log records only the count)</>
            )}
          </div>
        ) : (
          <ol className="space-y-1">
            {search.hits.map((h, i) => {
              const call = called.get(h.id);
              return (
                <li
                  key={h.id}
                  className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-forest-300/20"
                >
                  <span className="w-5 text-right font-mono text-xs text-warm-muted">{i + 1}</span>
                  <ScoreBar ratio={h.score / top} color={color} />
                  <span className="w-14 font-mono text-[11px] text-warm-muted">
                    {h.score.toFixed(3)}
                  </span>
                  <a
                    href={href("catalog", { tab: `${search.kind}s`, id: h.id })}
                    className="min-w-0 flex-1 truncate font-mono text-[13px] text-cream-dim hover:text-cream hover:underline"
                  >
                    {h.id}
                  </a>
                  {call ? (
                    <Pill tone={call.error ? "coral" : "green"}>
                      {call.error ? "called · failed" : "called"}
                    </Pill>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {search.invocations.length > 0 ? (
        <div className="mt-3 border-t border-forest-300/50 pt-3">
          <div className="eyebrow mb-2 flex items-center gap-1.5">
            <ArrowRight className="size-3" /> Then the agent called
          </div>
          <CallList calls={search.invocations} showRank={search.hits.length > 0} />
        </div>
      ) : null}
    </article>
  );
}

function CallList({ calls, showRank = false }: { calls: LinkedInvocation[]; showRank?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {calls.map((c) => (
        <li
          key={`${c.id}-${c.ts}-${c.invocationId ?? ""}-${c.error ?? ""}`}
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          {c.error ? (
            <CircleX className="size-4 text-coral" aria-label="failed" />
          ) : (
            <CircleCheck className="size-4 text-green" aria-label="succeeded" />
          )}
          <span className="font-mono text-[13px] text-cream">{c.id}</span>
          {c.server ? <Pill>{c.server}</Pill> : null}
          {showRank ? (
            c.rank !== null ? (
              <Pill tone="green">rank {c.rank}</Pill>
            ) : (
              <Pill tone="amber" title="The agent called a capability this search did not return">
                not retrieved
              </Pill>
            )
          ) : null}
          <span className="font-mono text-xs text-warm-muted">{formatMs(c.tookMs)}</span>
          {c.error ? (
            <span className="min-w-0 truncate font-mono text-xs text-coral">{c.error}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
