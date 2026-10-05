import { RANGES, relativeTime, type TimeRange } from "@ratel-ai/burrow-model";
import { Activity, BookOpen, Eye, Home, type LucideIcon, Orbit } from "lucide-react";
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

const RANGE_LABEL: Record<TimeRange, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  all: "All",
};

/** The time range every page reads; windows end at the latest event. */
function RangePicker() {
  const { range, setRange, projects } = useBurrow();
  if (projects.length === 0) return null;
  return (
    <div className="mb-4 px-2">
      <div className="eyebrow mb-1">Time range</div>
      <div
        role="radiogroup"
        aria-label="Time range"
        className="grid grid-cols-4 gap-0.5 rounded-lg border border-forest-300 bg-base-deep/60 p-0.5"
      >
        {RANGES.map((r) => (
          // biome-ignore lint/a11y/useSemanticElements: a segmented control
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={range === r}
            onClick={() => setRange(r)}
            className={cx(
              "rounded-md py-1 font-mono text-xs transition-colors",
              range === r ? "bg-forest-300 text-cream" : "text-warm-muted hover:text-cream",
            )}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>
      <div className="mt-1 px-0.5 text-[11px] text-warm-muted">ending at the latest event</div>
    </div>
  );
}

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
        <RangePicker />
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
          <div className="flex items-center gap-2">
            <Eye className="size-3.5" /> Read-only
          </div>
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
