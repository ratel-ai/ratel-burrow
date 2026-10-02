# 3. Data sources and discovery

Date: 2026-10-02

## Status

Accepted

## Context

Ratel already writes everything Burrow needs; Burrow must not ask Ratel for a new format.

- **Trace stream** (Ratel ADR-0007): JSONL, one envelope per line, `type`-tagged. Today's
  files on disk are envelope `v: 1` (`ts`, `session_id`); `v: 2` adds `event_id`, `source_id`
  and optional `invocation_id`, `turn_id`, `trace_id`, `span_id`. ratel-local also appends its
  own `ratel_tool_payload` lines (per-server token estimate).
- **Catalog definitions**: `catalog_definition` trace events, emitted only when the host opts in
  (`experimentalCatalogDefinitions` / `RATEL_EXPERIMENTAL_CATALOG_DEFINITIONS=true`).
  Nothing persists `catalog.snapshot()` by default.
- **Intent graph** (Ratel ADR-0014/0025): the JSON `LocalFileIntentGraphStorage` writes. It has
  no default path.

## Decision

- The parser accepts envelope `v: 1` and `v: 2`, keeps unknown `type`s as raw events, and never
  fails a whole file on one bad line.
- **Discovery, zero flags:**
  1. ratel-local telemetry: `$RATEL_TELEMETRY_DIR` or `~/.ratel/telemetry`, sub-folder
     `slug(cwd)` (every `/` and `.` replaced by `-`), all `*.jsonl`.
  2. The Burrow dir `./.ratel/burrow`: `traces/*.jsonl`, `intent-graph.json`,
     `catalog-snapshot.json`.
- Flags add to or replace discovery: `--dir`, `--trace <file|dir>`, `--intent-graph <file>`,
  `--catalog <file>`, `--all-projects`.
- **SDK helper.** `burrowConfig({ dir })` (TS) / `burrow_config(dir=...)` (Python) only returns
  the Ratel settings that point Ratel's existing sinks at the Burrow dir (a JSONL trace path,
  catalog definitions on, an intent-graph file path). It configures nothing by itself.
- Without definitions, the catalog falls back to ids seen in churn events and search hits, and
  the UI says how to turn definitions on.

## Consequences

ratel-local users get a populated Burrow with no setup. SDK users add one spread to their
Ratel config. Burrow never needs a Ratel release to read a new field — it is additive JSON.
