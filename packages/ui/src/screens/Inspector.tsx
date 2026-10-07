import {
  callOutcomes,
  formatMs,
  formatPercent,
  type LinkedInvocation,
  type Origin,
  plural,
  relativeTime,
  relevanceOf,
  type SearchRecord,
  type SessionTimeline,
  servedOnly,
  summarizeOutcomes,
} from "@ratel-ai/burrow-model";
import {
  ChevronRight,
  CircleCheck,
  CircleX,
  Search,
  SearchX,
  Sparkles,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScoreBar } from "../components/charts";
import { RangePicker } from "../components/RangePicker";
import { Card, cx, Empty, KindDot, PageHeader, Pill, SearchInput, Tabs } from "../components/ui";
import { useBurrow } from "../lib/data";
import { href, useRoute } from "../lib/route";
import { ORIGINS, TERMS } from "../lib/terms";

type Filter = "problems" | "called" | "all";
const FILTERS: Filter[] = ["problems", "called", "all"];
const PAGE = 100;
const ORIGIN_ORDER: Origin[] = ["agent", "direct", "baseline"];

const KIND_COLOR = {
  tool: "var(--color-cap-tool)",
  skill: "var(--color-cap-skill)",
  fact: "var(--color-cap-fact)",
};

function hasProblem(s: SearchRecord): boolean {
  // Observed searches never reached the agent, so what follows them isn't Ratel's problem.
  if (s.origin === "baseline") return false;
  return (
    s.hitCount === 0 ||
    s.invocations.some((c) => c.error !== null || (c.rank === null && s.hits.length > 0))
  );
}

/** What happened after a search, in one pill. */
function outcomeOf(s: SearchRecord): {
  label: string;
  tone: "green" | "amber" | "coral" | "muted";
} {
  if (s.hitCount === 0) return { label: "No results", tone: "amber" };
  const call = s.invocations[0];
  if (!call) return { label: "No call", tone: "muted" };
  if (call.error !== null) return { label: "Failed", tone: "coral" };
  if (s.hits.length === 0) return { label: "Called", tone: "muted" };
  if (call.rank === null) return { label: "Missed", tone: "coral" };
  if (call.rank === 1) return { label: "First result", tone: "green" };
  return { label: `#${call.rank}`, tone: call.rank <= 3 ? "green" : "amber" };
}

export function InspectorScreen() {
  const { sessions } = useBurrow();
  const { params } = useRoute();
  const toolFilter = params.get("tool");
  const sessionId = params.get("session") ?? (toolFilter ? null : (sessions[0]?.sessionId ?? null));
  const focusKey = params.get("search");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Filter | null>(() => {
    const f = params.get("filter");
    return FILTERS.includes(f as Filter) ? (f as Filter) : null;
  });
  const [shown, setShown] = useState(PAGE);
  const [origin, setOrigin] = useState<Origin | null>(null);
  // One search open at a time: opening another closes the last.
  const [openKey, setOpenKey] = useState<string | null>(focusKey);
  useEffect(() => {
    if (focusKey) setOpenKey(focusKey);
  }, [focusKey]);

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

  const origins = useMemo(() => {
    const by = new Map<Origin, number>();
    for (const s of base) by.set(s.origin, (by.get(s.origin) ?? 0) + 1);
    return ORIGIN_ORDER.filter((o) => by.has(o)).map((o) => ({ origin: o, count: by.get(o) ?? 0 }));
  }, [base]);

  const counts = useMemo(
    () => ({
      problems: base.filter(hasProblem).length,
      called: base.filter((s) => s.invocations.length > 0).length,
      all: base.length,
    }),
    [base],
  );
  // Problems first when there are any: that's what the reader came to see.
  const filter: Filter =
    chosen ?? (focusKey || toolFilter ? "all" : counts.problems > 0 ? "problems" : "all");

  const searches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter((s) => {
      // A filter on a hidden chip (one origin left) would only hide searches.
      if (origin && origins.length > 1 && s.origin !== origin) return false;
      if (filter === "called" && s.invocations.length === 0) return false;
      if (filter === "problems" && !hasProblem(s)) return false;
      if (!q) return true;
      return (
        s.query.toLowerCase().includes(q) ||
        s.hits.some((h) => h.id.toLowerCase().includes(q)) ||
        s.invocations.some((c) => c.id.toLowerCase().includes(q))
      );
    });
  }, [base, query, filter, origin, origins]);

  return (
    <div>
      <PageHeader
        eyebrow="Searches"
        title="Every search, and what happened next"
        actions={<RangePicker />}
      />

      {sessions.length === 0 ? (
        <Empty title="No searches yet">Searches appear here as soon as Ratel logs them.</Empty>
      ) : (
        <div className="space-y-4">
          <SessionList sessions={sessions} activeId={toolFilter ? null : sessionId} />
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Tabs<Filter>
                value={filter}
                onChange={(f) => {
                  setChosen(f);
                  setShown(PAGE);
                }}
                options={[
                  { value: "problems", label: `Problems · ${counts.problems}` },
                  { value: "called", label: `Led to a call · ${counts.called}` },
                  { value: "all", label: `All · ${counts.all}` },
                ]}
              />
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Filter by query or tool…"
              />
              {/* Origin only tells searches apart when there is more than one. */}
              {origins.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {origins.map(({ origin: o, count }) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={origin === o}
                      title={ORIGINS[o].hint}
                      onClick={() => {
                        setOrigin((cur) => (cur === o ? null : o));
                        setShown(PAGE);
                      }}
                      className={cx(
                        "h-8 rounded-lg border px-2.5 text-xs transition-colors",
                        origin === o
                          ? "border-green/60 bg-green/10 text-cream"
                          : "border-forest-300 bg-base-deep/60 text-cream-dim hover:text-cream",
                      )}
                    >
                      {ORIGINS[o].label} · {count}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {toolFilter ? (
              <div className="flex items-center gap-2 text-sm">
                Searches that led to <span className="font-mono text-cream">{toolFilter}</span>
                <a className="text-xs text-green hover:underline" href={href("inspector")}>
                  clear
                </a>
              </div>
            ) : null}
            {session && !toolFilter && session.orphans.length > 0 ? (
              <Card title="Calls before any search" hint="Called without a Ratel search first.">
                <CallList calls={session.orphans} />
              </Card>
            ) : null}
            {searches.length === 0 ? (
              <Empty title="Nothing matches">Try another filter.</Empty>
            ) : (
              <>
                <ul className="divide-y divide-forest-300/40 overflow-hidden rounded-xl border border-forest-300/60 bg-forest-600/70">
                  {searches.slice(0, shown).map((s) => (
                    <SearchRow
                      key={s.key}
                      search={s}
                      focused={s.key === focusKey}
                      open={s.key === openKey}
                      showOrigin={origins.length > 1}
                      onToggle={() => setOpenKey((k) => (k === s.key ? null : s.key))}
                    />
                  ))}
                </ul>
                {searches.length > shown ? (
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="text-xs text-green hover:underline"
                  >
                    Show {Math.min(PAGE, searches.length - shown)} more of {searches.length - shown}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const MIX_PARTS = [
  { key: "first", color: "bg-green" },
  { key: "top3", color: "bg-green/45" },
  { key: "lower", color: "bg-amber/70" },
  { key: "missed", color: "bg-coral/80" },
] as const;

/** Sessions as one scrollable strip, newest first, so the searches below get the full width. */
function SessionList({
  sessions,
  activeId,
}: {
  sessions: SessionTimeline[];
  activeId: string | null;
}) {
  const now = Date.now();
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  return (
    <nav aria-label="Sessions">
      <div className="eyebrow px-1 pb-1.5">Sessions · {sessions.length}</div>
      <div className="flex snap-x gap-2 overflow-x-auto pb-1">
        {sessions.map((s) => {
          const mix = summarizeOutcomes(servedOnly(callOutcomes([s])));
          const isActive = s.sessionId === activeId;
          return (
            <a
              key={s.sessionId}
              ref={isActive ? active : undefined}
              href={href("inspector", { session: s.sessionId })}
              aria-current={isActive ? "page" : undefined}
              className={cx(
                "block w-52 shrink-0 snap-start rounded-lg border px-3 py-2 transition-colors",
                isActive
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
              <div className="mt-1 flex items-center gap-x-3 whitespace-nowrap font-mono text-[11px] text-warm-muted">
                <span
                  className="inline-flex items-center gap-1"
                  title={plural(s.stats.searches, "search", "searches")}
                >
                  <Search className="size-3" strokeWidth={1.8} aria-hidden />
                  {s.stats.searches}
                </span>
                {mix.ranked ? (
                  <span
                    className="inline-flex items-center gap-1 text-cream-dim"
                    title={`${TERMS.firstResult.label}: ${TERMS.firstResult.hint}`}
                  >
                    <Target className="size-3" strokeWidth={1.8} aria-hidden />
                    {formatPercent(mix.first / mix.ranked)}
                  </span>
                ) : null}
                {mix.missed ? (
                  <span
                    className="inline-flex items-center gap-1 text-amber"
                    title={`${mix.missed} ${TERMS.missed.label.toLowerCase()}`}
                  >
                    <SearchX className="size-3" strokeWidth={1.8} aria-hidden />
                    {mix.missed}
                  </span>
                ) : null}
                {s.stats.errors ? (
                  <span
                    className="inline-flex items-center gap-1 text-coral"
                    title={`${s.stats.errors} ${TERMS.failed.label.toLowerCase()}`}
                  >
                    <CircleX className="size-3" strokeWidth={1.8} aria-hidden />
                    {s.stats.errors}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 flex h-1 gap-px overflow-hidden rounded-full bg-forest-300/40">
                {mix.ranked
                  ? MIX_PARTS.map((p) =>
                      mix[p.key] ? (
                        <div
                          key={p.key}
                          className={p.color}
                          style={{ width: `${(mix[p.key] / mix.ranked) * 100}%` }}
                        />
                      ) : null,
                    )
                  : null}
              </div>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function SearchRow({
  search,
  focused,
  open,
  onToggle,
  showOrigin,
}: {
  search: SearchRecord;
  focused: boolean;
  open: boolean;
  onToggle: () => void;
  showOrigin: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  // Details stay mounted while they fold away, then unmount.
  const [mounted, setMounted] = useState(open);
  const header = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    setMounted(true);
    // A row closing above shifts this one up; keep its header in view once it settles.
    const t = setTimeout(
      () => header.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      320,
    );
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center" });
  }, [focused]);
  const outcome = outcomeOf(search);
  // An observed search's outcome is shown, but muted: Ratel's results never reached the agent.
  const tone = search.origin === "baseline" ? "muted" : outcome.tone;
  const relevance = relevanceOf(search.hits);
  const call = search.invocations[0];
  const callIndex = call ? search.hits.findIndex((h) => h.id === call.id) : -1;
  const details = `${search.kind} search · ${ORIGINS[search.origin].label.toLowerCase()} · top ${search.topK} · ${formatMs(search.tookMs)}`;

  return (
    <li ref={ref} className={cx(focused && "bg-forest-300/20")}>
      <button
        ref={header}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-forest-300/20"
      >
        <ChevronRight
          className={cx(
            "size-3.5 shrink-0 text-warm-muted transition-transform duration-300 ease-out motion-reduce:transition-none",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <KindDot kind={search.kind} />
        <span className="min-w-0 flex-1 truncate text-sm text-cream">
          {search.query || <em className="text-warm-muted">empty query</em>}
        </span>
        <span className="hidden w-44 shrink-0 truncate text-right font-mono text-xs text-cream-dim md:inline">
          {call?.id ?? ""}
        </span>
        {showOrigin ? (
          <span
            className={cx(
              "hidden w-16 shrink-0 text-right font-mono text-[11px] lg:inline",
              search.origin === "baseline" ? "text-amber" : "text-warm-muted",
            )}
            title={ORIGINS[search.origin].hint}
          >
            {ORIGINS[search.origin].label}
          </span>
        ) : null}
        <span className="flex w-24 shrink-0 justify-end">
          <Pill tone={tone === "muted" ? undefined : tone}>{outcome.label}</Pill>
        </span>
        <span
          className="w-12 shrink-0 text-right font-mono text-xs text-warm-muted"
          title={`${TERMS.relevance.label} of the called tool: ${TERMS.relevance.hint}`}
        >
          {callIndex >= 0 ? formatPercent(relevance[callIndex] ?? 0) : "–"}
        </span>
        <span
          className="w-16 shrink-0 text-right font-mono text-[11px] text-warm-muted"
          title={`${new Date(search.ts).toLocaleString()} · ${details}`}
        >
          {new Date(search.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </button>

      <div
        className={cx(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !open) setMounted(false);
        }}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          {mounted ? (
            <div
              className={cx(
                "space-y-3 border-t border-forest-300/40 bg-base-deep/30 px-4 py-3 pl-11 transition-transform duration-300 ease-out motion-reduce:transition-none",
                open ? "translate-y-0" : "-translate-y-1",
              )}
            >
              <div className="break-words text-sm text-cream">{search.query}</div>
              {search.boost?.intent ? (
                <div className="flex items-center gap-1.5 text-xs text-green">
                  <Sparkles className="size-3.5" /> Learning matched a past pattern (
                  {search.boost.intent}) and promoted {plural(search.boost.promoted, "tool")}.
                </div>
              ) : null}
              {search.hits.length === 0 ? (
                <p className="text-sm text-warm-muted">
                  {search.hitCount === 0
                    ? "Nothing in the catalog matched this query."
                    : `${search.hitCount} results (this log records only the count).`}
                </p>
              ) : (
                <ol className="space-y-0.5">
                  <li className="flex gap-3 px-2 pb-1 font-mono text-[10px] uppercase tracking-wide text-warm-muted/70">
                    <span className="w-5" />
                    <span className="w-40" title={TERMS.relevance.hint}>
                      Relevance
                    </span>
                    <span>Result</span>
                  </li>
                  {search.hits.map((h, i) => {
                    const c = search.invocations.find((x) => x.id === h.id);
                    const r = relevance[i] ?? 0;
                    return (
                      <li
                        key={h.id}
                        className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-forest-300/20"
                      >
                        <span className="w-5 text-right font-mono text-xs text-warm-muted">
                          {i + 1}
                        </span>
                        <span
                          className="flex w-40 items-center gap-2"
                          title={`raw score ${h.score.toFixed(3)}`}
                        >
                          <ScoreBar ratio={r} color={KIND_COLOR[search.kind]} />
                          <span className="w-10 text-right font-mono text-[11px] text-cream-dim">
                            {formatPercent(r)}
                          </span>
                        </span>
                        <a
                          href={href("catalog", { tab: `${search.kind}s`, id: h.id })}
                          className="min-w-0 flex-1 truncate font-mono text-[13px] text-cream-dim hover:text-cream hover:underline"
                        >
                          {h.id}
                        </a>
                        {c ? (
                          <Pill tone={c.error ? "coral" : "green"}>
                            {c.error ? "called · failed" : "called"}
                          </Pill>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
              {search.invocations.length > 0 ? (
                <div>
                  <div className="eyebrow mb-1.5">Then the agent called</div>
                  <CallList calls={search.invocations} showRank={search.hits.length > 0} />
                </div>
              ) : null}
              <div className="font-mono text-[11px] text-warm-muted">{details}</div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
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
              <Pill tone="green">{c.rank === 1 ? "first result" : `result #${c.rank}`}</Pill>
            ) : (
              <Pill tone="amber" title={TERMS.missed.hint}>
                missed by search
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
