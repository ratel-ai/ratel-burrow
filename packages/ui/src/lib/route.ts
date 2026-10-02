import { useEffect, useState } from "react";

export type Page = "overview" | "catalog" | "inspector" | "adaptive" | "health";

export const PAGES: Page[] = ["overview", "catalog", "inspector", "adaptive", "health"];

export interface Route {
  page: Page;
  params: URLSearchParams;
}

/**
 * Hash routing (`#/catalog?tab=skills&id=x`): the launcher serves one HTML shell
 * and the access token stays in the query string untouched.
 */
function parse(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const page = (PAGES as string[]).includes(path) ? (path as Page) : "overview";
  return { page, params: new URLSearchParams(query) };
}

export function href(page: Page, params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, v);
  const qs = q.toString();
  return `#/${page}${qs ? `?${qs}` : ""}`;
}

export function navigate(page: Page, params: Record<string, string | undefined> = {}) {
  window.location.hash = href(page, params);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
