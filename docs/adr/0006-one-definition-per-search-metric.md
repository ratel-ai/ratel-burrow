# 6. One definition per search metric; relevance is share of the top hit

Date: 2026-10-05

## Status

Accepted.

## Context

Burrow's pages measured "did search find the tool" four different ways. The Overview's "first
pick" was calls at rank 1 over calls with a known rank, over all time. Agent health's "found on
first search" counted turns whose latest search listed the tool at any rank, over the last 7 days.
Its "in results" counted calls after gateway-only searches as misses. The "direct" turn shape
never checked rank at all. On the same data the pages said 47%, 77%, 77% and 100%, which reads as
a bug. Search results also showed raw engine scores (BM25 6.569, fused 0.031), which mean nothing
without a scale.

## Decision

- **One source for search outcomes.** `packages/model/src/search-outcomes.ts` gives each call
  linked to a tool or skill search one outcome: `first`, `top3`, `lower`, `missed`, or `unknown`
  when the search recorded only a hit count (a gateway search). Every page and every count reads
  it:
  - **First result right** = first ÷ ranked
  - **In results** = (ranked − missed) ÷ ranked
  - **Missed by search** = missed

  `ranked` is calls whose rank is knowable. Labels and hints live in `packages/ui/src/lib/terms.ts`.
- **Only served searches count.** A search's `origin` is `agent` (the model searched), `direct`
  (your code searched) or `baseline` (Ratel was only observing; the agent chose from its own full
  tool list). Rates, misses, problems and "What to improve" count `agent` and `direct` only
  (`servedOnly`), because a miss after a `baseline` search is not Ratel's. Observed searches are
  labelled and compared separately ("When only watching" on the Summary).
- **Needs attention** (`needsAttention` in `catalog-table.ts`) uses the same thresholds as the
  Summary's "What to improve" (`MIN_PATTERN`, `LOW_RANK_AFTER` in `improvements.ts`): missed ≥ 2,
  mostly ranked below the top 3, or failed ≥ 2, so the Summary's verdict and its list agree.
- **Relevance = share of the top hit**: each hit's score ÷ the best score in its own search,
  clamped to 0..1, so the top hit is 100% (`relevance.ts`). This is Ratel Cloud's Playground peek,
  and it is exact from today's traces, which record only raw scores. Raw scores stay available on
  hover. The core's absolute `SearchHit.relevance` is not in the trace; showing it would need a
  core change first.
- **One time range** (`time-range.ts`): 24h, 7d, 30d or all, ending at the latest event rather
  than now, so a trace from yesterday still shows its last day. Definitions come from all events;
  usage counts only inside the range. Learning (the Boost view) reads the whole history, because
  it is cumulative.

## Consequences

- Numbers agree across Summary and Searches. A change to a definition is made in one
  place, with tests.
- Skill calls now count alongside tool calls, which moves the Overview's old figures slightly.
- Cloud's turn-level `first_try` tile and turn shapes stay in the model as a port, but the UI no
  longer shows them as headline numbers.
