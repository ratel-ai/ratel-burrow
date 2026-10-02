# @ratel-ai/burrow-model

Pure TypeScript parsers and view models behind Ratel Burrow. No DOM, no Node APIs, so it runs in
the browser (the UI bundles it) and in tests.

| File | What it builds |
|---|---|
| `src/events.ts` | `parseTraceLog`: Ratel trace JSONL (envelope v1 + v2) → typed, time-ordered events |
| `src/invocations.ts` | `collectInvocations`: one record per tool/skill call, deduplicated across event families |
| `src/catalog.ts` | `buildCatalog`: tools / skills / facts from `catalog_definition` events or a snapshot file |
| `src/inspector.ts` | `buildInspector`: per-session searches with hits, stages, boosts and the calls they led to |
| `src/health.ts` | `buildHealth`: latency, errors, MCP servers, auth, embedders, dropped events |
| `src/savings.ts` | `estimateSavings`: estimated tokens saved vs. sending the full catalog |
| `src/adaptive.ts` | `buildBoostStats`: is adaptive ranking matching and promoting? |
| `src/intent-graph/` | intent-graph wire types + view models ported from Ratel Cloud |
| `src/format.ts`, `src/stats.ts` | display formatting and small numeric helpers |

```bash
pnpm test        # vitest; fixtures in test/fixtures
pnpm typecheck
pnpm build       # → dist/
```
