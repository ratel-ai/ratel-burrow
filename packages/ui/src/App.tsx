import { relativeTime } from "@ratel-ai/burrow-model";
import { Activity, BookOpen, ExternalLink, Home, type LucideIcon, Orbit } from "lucide-react";
import { useEffect, useState } from "react";
import { BadgerMark, BurrowMascot } from "./components/Mascot";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { cx } from "./components/ui";
import { BurrowProvider, useBurrow } from "./lib/data";
import { href, type Page, useRoute } from "./lib/route";
import { AdaptiveScreen } from "./screens/Adaptive";
import { CatalogScreen } from "./screens/Catalog";
import { InspectorScreen } from "./screens/Inspector";
import { OverviewScreen } from "./screens/Overview";

/** Ratel Cloud's sidebar groups and icons (`ScopedSidebar.tsx`), for the pages Burrow has. */
const NAV: { group: string; items: { page: Page; label: string; icon: LucideIcon }[] }[] = [
  { group: "Project", items: [{ page: "overview", label: "Summary", icon: Home }] },
  { group: "Observability", items: [{ page: "inspector", label: "Searches", icon: Activity }] },
  { group: "Capabilities", items: [{ page: "catalog", label: "Catalogs", icon: BookOpen }] },
  {
    group: "Continuous improvement",
    items: [{ page: "adaptive", label: "Adaptive ranking", icon: Orbit }],
  },
];

const LIVE_WITHIN_MS = 5 * 60_000;

export function App() {
  return (
    <BurrowProvider>
      <Shell />
    </BurrowProvider>
  );
}

function useNow(ms = 5_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function Shell() {
  const { page } = useRoute();
  const data = useBurrow();
  const now = useNow();
  // "Live" means events are still arriving, not just that the launcher answered.
  const live = data.latestTs !== null && now - data.latestTs < LIVE_WITHIN_MS;

  if (data.status === "unauthorized") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <BurrowMascot className="w-72" />
        <div>
          <h1 className="text-xl font-semibold">This link has no valid access token</h1>
          <p className="mt-2 text-sm text-warm-muted">
            Open the URL printed by <code className="font-mono text-cream-dim">ratel-burrow</code>{" "}
            in your terminal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-forest-300/60 bg-base-deep/60 px-3 py-4">
        <a href={href("overview")} className="flex items-center gap-2.5 px-2 pb-5">
          <BadgerMark className="h-5 text-cream" />
          <span className="text-[17px] font-semibold tracking-tight">
            Ratel <span className="text-green">Burrow</span>
          </span>
        </a>
        <ProjectSwitcher />
        <nav className="space-y-4">
          {NAV.map(({ group, items }) => (
            <div key={group}>
              <div className="eyebrow px-2.5 pb-1">{group}</div>
              <div className="space-y-0.5">
                {items.map(({ page: p, label, icon: Icon }) => (
                  <a
                    key={p}
                    href={href(p)}
                    aria-current={p === page ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                      p === page
                        ? "bg-forest-300/70 text-cream"
                        : "text-cream-dim hover:bg-forest-300/40 hover:text-cream",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.7} aria-hidden />
                    {label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto space-y-2 px-2 text-xs text-warm-muted">
          <a
            href="https://docs.ratel.sh/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-cream"
          >
            <ExternalLink className="size-3.5" /> Ratel docs
          </a>
          <div className="flex items-center gap-2" aria-live="polite">
            <span
              className={cx(
                "inline-block size-2 rounded-full",
                data.status === "offline" ? "bg-coral" : live ? "bg-green" : "bg-warm-muted",
              )}
            />
            {data.status === "offline"
              ? "Launcher unreachable"
              : data.latestTs === null
                ? data.lastUpdated
                  ? "Waiting for the first event"
                  : "Connecting…"
                : live
                  ? "Live · new events arriving"
                  : `Last event ${relativeTime(data.latestTs, now)}`}
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-6">
        <div className="mx-auto max-w-6xl">
          {page === "overview" && <OverviewScreen />}
          {page === "catalog" && <CatalogScreen />}
          {page === "inspector" && <InspectorScreen />}
          {page === "adaptive" && <AdaptiveScreen />}
        </div>
      </main>
    </div>
  );
}

/**
 * The project every screen is scoped to: one runtime's source_id (`events.sourceId` /
 * `OTEL_SERVICE_NAME` in the SDK), the local counterpart of a Ratel Cloud project.
 */
