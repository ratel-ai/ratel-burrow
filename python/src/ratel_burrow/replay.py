"""The Boost panel's replay: the Python twin of packages/cli/src/replay.ts.

A local port of Ratel Cloud's fold (`foldEventsIntoGraph` with `shadow`), run with
the `ratel-ai` package the user already has installed (ADR 0005). In log order,
every tool search is ranked twice before it is learned: plain (no graph) and
boosted (the graph as it stood before the search). Then the learner absorbs it,
and each invoke, through `record_event`. A search the runtime reported itself
(`base_hits`) keeps the runtime's two lists. Lexical (BM25), like Cloud.

Event order, definitions and keys follow `@ratel-ai/burrow-model` exactly, so both
launchers serve the same replay (the conformance suite checks it).
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Sequence
from typing import Any

REPLAY_K = 5
SHADOW_ORIGIN = "agent"
KNOWN_ORIGINS = {"direct", "agent", "baseline"}


def load_sdk() -> Any | None:
    """The `ratel_ai` module, or None when it isn't installed."""
    try:
        import ratel_ai
    except ImportError:
        return None
    return ratel_ai


def _ts_text(ts: Any) -> str:
    # JavaScript prints an integral number without a decimal point.
    if isinstance(ts, float) and ts.is_integer():
        return str(int(ts))
    return str(ts)


def boost_turn_key(event: dict[str, Any]) -> str:
    """The event id, or `session|ts|query` for v1 lines (`boostTurnKey` in the model)."""
    event_id = event.get("event_id")
    if isinstance(event_id, str) and event_id:
        return event_id
    query = event.get("query") if isinstance(event.get("query"), str) else ""
    return f"{event.get('session_id')}|{_ts_text(event.get('ts'))}|{query}"


def _parse(texts: Sequence[str]) -> list[dict[str, Any]]:
    """`parseTraceLog`: valid envelopes from every text, stably sorted by `ts`."""
    events: list[dict[str, Any]] = []
    for text in texts:
        for line in text.split("\n"):
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if (
                isinstance(obj, dict)
                and isinstance(obj.get("type"), str)
                and isinstance(obj.get("ts"), (int, float))
                and not isinstance(obj.get("ts"), bool)
                and isinstance(obj.get("session_id"), str)
            ):
                events.append(obj)
    events.sort(key=lambda e: e["ts"])
    return events


def _definitions(
    events: list[dict[str, Any]], snapshot: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """`buildCatalog(...).tools.filter(defined && !removed)`, sorted by id."""
    tools: dict[str, dict[str, Any]] = {}
    removed: dict[str, bool] = {}
    for tool in (snapshot or {}).get("tools") or []:
        tid = tool.get("id")
        if not isinstance(tid, str):
            continue
        override = tool.get("experimentalSearchableDescription") or tool.get(
            "experimental_searchable_description"
        )
        tools[tid] = {
            "id": tid,
            "name": tool.get("name") or tid,
            "description": tool.get("description") or "",
            "searchable": override,
            "input_schema": tool.get("inputSchema") or tool.get("input_schema"),
            "output_schema": tool.get("outputSchema") or tool.get("output_schema"),
        }
    for e in events:
        if e["type"] == "catalog_definition" and e.get("kind") == "tool":
            tid = e.get("id")
            if not isinstance(tid, str):
                continue
            tools[tid] = {
                "id": tid,
                "name": e.get("name") or tid,
                "description": e.get("description") or "",
                "searchable": e.get("searchable_description")
                if e.get("searchable_description_overridden")
                else None,
                "input_schema": e.get("input_schema"),
                "output_schema": e.get("output_schema"),
            }
            removed[tid] = False
        elif e["type"] == "index_churn" and isinstance(e.get("tool_id"), str):
            removed[e["tool_id"]] = e.get("kind") == "remove"
    return [tools[t] for t in sorted(tools) if not removed.get(t, False)]


def _core_event(e: dict[str, Any]) -> dict[str, Any] | None:
    """Cloud's `toCoreEvent`."""
    origin = e.get("origin") if e.get("origin") in KNOWN_ORIGINS else "direct"
    if e["type"] == "search":
        if not e.get("query"):
            return None
        hits = e.get("hits") or []
        return {
            "type": "search",
            "query": e["query"],
            "origin": origin,
            "top_k": e.get("top_k", len(hits)),
            "hits": [{"tool_id": h.get("tool_id"), "score": h.get("score") or 0} for h in hits],
            "stages": [],
            "took_ms": e.get("took_ms") or 0,
        }
    if e["type"] == "skill_search":
        if not e.get("query"):
            return None
        hits = e.get("hits") or []
        return {
            "type": "skill_search",
            "query": e["query"],
            "origin": origin,
            "top_k": e.get("top_k", len(hits)),
            "hits": [{"skill_id": h.get("skill_id"), "score": h.get("score") or 0} for h in hits],
            "stages": [],
            "took_ms": e.get("took_ms") or 0,
        }
    if e["type"] == "invoke_start" and e.get("tool_id"):
        return {"type": "invoke_start", "tool_id": e["tool_id"], "args_size_bytes": 0}
    if e["type"] == "skill_invoke" and e.get("skill_id"):
        return {"type": "skill_invoke", "skill_id": e["skill_id"], "took_ms": e.get("took_ms") or 0}
    return None


def _project(event: dict[str, Any]) -> str:
    """`projectOf`: the runtime's source_id, or the default project."""
    source = event.get("source_id")
    return source if isinstance(source, str) and source else "default"


def compute_replay(
    texts: Sequence[str], snapshot: dict[str, Any] | None, sdk: Any
) -> dict[str, Any]:
    """Fold each project (source_id) on its own, in first-appearance order, as Node does."""
    events = _parse(texts)
    by_project: dict[str, list[dict[str, Any]]] = {}
    for e in events:
        by_project.setdefault(_project(e), []).append(e)
    turns: list[dict[str, Any]] = []
    folded = 0
    for project_events in by_project.values():
        result = _fold_project(project_events, snapshot, sdk)
        if result is None:
            continue
        folded += 1
        turns.extend(result)
    if folded == 0:
        return {
            "error": "No tool definitions in the trace: turn on catalog definitions so Burrow "
            "can replay searches."
        }
    return {"v": 1, "method": "bm25", "k": REPLAY_K, "turns": turns}


def _fold_project(
    events: list[dict[str, Any]], snapshot: dict[str, Any] | None, sdk: Any
) -> list[dict[str, Any]] | None:
    defs = _definitions(events, snapshot)
    if not defs:
        return None

    noop = sdk.TraceSinkConfig(kind="noop")
    tools = [
        sdk.ExecutableTool(
            id=d["id"],
            name=d["name"],
            description=d["description"],
            input_schema=d["input_schema"] or {"type": "object"},
            output_schema=d["output_schema"] or {"type": "object"},
            experimental_searchable_description=d["searchable"],
            execute=lambda *_: {},
        )
        for d in defs
    ]
    plain = sdk.ToolCatalog(trace=noop)
    boosted = sdk.ToolCatalog(trace=noop)

    async def register() -> None:
        await plain.register(tools)
        await boosted.register(tools)

    asyncio.run(register())

    graph = sdk.IntentGraph()
    learner = sdk.ToolCatalog(trace=noop)
    learner.experimental_enable_adaptive_ranking(
        graph, origins="any", provenance="seeded", warn_on_model_mismatch=False
    )

    # Cloud attaches the live graph with `learn: false`; released SDKs lack that option, so
    # `boosted` ranks from a snapshot taken whenever the learner moved the graph.
    snapshot_rev = -1

    def boost_from() -> None:
        nonlocal snapshot_rev
        if graph.rev == snapshot_rev:
            return
        boosted.experimental_disable_adaptive_ranking()
        boosted.experimental_enable_adaptive_ranking(
            sdk.IntentGraph.from_json(graph.to_json()), origins="any", warn_on_model_mismatch=False
        )
        snapshot_rev = graph.rev

    turns: list[dict[str, Any]] = []
    try:
        for e in events:
            core = _core_event(e)
            if core is None:
                continue
            if e["type"] == "search":
                served = [h.get("tool_id") for h in e.get("hits") or []]
                base = e.get("base_hits") or []
                if base:
                    turns.append(
                        {
                            "key": boost_turn_key(e),
                            "plain_ids": [h.get("tool_id") for h in base][:REPLAY_K],
                            "boosted_ids": served[:REPLAY_K],
                            "matched": True,
                            "reported": True,
                        }
                    )
                else:
                    boost_from()
                    p = plain.search(e["query"], REPLAY_K, SHADOW_ORIGIN)
                    b = boosted.search(e["query"], REPLAY_K, SHADOW_ORIGIN)
                    turns.append(
                        {
                            "key": boost_turn_key(e),
                            "plain_ids": [h.tool_id for h in p],
                            "boosted_ids": [h.tool_id for h in b],
                            "matched": bool(b) and b[0].fused is True,
                            "reported": False,
                        }
                    )
            learner.record_event(
                core,
                {
                    "event_id": boost_turn_key(e),
                    "turn_id": f"{e['session_id']}:{e.get('turn_id') or ''}",
                },
            )
    finally:
        boosted.experimental_disable_adaptive_ranking()
        learner.experimental_disable_adaptive_ranking()
    return turns
