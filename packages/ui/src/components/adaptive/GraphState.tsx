import type { RankingState } from "@ratel-ai/burrow-model";

/**
 * Where adaptive ranking stands in this runtime, and how the graph was built:
 * learned online as the agent works, or built offline and only ranked from.
 * Burrow's counterpart of Ratel Cloud's watching / live / boosting pill, read
 * from `usage_ranking_status` and `usage_boost` in the trace.
 */
type Kind = "online" | "offline" | "paused" | "unknown" | "off" | "boosting-only" | "unreported";

const LABELS: Record<Kind, { label: string; hint: string; live: boolean }> = {
  online: {
    label: "live, learning online",
    hint: "The runtime ranks from this graph and keeps learning into it from every search and invocation.",
    live: true,
  },
  offline: {
    label: "live, built offline",
    hint: "The runtime ranks from a graph built ahead of time and does not learn from these searches.",
    live: true,
  },
  paused: {
    label: "paused",
    hint: "A graph is attached but its usage arm is paused, usually because the embedding model changed.",
    live: false,
  },
  unknown: {
    label: "attached",
    hint: "A graph is attached; the runtime does not know the active embedding model yet.",
    live: false,
  },
  off: {
    label: "off",
    hint: "No graph is attached: searches are ranked without adaptive ranking.",
    live: false,
  },
  "boosting-only": {
    label: "live",
    hint: "The runtime ranks from a graph. It does not report whether that graph learns online or was built offline (that needs a newer Ratel SDK).",
    live: true,
  },
  unreported: {
    label: "not reported",
    hint: "The runtime has not reported adaptive ranking, so Burrow can only show the graph file.",
    live: false,
  },
};

function kindOf(state: RankingState): Kind {
  switch (state.status) {
    case "active":
      return state.learn === false ? "offline" : "online";
    case "paused":
      return "paused";
    case "unknown":
      return "unknown";
    case "inactive":
      return "off";
    default:
      return state.boostingSince !== null ? "boosting-only" : "unreported";
  }
}

const fmt = (ts: number) =>
  new Date(ts).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function GraphState({
  state,
  seededShare,
}: {
  state: RankingState;
  seededShare: number | null;
}) {
  const kind = kindOf(state);
  const label = LABELS[kind];
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-warm-muted">
      <span
        className={`inline-flex items-center rounded border bg-forest/30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
          label.live ? "border-green/40 text-green" : "border-forest-300 text-warm-muted"
        }`}
      >
        {label.label}
      </span>
      <span>
        {label.hint}
        {state.liveSince ? ` Live since ${fmt(state.liveSince)}.` : ""}
        {state.boostingSince ? ` First changed a search ${fmt(state.boostingSince)}.` : ""}
        {seededShare !== null && seededShare > 0
          ? ` ${Math.round(seededShare * 100)}% of its observations were seeded offline.`
          : ""}
      </span>
    </p>
  );
}
