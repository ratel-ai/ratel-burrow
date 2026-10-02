"""The read-only HTTP contract of ADR 0002. Mirrors packages/cli/src/server.ts."""

from __future__ import annotations

import hmac
import json
import mimetypes
import threading
from collections.abc import Callable
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit

from .discovery import Source

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
    "base-uri 'none'; form-action 'none'"
)
MIME = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
}
CHUNK = 64 * 1024


@dataclass
class DerivedSource:
    """A source the launcher computes from the files rather than serves raw (ADR 0005)."""

    id: str
    kind: str
    label: str
    #: (size, mtime) while available, None to hide it; changes whenever its inputs do.
    describe: Callable[[], tuple[int, float] | None]
    #: The JSON body.
    read: Callable[[], str]


@dataclass
class BurrowServer:
    origin: str
    url: str
    port: int
    _httpd: ThreadingHTTPServer
    _thread: threading.Thread

    def close(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()
        self._thread.join(timeout=5)

    def serve_forever(self) -> None:
        self._thread.join()


def _safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def start_server(
    *,
    discover: Callable[[], list[Source]],
    ui_dir: Path | str,
    token: str,
    port: int = 0,
    host: str = "127.0.0.1",
    derived: list[DerivedSource] | None = None,
) -> BurrowServer:
    ui_root = Path(ui_dir).resolve()
    derived_sources = derived or []

    def list_sources() -> list[dict[str, object]]:
        out: list[dict[str, object]] = [s.to_json() for s in discover()]
        for d in derived_sources:
            described = d.describe()
            if described is not None:
                size, mtime = described
                out.append(
                    {
                        "id": d.id,
                        "kind": d.kind,
                        "path": "",
                        "label": d.label,
                        "size": size,
                        "mtime": mtime,
                    }
                )
        return out

    class Handler(BaseHTTPRequestHandler):
        server_version = "ratel-burrow"
        sys_version = ""

        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            return  # quiet: the terminal shows the URL, not access logs

        def _send(
            self, status: int, body: bytes, ctype: str, extra: dict[str, str] | None = None
        ) -> None:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _text(self, status: int, text: str) -> None:
            self._send(status, text.encode(), "text/plain; charset=utf-8")

        def _json(self, status: int, value: object) -> None:
            self._send(status, json.dumps(value).encode(), "application/json; charset=utf-8")

        def _read_only(self) -> None:
            self.send_response(405)
            self.send_header("Allow", "GET, HEAD")
            self.send_header("Content-Length", "0")
            self.end_headers()

        do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = _read_only

        def do_HEAD(self) -> None:
            self.do_GET()

        def do_GET(self) -> None:
            port_now = bound_port()
            if self.headers.get("Host", "") not in (
                f"127.0.0.1:{port_now}",
                f"localhost:{port_now}",
            ):
                return self._text(403, "Forbidden host.")
            parts = urlsplit(self.path)
            path = parts.path
            query = parse_qs(parts.query)

            if path.startswith("/api/"):
                auth = self.headers.get("Authorization", "")
                given = auth[7:] if auth.startswith("Bearer ") else ""
                if not _safe_equal(given, token):
                    return self._json(401, {"error": "unauthorized"})
                if path == "/api/sources":
                    return self._json(200, {"sources": list_sources()})
                derived_match = next(
                    (d for d in derived_sources if path == f"/api/sources/{d.id}"), None
                )
                if derived_match is not None:
                    if derived_match.describe() is None:
                        return self._json(404, {"error": "unavailable"})
                    try:
                        body = derived_match.read()
                    except Exception as err:  # the replay must never break the other sources
                        body = json.dumps({"error": str(err)})
                    return self._send(200, body.encode(), "application/json; charset=utf-8")
                if path.startswith("/api/sources/"):
                    sid = path[len("/api/sources/") :]
                    match = next((s for s in discover() if s.id == sid), None)
                    if match is None:
                        return self._json(404, {"error": "unknown source"})
                    try:
                        offset = max(0, int(query.get("offset", ["0"])[0]))
                    except ValueError:
                        offset = 0
                    return self._serve_source(Path(match.path), offset)
                return self._json(404, {"error": "not found"})

            if Path(path).suffix and path != "/index.html":
                return self._serve_asset(path)
            if not _safe_equal(query.get("t", [""])[0], token):
                return self._text(
                    401,
                    "Open the link printed by `ratel-burrow` (it carries a one-time access token).",
                )
            index = ui_root / "index.html"
            if not index.is_file():
                return self._text(404, "UI bundle missing.")
            self._send(200, index.read_bytes(), MIME[".html"], {"Content-Security-Policy": CSP})

        def _serve_source(self, path: Path, offset: int) -> None:
            try:
                size = path.stat().st_size
            except OSError:
                return self._json(404, {"error": "source vanished"})
            length = max(0, size - offset)
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Burrow-Size", str(size))
            self.end_headers()
            if self.command == "HEAD" or length == 0:
                return
            with path.open("rb") as f:
                f.seek(offset)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(CHUNK, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)

        def _serve_asset(self, url_path: str) -> None:
            full = (ui_root / ("." + unquote(url_path))).resolve()
            if full != ui_root and ui_root not in full.parents:
                return self._text(404, "Not found.")
            if not full.is_file():
                return self._text(404, "Not found.")
            ctype = (
                MIME.get(full.suffix)
                or mimetypes.guess_type(full.name)[0]
                or "application/octet-stream"
            )
            self._send(200, full.read_bytes(), ctype, {"Cache-Control": "public, max-age=3600"})

    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    bound = int(httpd.server_address[1])

    def bound_port() -> int:
        return bound

    thread = threading.Thread(target=httpd.serve_forever, name="ratel-burrow", daemon=True)
    thread.start()
    origin = f"http://{host}:{bound}"
    return BurrowServer(origin, f"{origin}/?t={quote(token)}", bound, httpd, thread)
