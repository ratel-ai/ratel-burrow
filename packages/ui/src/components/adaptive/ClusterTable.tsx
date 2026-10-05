import {
  CLUSTER_PAGE_SIZE,
  type ClusterTableRow,
  relativeTime,
  SUPPORT_FULL,
  type TopEdge,
} from "@ratel-ai/burrow-model";
import { CapabilityChip } from "./CapabilityChip";

/** Ported from Ratel Cloud's `components/adaptive-ranking/ClusterTable.tsx`. */

export function SupportRamp({ support }: { support: number }) {
  const lit = Math.min(SUPPORT_FULL, Math.max(0, support));
  return (
    <span
      role="img"
      aria-label={`support ${Math.min(support, SUPPORT_FULL)} of ${SUPPORT_FULL}`}
      className="inline-flex items-center gap-0.5"
    >
      {Array.from({ length: SUPPORT_FULL }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length ramp segments
          key={i}
          className={`h-1 w-2.5 rounded-sm ${i < lit ? "bg-green" : "bg-forest-300"}`}
        />
      ))}
    </span>
  );
}

function TopCapability({ edge, kind }: { edge: TopEdge | null; kind: "tool" | "skill" }) {
  if (!edge) return <span className="text-warm-muted">—</span>;
  return (
    <CapabilityChip target={{ kind, id: edge.id, weight: edge.weight, missing: edge.missing }} />
  );
}

const TH = "px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wide text-warm-muted";
const TD = "px-3 py-2.5 align-middle text-xs text-cream-dim";

/** One line per cluster, support descending; a row opens the cluster drawer. */
export function ClusterTable({
  rows,
  selectedId,
  onSelect,
  page = 1,
  pageSize = CLUSTER_PAGE_SIZE,
  onPageChange,
}: {
  rows: ClusterTableRow[];
  selectedId: string | null;
  onSelect: (clusterId: string) => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const offset = (current - 1) * pageSize;
  const visible = rows.slice(offset, offset + pageSize);
  const now = Date.now();
  if (rows.length === 0) {
    return <p className="text-sm text-warm-muted">Nothing learned yet.</p>;
  }
  return (
    <div>
      <div className="mb-2 text-xs text-warm-muted">
        {offset + 1}–{offset + visible.length} of {rows.length.toLocaleString("en-US")} clusters ·
        click a row for details
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <thead>
            <tr className="border-b border-forest-300">
              <th className={`${TH} w-[34%]`}>Pattern</th>
              <th className={`${TH} w-[8%] text-right`}>Phrasings</th>
              <th className={`${TH} w-[10%]`}>Searches</th>
              <th className={`${TH} w-[8%]`}>Tools</th>
              <th className={`${TH} w-[16%]`}>Top tool</th>
              <th className={`${TH} w-[16%]`}>Top skill</th>
              <th className={`${TH} w-[8%]`}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const selected = row.clusterId === selectedId;
              return (
                <tr
                  key={row.clusterId}
                  tabIndex={0}
                  aria-label={`Open cluster ${row.clusterId}`}
                  onClick={() => onSelect(row.clusterId)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(row.clusterId);
                    }
                  }}
                  className={`cursor-pointer border-b border-forest-300/50 transition-colors hover:bg-forest/30 focus-visible:bg-forest/30 focus-visible:outline-none ${selected ? "bg-coral/10 shadow-[inset_3px_0_0_var(--color-coral)]" : ""}`}
                >
                  <td className={`${TD} w-[34%]`}>
                    <span className="block whitespace-normal break-words text-sm leading-5 text-cream">
                      {row.displayLabel}
                    </span>
                  </td>
                  <td className={`${TD} text-right tabular-nums`}>{row.memberCount}</td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2 tabular-nums">
                      {row.support}
                      <SupportRamp support={row.support} />
                    </span>
                  </td>
                  <td className={`${TD} tabular-nums`}>
                    <span className="text-green">{row.toolEdgeCount}</span>
                    <span className="text-warm-muted"> · </span>
                    <span className="text-coral">{row.skillEdgeCount}</span>
                  </td>
                  <td className={TD}>
                    <TopCapability edge={row.topTool} kind="tool" />
                  </td>
                  <td className={TD}>
                    <TopCapability edge={row.topSkill} kind="skill" />
                  </td>
                  <td
                    className={`${TD} whitespace-nowrap`}
                    title={row.lastTs ? new Date(row.lastTs).toISOString() : undefined}
                  >
                    {relativeTime(row.lastTs, now)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <nav
          aria-label="Pattern pages"
          className="mt-3 flex items-center justify-end gap-2 text-xs text-warm-muted"
        >
          <button
            type="button"
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => onPageChange?.(current - 1)}
            className="rounded-md border border-forest-300 px-2 py-1 transition-colors hover:text-cream disabled:opacity-40"
          >
            ‹
          </button>
          <span className="tabular-nums">
            {current} / {pageCount}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={current >= pageCount}
            onClick={() => onPageChange?.(current + 1)}
            className="rounded-md border border-forest-300 px-2 py-1 transition-colors hover:text-cream disabled:opacity-40"
          >
            ›
          </button>
        </nav>
      ) : null}
    </div>
  );
}
