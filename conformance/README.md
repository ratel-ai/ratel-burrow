# conformance

The read-only HTTP contract of [ADR 0002](../docs/adr/0002-read-only-viewer-browser-side-parsing.md),
run against both launchers as real processes, so the Node and Python launchers cannot drift.

- `fixtures/`: v1 and v2 trace logs and an intent graph.
- `contract.test.ts`: starts each launcher on the fixtures and checks every route.
- `replay.test.ts`: both launchers' Boost replays are identical (needs `@ratel-ai/sdk` in
  `packages/cli` and `ratel-ai` in `python/.venv`; skipped otherwise).

```bash
pnpm build                                   # Node launcher (packages/cli/dist)
(cd python && uv pip install --python .venv -e .)
pnpm --filter @ratel-ai/burrow-conformance test   # BURROW_PYTHON overrides the interpreter
```
