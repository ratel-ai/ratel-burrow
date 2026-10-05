# @ratel-ai/burrow-model

Pure TypeScript parsers and view models behind Ratel Burrow. No DOM, no Node APIs, so it runs in
the browser (the UI bundles it) and in tests.

| File | What it builds |
|---|---|
| `src/events.ts` | `parseTraceLog`: Ratel trace JSONL (envelope v1 + v2) → typed, time-ordered events |
| `src/invocations.ts` | `collectInvocations`: one record per tool/skill call, deduplicated across event families |
| `src/catalog.ts` | `buildCatalog`: tools / skills / facts from `catalog_definition` events or a snapshot file |
| `src/improvements.ts` | `buildImprovements`: "what to improve" findings (missed, buried, empty searches, failing, never retrieved) |
| `src/inspector.ts` | `buildInspector`: per-session searches with hits, stages, boosts and the calls they led to |
| `src/catalog-table.ts` | filter / sort / paging for the catalog table, ported from Ratel Cloud's `table-view` |
| `src/agent-health/` | `buildAgentHealth`: Ratel Cloud's health band (first try, detours, junk, wasted calls) and turn shapes from the trace |
| `src/health.ts` | `buildHealth`: latency, errors, MCP servers, auth, embedders, dropped events |
| `src/search-outcomes.ts` | the one definition of where a called tool ranked (first / top 3 / lower / missed / unknown) and its rates |
| `src/savings.ts` | `estimateSavings`: estimated tokens saved vs. sending the full catalog |
| `src/adaptive.ts` | `buildBoostStats`: match rate and promotions (Overview) |
| `src/boost/` | Ratel Cloud's Boost view (ported), `buildBoostFromTrace` from `base_hits` and the launcher's replay, boost attachment ([ADR 0004](../../docs/adr/0004-adaptive-ranking-mirrors-cloud.md), [ADR 0005](../../docs/adr/0005-boost-replay-in-launchers.md)) |
| `src/graph-state.ts` | `buildRankingState`: live / learning online / built offline, from `usage_ranking_status` |
| `src/time-range.ts` | the 24h / 7d / 30d / all window, anchored to the latest event, and the window before it |
| `src/tail.ts` | `TraceTail`: incremental, byte-accurate reader for growing trace files |
| `src/intent-graph/` | intent-graph wire types + view models ported from Ratel Cloud |
| `src/format.ts`, `src/stats.ts` | display formatting and small numeric helpers |

```bash
pnpm test        # vitest; fixtures in test/fixtures
pnpm typecheck
pnpm build       # → dist/
```
