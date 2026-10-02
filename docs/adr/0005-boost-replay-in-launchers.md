# 5. Launchers replay searches for the Boost panel

Date: 2026-10-02

## Status

Accepted. Amends [ADR 0002](0002-read-only-viewer-browser-side-parsing.md) and
[ADR 0004](0004-adaptive-ranking-mirrors-cloud.md).

## Context

Ratel Cloud's Boost panel draws two continuous cumulative curves because its fold
(`lib/intent-graph/fold.ts`) ranks every search twice before learning it: `plain` (no graph) and
`boosted` (the graph as it stood before that search), using the runtime's own `hits` /
`base_hits` only when it reported them. Burrow had only what the runtime served, so turns before
adaptive ranking went live had no adaptive arm, and Cloud's own series math restarts both averages
at the switch. Replaying needs a Ratel engine; the browser has none.

## Decision

- A launcher may serve one **derived** source, computed from the files it already serves:
  `boost-replay` (`kind: boost_replay`), a port of the fold's shadow path. It is listed only when
  the user's own Ratel SDK can be imported from the project (`@ratel-ai/sdk` resolved from the
  cwd; `ratel_ai` in Python) and trace files exist, computed on request, and cached on the input
  files' (path, size, mtime). It is still a `GET`; nothing is written. `--no-replay` turns it off.
- Replay: in `parseTraceLog` order, each tool search is ranked by `plain` and by `boosted` (BM25
  over the recorded catalog definitions, like Cloud's lexical replay), top 5, then learned by a
  learner catalog through `recordEvent` (`origins: "any"`, `provenance: "seeded"`, turn key
  `session:turn`). `boosted` ranks from a snapshot of the learner's graph, re-taken whenever it
  changes; Cloud uses `learn: false` on the live graph, which released SDKs lack. A search with
  `base_hits` keeps the runtime's two lists. Output:
  `{ v: 1, method, k, turns: [{ key, plain_ids, boosted_ids, matched, reported }] }`, `key` =
  `event_id`, else `session_id|ts|query`.
- The model builds Cloud's selections from it: every invoked turn gets `baseline` and `adaptive`,
  roles by whether the runtime ranked with the graph. With neither a replay nor `base_hits`, the
  panel stays adaptive-only (ADR 0004).
- Both launchers implement it; the contract suite checks they serve identical replays.

## Consequences

- With an SDK installed (every Burrow user who writes traces has one), the Boost panel matches
  Cloud's continuous curves, offline period included.
- The launchers are no longer purely dumb file servers; the analysis still lives in the browser,
  and the derived source is optional and isolated (a failure returns `{ error }`).
- The replay is lexical, like Cloud's: a runtime that ranks semantically may rank differently, and
  the panel says the curves are estimated.
