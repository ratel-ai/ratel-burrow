import {
  formatBytes,
  MAX_INTENT_GRAPH_BYTES,
  MAX_INTENT_GRAPH_CLUSTERS,
  type SummaryTiles as Tiles,
} from "@ratel-ai/burrow-model";

/** Ported from Ratel Cloud's `components/adaptive-ranking/SummaryTiles.tsx`. */

const CELL = "rounded-xl border border-forest-300 bg-forest-600/60 px-3.5 py-2.5";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint} className={`${CELL} min-w-[6.5rem] flex-1`}>
      <div className="text-[10px] uppercase tracking-wide text-warm-muted">{label}</div>
      <div className="mt-0.5 font-display text-lg font-semibold tabular-nums text-cream">
        {value}
      </div>
    </div>
  );
}

/** How full the graph is against a cap. Coral once within 10% of it. */
function TileMeter({
  label,
  value,
  total,
  right,
}: {
  label: string;
  value: number;
  total: number;
  right: string;
}) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[10px] text-warm-muted">{label}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: styled bar with a meter role, as in Ratel Cloud */}
      <div
        role="meter"
        aria-label={`${label}: ${right}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(value, total)}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-forest/40"
      >
        <div
          className={
            ratio >= 0.9 ? "h-full rounded-full bg-coral/70" : "h-full rounded-full bg-green/70"
          }
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-warm-muted">{right}</span>
    </div>
  );
}

const n = (v: number) => v.toLocaleString("en-US");

export function SummaryTiles({ tiles, byteSize }: { tiles: Tiles; byteSize: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className={`${CELL} flex min-w-[16rem] flex-[2] items-center gap-4`}>
        <div className="shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-warm-muted">Clusters</div>
          <div className="mt-0.5 font-display text-lg font-semibold tabular-nums text-cream">
            {n(tiles.clusters)}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <TileMeter
            label="Cap"
            value={tiles.clusters}
            total={MAX_INTENT_GRAPH_CLUSTERS}
            right={`${n(tiles.clusters)} / ${n(MAX_INTENT_GRAPH_CLUSTERS)}`}
          />
          <TileMeter
            label="Size"
            value={byteSize}
            total={MAX_INTENT_GRAPH_BYTES}
            right={`${formatBytes(byteSize)} / ${formatBytes(MAX_INTENT_GRAPH_BYTES)}`}
          />
        </div>
      </div>
      <Tile label="Observations" value={n(tiles.totalSupport)} hint="Confirmed searches" />
      <Tile label="Tools" value={n(tiles.distinctTools)} hint="Distinct tool ids with edges" />
      <Tile label="Skills" value={n(tiles.distinctSkills)} hint="Distinct skill ids with edges" />
    </div>
  );
}
