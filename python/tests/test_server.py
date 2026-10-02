import http.client
import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from ratel_burrow.discovery import Source
from ratel_burrow.server import BurrowServer, start_server

TOKEN = "test-token"


@pytest.fixture
def server(tmp_path: Path) -> Iterator[BurrowServer]:
    ui = tmp_path / "ui"
    (ui / "assets").mkdir(parents=True)
    (ui / "index.html").write_text("<!doctype html><title>Burrow</title>")
    (ui / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("nope")
    trace = tmp_path / "t.jsonl"
    trace.write_text("0123456789")
    src = Source(id="abc123", kind="trace", path=str(trace), label="t.jsonl", size=10, mtime=1)
    srv = start_server(discover=lambda: [src], ui_dir=ui, token=TOKEN, port=0)
    yield srv
    srv.close()


def req(
    srv: BurrowServer,
    path: str,
    method: str = "GET",
    auth: bool = True,
    host: str | None = None,
) -> tuple[int, dict[str, str], bytes]:
    conn = http.client.HTTPConnection("127.0.0.1", srv.port, timeout=5)
    headers = {"Authorization": f"Bearer {TOKEN}"} if auth else {}
    if host is not None:
        headers["Host"] = host
    conn.request(method, path, headers=headers)
    res = conn.getresponse()
    body = res.read()
    out = (res.status, {k.lower(): v for k, v in res.getheaders()}, body)
    conn.close()
    return out


def test_binds_loopback_with_token_url(server: BurrowServer) -> None:
    assert server.origin == f"http://127.0.0.1:{server.port}"
    assert server.url == f"{server.origin}/?t={TOKEN}"


def test_lists_sources(server: BurrowServer) -> None:
    status, _, body = req(server, "/api/sources")
    assert status == 200
    sources = json.loads(body)["sources"]
    assert sources[0]["id"] == "abc123" and sources[0]["size"] == 10


def test_serves_source_from_offset(server: BurrowServer) -> None:
    assert req(server, "/api/sources/abc123")[2] == b"0123456789"
    status, headers, body = req(server, "/api/sources/abc123?offset=7")
    assert (status, body, headers["x-burrow-size"]) == (200, b"789", "10")
    assert req(server, "/api/sources/abc123?offset=99")[2] == b""
    assert req(server, "/api/sources/nope")[0] == 404


def test_rejects_missing_or_wrong_token(server: BurrowServer) -> None:
    assert req(server, "/api/sources", auth=False)[0] == 401


def test_read_only(server: BurrowServer) -> None:
    for method in ["POST", "PUT", "PATCH", "DELETE"]:
        assert req(server, "/api/sources", method=method)[0] == 405


def test_rejects_foreign_host(server: BurrowServer) -> None:
    assert req(server, "/api/sources", host="evil.example")[0] == 403


def test_ui_shell_and_assets(server: BurrowServer) -> None:
    assert req(server, "/", auth=False)[0] == 401
    status, headers, body = req(server, f"/?t={TOKEN}", auth=False)
    assert status == 200 and b"<title>Burrow</title>" in body
    assert "default-src 'self'" in headers["content-security-policy"]
    status, headers, _ = req(server, "/assets/app.js", auth=False)
    assert status == 200 and "javascript" in headers["content-type"]
    assert req(server, "/assets/missing.js", auth=False)[0] == 404
    assert req(server, "/..%2fsecret.txt", auth=False)[0] == 404
