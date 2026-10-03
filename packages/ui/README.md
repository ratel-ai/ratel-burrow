# @ratel-ai/burrow-ui (private)

The Burrow web app: Vite + React 19 + Tailwind 4, dark-only, in Ratel Cloud's brand tokens.
It polls the launcher's read-only API, tails trace files, and builds every view with
`@ratel-ai/burrow-model`. Both launchers serve its `dist/`.

| Path | Purpose |
|---|---|
| `src/lib/data.tsx` | `BurrowProvider`: polls `/api/sources`, tails traces (`TraceTail`), derives the models |
| `src/lib/route.ts` | hash routing (`#/catalog?tab=skills&id=x`) |
| `src/screens/` | Overview, Catalog, Search inspector, Adaptive ranking, Agent health |
| `src/components/IntentGraphForce.tsx` | the d3-force capability graph, ported from Ratel Cloud |
| `src/components/adaptive/` | Boost panel, cluster table and drawer, summary tiles, graph state: Ratel Cloud's adaptive-ranking page ([ADR 0004](../../docs/adr/0004-adaptive-ranking-mirrors-cloud.md)) |
| `src/components/catalog/` | catalog table (filter, sort, paging) and entry modal, ported from Ratel Cloud's tools catalog |
| `src/components/health/` | agent-health band and turn shapes, ported from Ratel Cloud |
| `src/components/charts.tsx` | small single-series SVG charts with hover tooltips |
| `src/lib/chart.ts` | monotone curve math, ported from Ratel Cloud |
| `src/components/Mascot.tsx` | the badger mark and the burrow mascot |
| `src/styles.css` | brand tokens and the validated tool/skill/fact palette |

```bash
pnpm build                                    # → dist/
# dev: run a launcher on a fixed port, then the Vite dev server (proxies /api to 4377)
node ../cli/dist/bin.js --port 4377 --no-open
pnpm dev                                      # open http://localhost:5173/?t=<token>
```
