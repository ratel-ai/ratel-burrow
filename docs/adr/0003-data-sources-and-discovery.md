# 3. Data sources and discovery

Date: 2026-10-02

## Status

Accepted

Amended 2026-10-02: scope narrowed to the open-source Ratel SDK. ratel-local (its telemetry
folder, its `ratel_tool_payload` lines, `--all-projects`) is out of scope; it has its own UI.

## Context

Burrow visualizes the open-source Ratel SDK (TypeScript and Python). The SDK already writes
everything Burrow needs; Burrow must not ask Ratel for a new format.

- **Trace stream** (Ratel ADR-0007): the SDK's `jsonl` trace sink, one envelope per line,
  `type`-tagged. Envelope `v: 1` carries `ts` and `session_id`; `v: 2` adds `event_id`,
  `source_id` and optional `invocation_id`, `turn_id`, `trace_id`, `span_id`.
- **Catalog definitions**: `catalog_definition` trace events, emitted only when the host opts in
  (`events.experimentalCatalogDefinitions` on `ratel()`, or
  `experimentalEnableCatalogDefinitions()` / `experimental_enable_catalog_definitions()` on a
  catalog). Nothing persists `catalog.snapshot()` by default.
- **Intent graph** (Ratel ADR-0014/0025): the JSON `IntentGraph.toJson()` produces, as
  `LocalFileIntentGraphStorage` writes it. It has no default path.

## Decision

- The parser accepts envelope `v: 1` and `v: 2`, keeps unknown `type`s as raw events, and never
  fails a whole file on one bad line.
- **The Burrow dir** `./.ratel/burrow` is the default and only implicit source:
  `traces/*.jsonl` (and `*.jsonl` at its root), `intent-graph.json`, `catalog-snapshot.json`.
- Flags replace the default: `--dir <path>` (another Burrow dir), `--trace <file|dir>`,
  `--intent-graph <file>`, `--catalog <file>`.
- **SDK helper.** `burrowConfig({ dir })` (TS) / `burrow_config(dir=...)` (Python) only returns
  the Ratel settings that point the SDK's existing sinks at the Burrow dir (a JSONL trace path,
  and in TS catalog definitions on); `burrowPaths()` / `burrow_paths()` name the intent-graph and
  snapshot files. They configure nothing by themselves.
- Without definitions, the catalog falls back to ids seen in churn events and search hits, and
  the UI says how to turn definitions on. Token savings are estimated from definitions only.

## Consequences

SDK users add one spread (TS) or one keyword-argument unpack (Python) and run Burrow in the same
folder. Burrow never needs a Ratel release to read a new field — it is additive JSON.
