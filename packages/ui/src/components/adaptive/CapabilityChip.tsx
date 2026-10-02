import { href } from "../../lib/route";

/**
 * A tool or skill reference in the cluster table and drawer, ported from Ratel
 * Cloud's CapabilityChip. Cloud opens a catalog popover; Burrow links to its
 * Catalog screen.
 */
export interface CapabilityTarget {
  kind: "tool" | "skill";
  id: string;
  weight?: number;
  surfaced?: number | null;
  damper?: number | null;
  /** False when the catalog does not define it (only known when definitions were recorded). */
  missing?: boolean;
}

export function CapabilityChip({ target }: { target: CapabilityTarget }) {
  const tone = target.kind === "tool" ? "text-green" : "text-coral";
  return (
    <a
      href={href("catalog", { tab: `${target.kind}s`, id: target.id })}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex max-w-full flex-col items-start gap-0.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-forest/60"
    >
      <span className={`max-w-full break-all font-mono text-xs leading-4 ${tone}`}>
        {target.id}
      </span>
      {target.weight !== undefined ? (
        <span className="text-[11px] leading-none tabular-nums text-warm-muted">
          invoked {target.weight}×
        </span>
      ) : null}
      {target.surfaced != null && target.damper != null ? (
        <span
          title="Shown at or above the pick without being picked. The runtime scales this edge by min(1, (invoked + 3) / (passed over + 3))."
          className="text-[11px] leading-none tabular-nums text-warm-muted"
        >
          passed over {target.surfaced} · damper {target.damper.toFixed(2)}
        </span>
      ) : null}
      {target.missing ? (
        <span className="text-[10px] uppercase text-coral">not in catalog</span>
      ) : null}
    </a>
  );
}
