from pathlib import Path

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
