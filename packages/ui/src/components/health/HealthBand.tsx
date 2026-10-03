import {
  type HealthTile,
  type HealthTileKey,
  sparkDomain,
  tileDelta,
  tileFigure,
  tileIntervalText,
} from "@ratel-ai/burrow-model";
import { cx } from "../ui";
import { Trend, TrendChip } from "./Trend";

/**
 * The health band, ported from Ratel Cloud's `components/health/HealthBand.tsx`:
 * four instrument tiles, the figure with its delta chip, the likely range and a
 * plain sub line, and a daily sparkline along the bottom edge. Each reading has
 * one quiet identity hue; green and coral only ever mean better or worse.
 */
const ACCENT: Record<HealthTileKey, string> = {
  first_try: "#5b9bd5",
  detours: "#9b8cff",
  junk: "var(--color-teal)",
  wasted_calls: "var(--color-cream-dim)",
};

export function HealthBand({ tiles }: { tiles: readonly HealthTile[] }) {
  return (
    <section aria-label="Health band" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <HealthTileCard key={tile.key} tile={tile} />
      ))}
    </section>
  );
}

function HealthTileCard({ tile }: { tile: HealthTile }) {
  const accent = ACCENT[tile.key];
  const figure = tileFigure(tile);
  const interval = tileIntervalText(tile);
  const delta = tileDelta(tile);
  return (
    <div
      title={interval ? `${tile.sub} Likely ${interval}.` : tile.sub}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-forest-300 bg-forest-600/60 px-3.5 pt-3 transition-colors hover:bg-forest/40"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
        <p className="eyebrow min-w-0 truncate">{tile.label}</p>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span
            className={cx(
              "font-display text-[2.25rem] font-semibold leading-none tracking-tight tabular-nums",
              figure.ready ? "text-cream" : "text-warm-muted/60",
            )}
          >
            {figure.value}
          </span>
          {figure.unit ? (
            <span className="whitespace-nowrap font-mono text-[11px] text-warm-muted">
              {figure.unit}
            </span>
          ) : null}
        </p>
        {delta ? (
          delta.direction === "flat" ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-forest-300/35 px-2 py-1 font-mono text-xs leading-none tabular-nums text-warm-muted"
              title={delta.description}
            >
              → {delta.text}
            </span>
          ) : (
            <TrendChip
              up={delta.direction === "up"}
              good={delta.tone === "good"}
              label={delta.text}
              title={delta.description}
              size="md"
            />
          )
        ) : null}
      </div>
      <div className="-mx-3.5 mt-auto pt-2">
        <Trend
          data={tile.series.map((p) => p.value)}
          accent={accent}
          domain={figure.ready ? sparkDomain(tile.series, tile.unit) : null}
        />
      </div>
    </div>
  );
}
