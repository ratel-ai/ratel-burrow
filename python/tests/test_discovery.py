from pathlib import Path

import pytest

from ratel_burrow.discovery import discover_sources, project_slug


@pytest.fixture
def env(tmp_path: Path) -> dict[str, Path]:
    home = tmp_path / "home"
    cwd = tmp_path / "work" / "my.app"
    cwd.mkdir(parents=True)
    return {"root": tmp_path, "home": home, "cwd": cwd}


def local(home: Path, slug: str, name: str, body: str = "{}\n") -> None:
    d = home / ".ratel" / "telemetry" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text(body)


def test_project_slug_matches_ratel_local() -> None:
    assert project_slug("/Users/me/my.app") == "-Users-me-my-app"


def test_finds_ratel_local_and_burrow_dir(env: dict[str, Path]) -> None:
    home, cwd = env["home"], env["cwd"]
    local(home, project_slug(str(cwd)), "2026-01-01T00-00-00-000Z-aaaaaa.jsonl")
    local(home, "-some-other-project", "x.jsonl")
    burrow = cwd / ".ratel" / "burrow"
    (burrow / "traces").mkdir(parents=True)
    (burrow / "traces" / "s.jsonl").write_text("")
    (burrow / "intent-graph.json").write_text("{}")
    (burrow / "catalog-snapshot.json").write_text("{}")

    sources = discover_sources(cwd=cwd, home=home, env={})
    assert [(s.kind, s.label) for s in sources] == [
        ("trace", "ratel-local · 2026-01-01T00-00-00-000Z-aaaaaa.jsonl"),
        ("trace", ".ratel/burrow/traces/s.jsonl"),
        ("intent_graph", ".ratel/burrow/intent-graph.json"),
        ("catalog_snapshot", ".ratel/burrow/catalog-snapshot.json"),
    ]
    assert len({s.id for s in sources}) == 4
    assert sources[0].size == 3


def test_honours_ratel_telemetry_dir(env: dict[str, Path]) -> None:
    root, home, cwd = env["root"], env["home"], env["cwd"]
    d = root / "elsewhere" / project_slug(str(cwd))
    d.mkdir(parents=True)
    (d / "a.jsonl").write_text("")
    sources = discover_sources(
        cwd=cwd, home=home, env={"RATEL_TELEMETRY_DIR": str(root / "elsewhere")}
    )
    assert [s.path for s in sources] == [str(d / "a.jsonl")]


def test_all_projects(env: dict[str, Path]) -> None:
    local(env["home"], "-a", "1.jsonl")
    local(env["home"], "-b", "2.jsonl")
    sources = discover_sources(cwd=env["cwd"], home=env["home"], env={}, all_projects=True)
    assert [s.label for s in sources] == ["ratel-local · -a/1.jsonl", "ratel-local · -b/2.jsonl"]


def test_explicit_paths_replace_defaults(env: dict[str, Path]) -> None:
    root, home, cwd = env["root"], env["home"], env["cwd"]
    local(home, project_slug(str(cwd)), "ignored.jsonl")
    trace_dir = root / "t"
    trace_dir.mkdir()
    (trace_dir / "one.jsonl").write_text("")
    (trace_dir / "notes.txt").write_text("")
    graph = root / "g.json"
    graph.write_text("{}")
    sources = discover_sources(
        cwd=cwd, home=home, env={}, traces=[str(trace_dir)], intent_graphs=[str(graph)]
    )
    assert [(s.kind, s.path) for s in sources] == [
        ("trace", str(trace_dir / "one.jsonl")),
        ("intent_graph", str(graph)),
    ]


def test_nothing_found_is_empty(env: dict[str, Path]) -> None:
    assert discover_sources(cwd=env["cwd"], home=env["home"], env={}) == []
