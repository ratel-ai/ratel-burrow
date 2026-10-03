import type { BoostStats } from "./adaptive.js";
import type { BoostView } from "./boost/view.js";
import type { Catalog } from "./catalog.js";
import type { SessionTimeline } from "./inspector.js";
import type { IntentGraphDocument } from "./intent-graph/wire.js";
import type { SavingsEstimate } from "./savings.js";

/**
 * How Ratel works, in one project's numbers: the five steps the Overview walks
 * through, each the same thing a Ratel Cloud page shows in more depth.
 *
 * 1. catalog: what the agent could use
 * 2. search: Ratel ranks it per request and returns the top few
 * 3. call: the agent picks one; was it on top?
 * 4. learn: adaptive ranking remembers which tool answered which kind of ask
 * 5. boost: it promotes those tools the next time a similar ask comes in
 */
export interface RatelFlow {
  catalog: { tools: number; skills: number; facts: number; defined: boolean };
  search: {
    searches: number;
    avgReturned: number;
    catalogSize: number;
    tokensSavedPerSearch: number;
  };
  call: {
    /** Tool calls made after a search. */
    calls: number;
    /** Of those, calls whose search recorded its hits, so a rank is known. */
    ranked: number;
    topHit: number;
    inResults: number;
    notRetrieved: number;
    failed: number;
  };
  learn: { intents: number; observations: number; seededShare: number } | null;
  boost: {
    active: boolean;
    matchRate: number;
    /** Recall@1 with the graph and without it, when both rankings are known. */
    recall1: { with: number; without: number } | null;
  };
}

export function buildRatelFlow(input: {
  catalog: Catalog;
  sessions: readonly SessionTimeline[];
  savings: SavingsEstimate;
  boost: BoostView;
  boostStats: BoostStats;
  graph: IntentGraphDocument | null;
}): RatelFlow {
  const { catalog, sessions, savings, boost, boostStats, graph } = input;
  const live = (list: Catalog["tools"]) => list.filter((e) => !e.removed).length;

  const call = { calls: 0, ranked: 0, topHit: 0, inResults: 0, notRetrieved: 0, failed: 0 };
  for (const s of sessions.flatMap((t) => t.searches)) {
    if (s.kind !== "tool") continue;
    const knowsHits = s.hits.length > 0 || s.hitCount === 0;
    for (const c of s.invocations) {
      call.calls += 1;
      if (c.error !== null) call.failed += 1;
      if (!knowsHits) continue;
      call.ranked += 1;
      if (c.rank === 1) call.topHit += 1;
      if (c.rank !== null) call.inResults += 1;
      else call.notRetrieved += 1;
    }
  }

  let learn: RatelFlow["learn"] = null;
  if (graph) {
    const observations = graph.intents.reduce((n, i) => n + i.support, 0);
    const seeded = graph.intents.reduce((n, i) => n + (i.seeded_support ?? 0), 0);
    learn = {
      intents: graph.intents.length,
      observations,
      seededShare: observations > 0 ? seeded / observations : 0,
    };
  }

  const online = boost.online.fromTurn !== null && boost.phases["recall@1"].online.turns > 0;
  const recall1 =
    boost.empty || !boost.reference.scored
      ? null
      : online
        ? {
            with: boost.phases["recall@1"].online.adaptive,
            without: boost.phases["recall@1"].online.reference,
          }
        : {
            with: boost.totals["recall@1"].value.adaptive,
            without: boost.totals["recall@1"].value.reference,
          };

  return {
    catalog: {
      tools: live(catalog.tools),
      skills: live(catalog.skills),
      facts: live(catalog.facts),
      defined: catalog.hasDefinitions,
    },
    search: {
      searches: savings.searches,
      avgReturned: savings.avgReturned,
      catalogSize: savings.entryCount || live(catalog.tools),
      tokensSavedPerSearch: savings.savedPerSearch,
    },
    call,
    learn,
    boost: { active: boostStats.active, matchRate: boostStats.matchRate, recall1 },
  };
}
