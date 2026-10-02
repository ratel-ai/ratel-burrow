# 4. Adaptive ranking mirrors Ratel Cloud; Boost from the trace

Date: 2026-10-02

## Status

Accepted. Amended by [ADR 0005](0005-boost-replay-in-launchers.md): besides `base_hits`, the
Boost panel uses the launcher's replay, Cloud's other path, so every turn has both arms.

## Context

Burrow's first Adaptive ranking screen was its own design: match-rate charts and an inline
intent table. Ratel Cloud already has a reviewed design for the same question: does the intent
graph put the tool the agent used higher? It has a Boost panel (adaptive arm against a reference
arm, offline vs online), a graph-state pill, and a cluster table folded away behind a button.
Users moving between Cloud and Burrow should read the same page.

Cloud feeds its Boost panel from experiment events or from runtime-reported rankings. Burrow is
local and reads only the trace file (ADR 0002). The runtime-reported rankings arrive in the
trace with Ratel's RC-204 work: `base_hits` on `search` / `skill_search` (the top-k without the
usage arm, present when an intent matched) and `usage_ranking_status` (`status`, `reason`,
`rev`, `graph_key`, `learn`, `model`). Released SDKs up to 0.13.0-rc.10 emit neither.

## Decision

- The Adaptive ranking screen follows Cloud's graph page, in Cloud's order: graph meta and
  warnings, graph state, summary tiles (with cap and size meters), the intent graph, the Boost
  panel, "Show cluster details" (collapsed) wrapping Cloud's cluster table, and the cluster drawer.
  Cloud code is ported, not reinvented: `boost-view.ts` and its tests (`packages/model/src/boost/`),
  `BoostPanel`, `ClusterTable`, `ClusterDrawer`, `SummaryTiles`, chart math. Anything that edits
  (label overrides) is left out.
- **Boost data comes only from the trace** (`buildBoostFromTrace`): one selection per turn that
  invoked a tool. A turn is online when adaptive ranking was active for its search (latest
  `usage_ranking_status`, else a `usage_boost` emitted for it). Online turns: `adaptive` served
  the hits.
  - When the runtime reports both rankings (`base_hits` / `usage_ranking_status` present),
    `baseline` shadows them with `base_hits`. No `base_hits` on a search means the graph left
    it unchanged.
  - Otherwise there is no reference arm: the panel shows the adaptive arm alone and says why.
    Burrow never invents a baseline.
- A `usage_boost` without a turn id belongs to the next search in the session (the core writes
  the boost just before its search), within one second.
- No experiment-event recorder; no relevance score.

## Consequences

- On rc.10 the Boost panel shows the adaptive arm's Recall@1 etc. per turn. With an RC-204 SDK it
  shows both arms, the lift band and the offline→online divider, with no code change in Burrow.
- Ported Cloud files carry a "keep in sync" note; drift is fixed by re-porting.
