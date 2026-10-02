import { relativeTime } from "@ratel-ai/burrow-model";
import {
  Activity,
  Eye,
  LayoutGrid,
  Library,
  type LucideIcon,
  Network,
  ScanSearch,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BadgerMark, BurrowMascot } from "./components/Mascot";
import { cx } from "./components/ui";
import { BurrowProvider, useBurrow } from "./lib/data";
import { href, type Page, useRoute } from "./lib/route";
import { AdaptiveScreen } from "./screens/Adaptive";
import { CatalogScreen } from "./screens/Catalog";
import { HealthScreen } from "./screens/Health";
import { InspectorScreen } from "./screens/Inspector";
import { OverviewScreen } from "./screens/Overview";

const NAV: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: "overview", label: "Overview", icon: LayoutGrid },
  { page: "catalog", label: "Catalog", icon: Library },
  { page: "inspector", label: "Search inspector", icon: ScanSearch },
  { page: "adaptive", label: "Adaptive ranking", icon: Network },
  { page: "health", label: "Agent health", icon: Activity },
];

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
        <nav className="space-y-0.5">
          {NAV.map(({ page: p, label, icon: Icon }) => (
            <a
              key={p}
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                p === page
                  ? "bg-forest-300/70 text-cream"
                  : "text-cream-dim/80 hover:bg-forest-300/40 hover:text-cream",
              )}
            >
              <Icon className={cx("size-4", p === page ? "text-green" : "text-warm-muted")} />
              {label}
            </a>
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
                data.status === "ready"
                  ? "bg-green"
                  : data.status === "offline"
                    ? "bg-coral"
                    : "bg-warm-muted",
              )}
            />
            {data.status === "offline"
              ? "Launcher unreachable"
              : data.lastUpdated
                ? `Live · updated ${relativeTime(data.lastUpdated, now)}`
                : "Connecting…"}
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-6">
        <div className="mx-auto max-w-6xl">
          {page === "overview" && <OverviewScreen />}
          {page === "catalog" && <CatalogScreen />}
          {page === "inspector" && <InspectorScreen />}
          {page === "adaptive" && <AdaptiveScreen />}
          {page === "health" && <HealthScreen />}
        </div>
      </main>
    </div>
  );
}
