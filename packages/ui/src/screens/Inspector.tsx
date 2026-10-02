import {
  formatMs,
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
      <PageHeader eyebrow="Search inspector" title="Every search, and what happened next">
        For each query your agent sent, Ratel ranked the catalog and returned the top hits. Below
        each search are the tools the agent then called, with the rank Ratel had given them. A call
        marked <em>not retrieved</em> means the agent used a tool this search did not surface.
      </PageHeader>

      {sessions.length === 0 ? (
        <Empty title="No searches yet">Searches appear here as soon as Ratel logs them.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <SessionList sessions={sessions} activeId={toolFilter ? null : sessionId} />
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
              <Card
                title="Calls before any search"
                hint="The agent called these without a preceding Ratel search in this session."
              >
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

function SessionList({
  sessions,
  activeId,
}: {
  sessions: SessionTimeline[];
  activeId: string | null;
}) {
  const now = Date.now();
  return (
    <nav className="space-y-1.5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <div className="eyebrow px-1 pb-1">Sessions · {sessions.length}</div>
      {sessions.map((s) => (
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
          <div className="truncate font-mono text-xs text-cream">{s.sourceId ?? s.sessionId}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-warm-muted">
            <span>{plural(s.stats.searches, "search", "searches")}</span>
            <span>{plural(s.stats.invocations, "call")}</span>
            {s.stats.errors ? <span className="text-coral">{s.stats.errors} failed</span> : null}
          </div>
          <div className="mt-0.5 text-[11px] text-warm-muted">{relativeTime(s.end, now)}</div>
        </a>
      ))}
    </nav>
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
                  <Sparkles className="size-3" /> intent {search.boost.intent} · +
                  {search.boost.promoted}
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
