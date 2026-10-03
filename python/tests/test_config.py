import os
from pathlib import Path

import pytest

from ratel_burrow.config import burrow_config, burrow_paths


def test_burrow_config_points_jsonl_sink_at_dir(tmp_path: Path) -> None:
    d = tmp_path / ".ratel" / "burrow"
    cfg = burrow_config(dir=d, session_id="abc")
    trace = cfg["trace"]
    assert (trace.kind, trace.session_id, trace.path) == (
        "jsonl",
        "abc",
        str(d / "traces" / "abc.jsonl"),
    )
    assert (d / "traces").is_dir()


def test_fresh_session_each_call(tmp_path: Path) -> None:
    a = burrow_config(dir=tmp_path / "a")["trace"].session_id
    b = burrow_config(dir=tmp_path / "b")["trace"].session_id
    assert a != b


def test_paths() -> None:
    p = burrow_paths(dir="/x")
    assert (p.dir, p.traces, p.intent_graph, p.catalog_snapshot) == (
        "/x",
        "/x/traces",
        "/x/intent-graph.json",
        "/x/catalog-snapshot.json",
    )
    assert burrow_paths().dir == str(Path.cwd() / ".ratel" / "burrow")


def test_project_paths() -> None:
    assert burrow_paths(dir="/x", project="billing-agent").intent_graph == (
        "/x/intent-graphs/billing-agent.json"
    )
    assert burrow_paths(dir="/x", project="team/agent v2").intent_graph == (
        "/x/intent-graphs/team_agent_v2.json"
    )


def test_project_becomes_the_service_name(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_SERVICE_NAME", raising=False)
    burrow_config(dir=tmp_path / "a", project="billing-agent")
    assert os.environ["OTEL_SERVICE_NAME"] == "billing-agent"
    monkeypatch.setenv("OTEL_SERVICE_NAME", "already-set")
    burrow_config(dir=tmp_path / "b", project="other")
    assert os.environ["OTEL_SERVICE_NAME"] == "already-set"
    assert (tmp_path / "b" / "intent-graphs").is_dir()
