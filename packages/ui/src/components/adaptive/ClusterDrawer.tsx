import { type ClusterTableRow, relativeTime } from "@ratel-ai/burrow-model";
import { Info, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { CapabilityChip } from "./CapabilityChip";
import { SupportRamp } from "./ClusterTable";

/**
 * Ported from Ratel Cloud's `components/adaptive-ranking/ClusterDrawer.tsx`.
 * Burrow reads members straight from the graph file instead of a server action.
 */

/** Members revealed per click in the drawer. */
const MEMBERS_STEP = 5;

export function ClusterDrawer({
  row,
  onClose,
}: {
  row: ClusterTableRow | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!row) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  if (!row) return null;
  return (
    <aside
      role="dialog"
      aria-label={`Cluster ${row.clusterId}`}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[26rem] flex-col border-l border-forest-300 bg-forest-600 shadow-[-24px_0_70px_-20px_rgba(0,0,0,0.9)]"
    >
      <header className="flex items-start gap-3 border-b border-forest-300 p-5">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Cluster</div>
          <h2 className="mt-1 font-display text-lg font-semibold leading-snug text-cream">
            {row.displayLabel}
          </h2>
          <div className="mt-1 font-mono text-[10px] text-warm-muted">
            {row.clusterId}
            {" · last seen "}
            <span title={row.lastTs ? new Date(row.lastTs).toISOString() : undefined}>
              {relativeTime(row.lastTs)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close cluster details"
          className="rounded-md p-1.5 text-warm-muted transition-colors hover:bg-forest/60 hover:text-cream"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 text-xs text-cream-dim">
        <dl className="grid grid-cols-2 gap-3">
          <Fact label="Support" hint={FACT_HINTS.support}>
            <span className="inline-flex items-center gap-2 tabular-nums text-cream">
              {row.support}
              <SupportRamp support={row.support} />
            </span>
          </Fact>
          <Fact label="Seeded" hint={FACT_HINTS.seeded}>
            <span className="tabular-nums">
              {row.seededSupport} of {row.support}
            </span>
          </Fact>
          <Fact label="Members" hint={FACT_HINTS.members}>
            <span className="tabular-nums">{row.memberCount}</span>
          </Fact>
          <Fact label="Edges" hint={FACT_HINTS.edges}>
            <span className="tabular-nums">
              <span className="text-green">{row.toolEdgeCount}</span> tools ·{" "}
              <span className="text-coral">{row.skillEdgeCount}</span> skills
            </span>
          </Fact>
        </dl>

        {row.terms.length > 0 ? (
          <section>
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.09em] text-warm-muted">
              Terms
            </h3>
            <div className="flex flex-wrap gap-1">
              {row.terms.map((term) => (
                <span
                  key={term}
                  className="rounded border border-forest-300 px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {term}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.09em] text-warm-muted">
            Tools & skills · {row.edges.length}
          </h3>
          {row.edges.length === 0 ? (
            <p className="text-warm-muted">No tool or skill recorded yet.</p>
          ) : (
            <ul
              className={
                row.edges.length > EDGES_IN_VIEW
                  ? "flex max-h-64 flex-col gap-1 overflow-y-auto overscroll-contain pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]"
                  : "flex flex-col gap-1"
              }
            >
              {row.edges.map((edge) => (
                <li key={`${edge.kind}:${edge.id}`}>
                  <CapabilityChip
                    target={{
                      kind: edge.kind,
                      id: edge.id,
                      weight: edge.weight,
                      surfaced: edge.surfaced,
                      damper: edge.damper,
                      missing: edge.missing,
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <ClusterMembers members={row.members} memberCount={row.memberCount} />
      </div>
    </aside>
  );
}

const EDGES_IN_VIEW = 6;

const FACT_HINTS = {
  support:
    "Confirmed searches behind this cluster. A search counts once when a tool or skill was invoked after it, however many were invoked. The bars show the ranking weight: it ramps up and reaches full weight at 3.",
  seeded:
    "How many of those searches came from an offline seeding pass over a captured baseline, rather than live searches Ratel served. Provenance only: seeded and live observations rank the same.",
  members:
    "Past query phrasings this cluster keeps as its match key. A new query joins the cluster when it resembles them closely enough. The list is capped, so long-lived clusters keep their most recent phrasings.",
  edges:
    "The tools and skills invoked after this cluster's searches, each weighted by how often. This is what the usage arm promotes when a query matches the cluster. Where the graph recorded impressions, 'passed over' counts the times a capability ranked at or above the pick without being chosen, and the damper is how much of its weight survives: min(1, (invoked + 3) / (passed over + 3)).",
} as const;

function Fact({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-forest-300 bg-base-deep/30 px-3 py-2">
      <dt className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-warm-muted">
        {label}
        {hint ? (
          <span title={hint} className="inline-flex text-warm-muted hover:text-cream">
            <Info
              className="size-3"
              strokeWidth={2}
              aria-label={`What ${label.toLowerCase()} means: ${hint}`}
            />
          </span>
        ) : null}
      </dt>
      <dd className="mt-0.5 text-cream-dim">{children}</dd>
    </div>
  );
}

/**
 * The member list: five at a time, a filter once there are more than eight.
 * Pure over its props so it can be rendered and tested without the loader.
 */
export function ClusterMembers({
  members: all,
  memberCount,
}: {
  members: readonly string[];
  memberCount: number;
}) {
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(MEMBERS_STEP);
  const members = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? all.filter((m) => m.toLowerCase().includes(needle)) : all;
  }, [all, filter]);
  const visibleMembers = members.slice(0, shown);
  const remaining = members.length - visibleMembers.length;

  return (
    <section className="flex min-h-0 flex-col">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.09em] text-warm-muted">
          Members · {memberCount}
        </h3>
        {all.length > 8 ? (
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter"
            aria-label="Filter members"
            className="w-32 rounded-md border border-forest-300 bg-base-deep/60 px-2 py-1 text-[11px] text-cream placeholder:text-warm-muted focus:outline-none focus:ring-1 focus:ring-coral/60"
          />
        ) : null}
      </div>
      <ul
        data-cluster-members="true"
        className="flex flex-col divide-y divide-forest-300/50 rounded-lg border border-forest-300 bg-base-deep/40"
      >
        {visibleMembers.map((member) => (
          <li key={member} className="px-3 py-1.5 font-mono text-[11px] leading-5 text-cream-dim">
            {member}
          </li>
        ))}
        {members.length === 0 ? (
          <li className="px-3 py-2 text-warm-muted">No member matches the filter.</li>
        ) : null}
      </ul>
      {remaining > 0 ? (
        <button
          type="button"
          data-load-more-members="true"
          onClick={() => setShown((n) => n + MEMBERS_STEP)}
          className="mt-2 self-start rounded-md border border-forest-300 px-2.5 py-1 text-[11px] text-cream-dim transition-colors hover:border-cream-dim/40 hover:text-cream"
        >
          Load {Math.min(MEMBERS_STEP, remaining)} more · {remaining} left
        </button>
      ) : null}
    </section>
  );
}
