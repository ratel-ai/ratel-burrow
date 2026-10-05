import {
  CATALOG_PAGE_SIZES,
  CATALOG_PROVENANCE,
  CATALOG_PROVENANCE_ORDER,
  type CatalogEntry,
  type CatalogSortKey,
  type CatalogView,
  catalogRangeLabel,
  definitionTokens,
  filterCatalogRows,
  formatCount,
  nextSortDirection,
  presentProvenances,
  provenanceOf,
  sortCatalogRows,
} from "@ratel-ai/burrow-model";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "../ui";

/** How long typing settles before the filter and the URL follow. */
const FILTER_DEBOUNCE_MS = 200;

const COLUMNS: { key: CatalogSortKey; label: string; right?: boolean; title?: string }[] = [
  { key: "name", label: "Name" },
  { key: "calls", label: "Calls", right: true },
  { key: "retrieved", label: "Retrieved", right: true, title: "Searches that listed it" },
  {
    key: "tokens",
    label: "Tokens",
    right: true,
    title: "Context its definition costs when exposed (characters ÷ 4)",
  },
  { key: "lastSeen", label: "Last seen", right: true },
];

/** Ratel Cloud's tools table: toolbar, sortable header, whole-row open, paging footer. */
export function CatalogTable({
  noun,
  callsLabel,
  entries,
  view,
  onChange,
  onOpen,
}: {
  noun: string;
  callsLabel: string;
  entries: readonly CatalogEntry[];
  view: CatalogView;
  onChange: (patch: Partial<CatalogView>, replace?: boolean) => void;
  onOpen: (entry: CatalogEntry) => void;
}) {
  const filtered = useMemo(
    () => sortCatalogRows(filterCatalogRows(entries, view), view.sort, view.direction),
    [entries, view],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / view.pageSize));
  const page = Math.min(view.page, pageCount);
  const offset = (page - 1) * view.pageSize;
  const visible = filtered.slice(offset, offset + view.pageSize);
  const available = useMemo(() => presentProvenances(entries), [entries]);
  const now = Date.now();

  return (
    <div className="rounded-xl border border-forest-300/60 bg-forest-600/70 p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Toolbar noun={noun} view={view} available={available} onChange={onChange} />
        <span className="ml-auto text-xs text-warm-muted">
          {filtered.length} of {entries.length} {entries.length === 1 ? noun : `${noun}s`}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-forest-300 bg-base-deep/25 px-6 py-8 text-center">
            <SearchX className="mx-auto size-4 text-warm-muted" strokeWidth={1.6} aria-hidden />
            <p className="mt-3 text-sm text-cream-dim">No {noun}s match this filter</p>
            <button
              type="button"
              onClick={() => onChange({ query: "", provenance: "all", page: 1 })}
              className="mt-2 text-xs font-medium text-warm-muted underline decoration-dotted underline-offset-2 hover:text-cream"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-forest-300 bg-base-deep/35 font-mono text-[9px] uppercase tracking-[0.11em] text-warm-muted">
                  {COLUMNS.map((column) => {
                    const active = view.sort === column.key;
                    const Icon = !active
                      ? ChevronsUpDown
                      : view.direction === "asc"
                        ? ArrowUp
                        : ArrowDown;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        title={column.title}
                        aria-sort={
                          active ? (view.direction === "asc" ? "ascending" : "descending") : "none"
                        }
                        className={cx(
                          "font-medium",
                          column.key === "name" ? "px-5 py-2" : "px-4 py-2",
                          column.right && "text-right",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onChange({
                              sort: column.key,
                              direction: nextSortDirection(view, column.key),
                              page: 1,
                            })
                          }
                          className={cx(
                            "inline-flex items-center gap-1 rounded py-1 uppercase tracking-[0.11em] transition-colors hover:text-cream",
                            active ? "text-cream-dim" : "text-warm-muted",
                          )}
                        >
                          {column.key === "calls" ? callsLabel : column.label}
                          <Icon
                            className={cx("size-3", active ? "opacity-100" : "opacity-40")}
                            strokeWidth={2}
                            aria-hidden
                          />
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="w-8 pr-4">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => (
                  <Row key={entry.id} entry={entry} now={now} onOpen={onOpen} />
                ))}
              </tbody>
            </table>
            <Footer
              page={page}
              pageCount={pageCount}
              pageSize={view.pageSize}
              offset={offset}
              rowCount={visible.length}
              total={filtered.length}
              onChange={onChange}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  entry,
  now,
  onOpen,
}: {
  entry: CatalogEntry;
  now: number;
  onOpen: (entry: CatalogEntry) => void;
}) {
  const tokens = definitionTokens(entry);
  return (
    <tr
      tabIndex={0}
      aria-label={`Open ${entry.name}`}
      onClick={() => onOpen(entry)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(entry);
        }
      }}
      className="cursor-pointer border-b border-forest-300/45 transition-colors last:border-0 hover:bg-forest/60 focus-visible:bg-forest/60 focus-visible:outline-none"
    >
      <th scope="row" className="px-5 py-3 font-normal">
        <div className="flex items-center gap-2.5">
          <span
            className={cx(
              "size-1.5 shrink-0 rounded-full",
              entry.lastSeen ? "bg-green" : "bg-warm-muted/50",
            )}
            aria-hidden
          />
          <span className="truncate font-mono text-[13px] text-cream">{entry.name}</span>
          {provenanceOf(entry) === "observed" ? (
            <Badge title={CATALOG_PROVENANCE.observed.hint}>Observed</Badge>
          ) : null}
          {entry.server ? <Badge title="MCP server">{entry.server}</Badge> : null}
          {entry.removed ? (
            <Badge tone="coral" title="Removed from the catalog">
              Removed
            </Badge>
          ) : null}
        </div>
      </th>
      <Metric>{formatCount(entry.stats.invoked)}</Metric>
      <Metric>{formatCount(entry.stats.retrieved)}</Metric>
      <Metric>{tokens === null ? "–" : `~${formatCount(tokens)}`}</Metric>
      <td className="px-4 py-3 text-right">
        {entry.lastSeen ? (
          <span
            className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap font-mono text-[11px] text-cream-dim"
            title={new Date(entry.lastSeen).toLocaleString()}
          >
            <Clock3 className="size-3 text-warm-muted" aria-hidden />
            {formatLastSeen(entry.lastSeen, now)}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-warm-muted">Never</span>
        )}
      </td>
      <td className="w-8 pr-4 text-right">
        <ChevronRight
          className="inline size-3.5 text-warm-muted/50"
          strokeWidth={1.8}
          aria-hidden
        />
      </td>
    </tr>
  );
}

function formatLastSeen(ts: number, now: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(new Date(now).getFullYear() === d.getFullYear() ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Metric({ children }: { children: ReactNode }) {
  return (
    <td className="px-4 py-3 text-right font-mono text-[12px] tabular text-cream-dim">
      {children}
    </td>
  );
}

function Badge({
  children,
  title,
  tone = "muted",
}: {
  children: ReactNode;
  title: string;
  tone?: "muted" | "coral";
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide",
        tone === "coral"
          ? "border-coral/30 bg-coral/[0.07] text-coral"
          : "border-forest-300 bg-base-deep/40 text-warm-muted",
      )}
    >
      {children}
    </span>
  );
}

function Toolbar({
  noun,
  view,
  available,
  onChange,
}: {
  noun: string;
  view: CatalogView;
  available: readonly string[];
  onChange: (patch: Partial<CatalogView>, replace?: boolean) => void;
}) {
  const [draft, setDraft] = useState(view.query);
  const settled = useRef(view.query);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Adopt changes from elsewhere: Back, or "Clear filters".
  useEffect(() => {
    if (view.query === settled.current) return;
    settled.current = view.query;
    setDraft(view.query);
  }, [view.query]);

  useEffect(() => {
    if (draft === settled.current) return;
    const timer = setTimeout(() => {
      settled.current = draft;
      onChangeRef.current({ query: draft, page: 1 }, true);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <div className="relative min-w-[13rem] flex-1 sm:max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-warm-muted/70"
          strokeWidth={1.8}
          aria-hidden
        />
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Filter by name or description"
          aria-label={`Filter ${noun}s by name or description`}
          className="h-8 w-full rounded-lg border border-forest-300 bg-base-deep/70 pr-7 pl-8 font-mono text-xs text-cream placeholder:text-warm-muted/60 focus:border-coral focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {draft !== "" ? (
          <button
            type="button"
            onClick={() => {
              settled.current = "";
              setDraft("");
              onChange({ query: "", page: 1 }, true);
            }}
            aria-label="Clear filter"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-warm-muted hover:text-cream"
          >
            <X className="size-3.5" strokeWidth={1.8} aria-hidden />
          </button>
        ) : null}
      </div>
      <select
        aria-label="Filter by source"
        value={view.provenance}
        onChange={(e) =>
          onChange({ provenance: e.target.value as CatalogView["provenance"], page: 1 })
        }
        className="h-8 w-40 shrink-0 rounded-lg border border-forest-300 bg-base-deep/70 px-2.5 text-xs text-cream-dim focus:border-coral focus:outline-none"
      >
        <option value="all">All sources</option>
        {CATALOG_PROVENANCE_ORDER.filter((p) => available.includes(p) || view.provenance === p).map(
          (p) => (
            <option key={p} value={p} title={CATALOG_PROVENANCE[p].hint}>
              {CATALOG_PROVENANCE[p].label}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

function Footer({
  page,
  pageCount,
  pageSize,
  offset,
  rowCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  offset: number;
  rowCount: number;
  total: number;
  onChange: (patch: Partial<CatalogView>) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-forest-300/45 pt-3">
      <label className="flex shrink-0 items-center gap-2 text-[11px] text-warm-muted">
        <span>Rows</span>
        <select
          aria-label="Rows per page"
          value={pageSize}
          onChange={(e) => onChange({ pageSize: Number(e.target.value), page: 1 })}
          className="h-7 w-[4.25rem] rounded-md border border-forest-300 bg-base-deep/70 px-2 text-[11px] text-cream-dim focus:border-coral focus:outline-none"
        >
          {CATALOG_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] text-warm-muted">
          {catalogRangeLabel(offset, rowCount, total)}
        </span>
        {pageCount > 1 ? (
          <nav aria-label="Catalog pages" className="flex items-center gap-1.5">
            <PageButton
              label="Previous page"
              disabled={page <= 1}
              onClick={() => onChange({ page: page - 1 })}
            >
              <ChevronLeft className="size-3.5" strokeWidth={1.8} aria-hidden />
            </PageButton>
            <span aria-current="page" className="px-1 font-mono text-[11px] tabular text-cream-dim">
              {page} / {pageCount}
            </span>
            <PageButton
              label="Next page"
              disabled={page >= pageCount}
              onClick={() => onChange({ page: page + 1 })}
            >
              <ChevronRight className="size-3.5" strokeWidth={1.8} aria-hidden />
            </PageButton>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-md border border-forest-300 text-warm-muted transition-colors hover:border-cream/40 hover:text-cream disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}
