import { timingSafeEqual } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve, sep } from "node:path";
import type { Source } from "./discovery.js";

/**
 * The read-only HTTP contract of ADR 0002. Every route is a GET; nothing writes.
 * `/api/*` needs the bearer token; the HTML shell needs `?t=<token>`; static
 * assets (hashed, non-secret) are public. Bound to 127.0.0.1 with a Host check.
 */
export interface ServerOptions {
  /** Called per request so files created after launch (new sessions) appear. */
  discover: () => Source[];
  /**
   * Sources the launcher computes from the files rather than serves raw (ADR 0005): today
   * only the Boost replay. Listed while `describe()` returns a size/mtime, read on request.
   */
  derived?: DerivedSource[];
  uiDir: string;
  token: string;
  port?: number;
  host?: string;
}

export interface DerivedSource {
  id: string;
  kind: Source["kind"];
  label: string;
  /** Null hides it; size/mtime change whenever its inputs do, so the UI knows to refetch. */
  describe: () => { size: number; mtime: number } | null;
  /** The JSON body. */
  read: () => Promise<string>;
}

export interface BurrowServer {
  origin: string;
  /** The launch URL, carrying the token. */
  url: string;
  close: () => Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = "text/plain; charset=utf-8",
) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown) {
  send(res, status, JSON.stringify(body), "application/json; charset=utf-8");
}

const COMMON_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export function startServer(options: ServerOptions): Promise<BurrowServer> {
  const host = options.host ?? "127.0.0.1";
  const uiRoot = resolve(options.uiDir);
  let port = 0;

  const listSources = () => {
    const files = options.discover();
    const derived = (options.derived ?? []).flatMap((d) => {
      const described = d.describe();
      return described
        ? [
            {
              id: d.id,
              kind: d.kind,
              path: "",
              label: d.label,
              size: described.size,
              mtime: described.mtime,
            },
          ]
        : [];
    });
    return [...files, ...derived];
  };

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    for (const [k, v] of Object.entries(COMMON_HEADERS)) res.setHeader(k, v);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("allow", "GET, HEAD");
      return send(res, 405, "Ratel Burrow is read-only.");
    }
    const hostHeader = req.headers.host ?? "";
    if (hostHeader !== `127.0.0.1:${port}` && hostHeader !== `localhost:${port}`) {
      return send(res, 403, "Forbidden host.");
    }
    const url = new URL(req.url ?? "/", `http://${hostHeader}`);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      const auth = req.headers.authorization ?? "";
      const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!safeEqual(given, options.token)) return json(res, 401, { error: "unauthorized" });
      if (path === "/api/sources") return json(res, 200, { sources: listSources() });
      const derived = options.derived?.find((d) => path === `/api/sources/${d.id}`);
      if (derived) {
        if (!derived.describe()) return json(res, 404, { error: "unavailable" });
        derived.read().then(
          (body) => send(res, 200, body, "application/json; charset=utf-8"),
          (err: unknown) => json(res, 200, { error: (err as Error).message ?? String(err) }),
        );
        return;
      }
      const match = /^\/api\/sources\/([a-f0-9]{1,64})$/.exec(path);
      if (match) {
        const source = options.discover().find((s) => s.id === match[1]);
        if (!source) return json(res, 404, { error: "unknown source" });
        return serveSource(res, source.path, Number(url.searchParams.get("offset") ?? 0));
      }
      return json(res, 404, { error: "not found" });
    }

    if (extname(path) !== "" && path !== "/index.html") return serveAsset(res, uiRoot, path);
    if (!safeEqual(url.searchParams.get("t") ?? "", options.token)) {
      return send(
        res,
        401,
        "Open the link printed by `ratel-burrow` (it carries a one-time access token).",
      );
    }
    return serveFile(res, join(uiRoot, "index.html"), { "content-security-policy": CSP });
  };

  const server = createServer(handler);
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => {
      port = (server.address() as AddressInfo).port;
      const origin = `http://${host}:${port}`;
      resolvePromise({
        origin,
        url: `${origin}/?t=${encodeURIComponent(options.token)}`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

function serveSource(res: ServerResponse, path: string, rawOffset: number) {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return json(res, 404, { error: "source vanished" });
  }
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-burrow-size": String(size),
  });
  if (offset >= size) return res.end();
  createReadStream(path, { start: offset, end: size - 1 }).pipe(res);
}

function serveAsset(res: ServerResponse, root: string, urlPath: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return send(res, 400, "Bad path.");
  }
  const full = resolve(root, `.${decoded}`);
  if (full !== root && !full.startsWith(root + sep)) return send(res, 404, "Not found.");
  return serveFile(res, full, { "cache-control": "public, max-age=3600" });
}

function serveFile(res: ServerResponse, path: string, headers: Record<string, string> = {}) {
  try {
    if (!statSync(path).isFile()) return send(res, 404, "Not found.");
  } catch {
    return send(res, 404, "Not found.");
  }
  res.writeHead(200, {
    "content-type": MIME[extname(path)] ?? "application/octet-stream",
    "cache-control": "no-store",
    ...headers,
  });
  createReadStream(path).pipe(res);
}
