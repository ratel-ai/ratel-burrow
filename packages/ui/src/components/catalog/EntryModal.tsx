import {
  type CatalogEntry,
  definitionTokens,
  formatCount,
  formatMs,
  relativeTime,
} from "@ratel-ai/burrow-model";
import { ArrowUpRight, Bot, ChevronRight, Search, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { href } from "../../lib/route";
import { cx } from "../ui";

/** Cloud's centered modal shell: Escape and backdrop close, scrolls when tall. */
export function Modal({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pressedBackdrop = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click closes; Escape is the keyboard path
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on the document
    <div
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-base-deep/75 px-4 py-12 backdrop-blur-sm"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="w-full max-w-2xl space-y-4 rounded-2xl border border-forest-300 bg-forest-600 p-6 shadow-2xl outline-none"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * One catalog entry, as Cloud's tool modal shows it, plus the trace's usage.
 * Opened outside the catalog, `catalogHref` adds a quiet way there.
 */
export function EntryModal({
  entry,
  onClose,
  catalogHref,
}: {
  entry: CatalogEntry;
  onClose: () => void;
  catalogHref?: string;
}) {
  const tokens = definitionTokens(entry);
  const now = Date.now();
  return (
    <Modal label={`View ${entry.name}`} onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.11em] text-warm-muted">
            {entry.defined ? `Defined ${entry.kind}` : `Observed ${entry.kind}`}
          </div>
          <h3 className="mt-1 break-all font-display text-lg font-semibold text-cream">
            {entry.name}
          </h3>
          <p className="mt-1 text-xs leading-5 text-warm-muted">
            {entry.defined
              ? "Recorded by your Ratel SDK. Burrow is read-only; change it in your code."
              : "Only the id was seen in searches or calls. Turn on catalog definitions to see its text and schemas."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-warm-muted transition-colors hover:text-cream"
        >
          <X className="size-4" strokeWidth={1.8} />
        </button>
      </div>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-forest-300/70 bg-forest-300/70 text-xs">
        <Datum label={entry.kind === "fact" ? "Injected" : "Calls"}>
          {formatCount(entry.stats.invoked)}
        </Datum>
        <Datum label="Retrieved">{formatCount(entry.stats.retrieved)}</Datum>
        <Datum label="Failed">{formatCount(entry.stats.errors)}</Datum>
        <Datum label="Avg latency">{formatMs(entry.stats.avgLatencyMs)}</Datum>
        <Datum label="Tokens">{tokens === null ? "–" : `~${formatCount(tokens)}`}</Datum>
        <Datum label="Last seen">{relativeTime(entry.lastSeen, now)}</Datum>
      </dl>

      {entry.defined ? (
        <div className="space-y-3 text-xs text-warm-muted">
          <DescriptionPanel entry={entry} />
          {entry.tags.length > 0 ? (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wide text-warm-muted/70">
                Tags
              </div>
              <p className="mt-1 text-cream-dim">{entry.tags.join(", ")}</p>
            </div>
          ) : null}
          {entry.kind === "tool" ? (
            <>
              <SchemaField label="Input schema" schema={entry.inputSchema} />
              <SchemaField label="Output schema" schema={entry.outputSchema} />
            </>
          ) : null}
        </div>
      ) : null}

      {entry.kind === "tool" || catalogHref ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {entry.kind === "tool" ? (
            <a
              className="text-xs text-green hover:underline"
              href={href("inspector", { tool: entry.id })}
            >
              See searches that called this tool →
            </a>
          ) : (
            <span />
          )}
          {catalogHref ? (
            <a
              href={catalogHref}
              className="inline-flex items-center gap-1 text-xs text-warm-muted transition-colors hover:text-cream"
            >
              View in catalog
              <ArrowUpRight className="size-3.5" strokeWidth={1.8} aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function Datum({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-base-deep/60 px-3 py-2">
      <dt className="font-mono text-[9px] uppercase tracking-[0.09em] text-warm-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-cream tabular">{children}</dd>
    </div>
  );
}

/**
 * Cloud's description panel, read-only: one block when the searchable text is the
 * agent description, two the moment they differ.
 */
function DescriptionPanel({ entry }: { entry: CatalogEntry }) {
  const same = entry.searchableDescription.trim() === entry.description.trim();
  return (
    <section className="rounded-lg border border-forest-300/70 bg-forest/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Label
          label={same ? "Searchable and agent description" : "Searchable description"}
          hint={
            same
              ? "Same text used for both."
              : "What Ratel ranks against the query. The model never sees it."
          }
          icons={
            same ? (
              <>
                <RoleIcon of="searchable" />
                <RoleIcon of="agent" />
              </>
            ) : (
              <RoleIcon of="searchable" />
            )
          }
        />
        <span
          title={
            entry.searchableOverridden
              ? "Set with experimentalSearchableDescription in your code."
              : "Derived by the SDK from the description."
          }
          className="rounded-full border border-forest-300 bg-base-deep/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.09em] text-warm-muted"
        >
          {entry.searchableOverridden ? "Override" : "Runtime default"}
        </span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-cream-dim">
        {entry.searchableDescription || "—"}
      </p>
      {!same ? (
        <div className="mt-3 border-t border-forest-300/50 pt-3">
          <Label
            label="Agent description"
            hint="What the model reads when the entry is exposed."
            icons={<RoleIcon of="agent" />}
          />
          <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-cream-dim">
            {entry.description || "—"}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Label({ label, hint, icons }: { label: string; hint: string; icons: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5" title={hint}>
      {icons}
      <span className="font-mono text-[10px] uppercase tracking-wide text-warm-muted/80">
        {label}
      </span>
    </div>
  );
}

function RoleIcon({ of: role }: { of: "searchable" | "agent" }) {
  const Icon = role === "searchable" ? Search : Bot;
  return (
    <span
      title={role === "searchable" ? "Searchable description" : "Agent description"}
      className={cx(
        "inline-flex size-4 shrink-0 items-center justify-center rounded border",
        role === "searchable"
          ? "border-coral/30 bg-coral/[0.07] text-coral"
          : "border-green/30 bg-green/10 text-green",
      )}
    >
      <Icon className="size-2.5" strokeWidth={1.8} aria-hidden />
    </span>
  );
}

/** Collapsed by default, as in Cloud: a schema is reference material. */
function SchemaField({ label, schema }: { label: string; schema: unknown }) {
  const empty = schema === null || schema === undefined;
  return (
    <details className="group rounded-lg border border-forest-300/70 bg-base-deep/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-warm-muted/70 hover:text-cream-dim">
        <ChevronRight className="size-3 transition-transform group-open:rotate-90" aria-hidden />
        {label}
        <span className="ml-auto font-sans text-[10px] normal-case tracking-normal text-warm-muted/60">
          {empty ? "None" : "Show"}
        </span>
      </summary>
      <pre className="overflow-x-auto border-t border-forest-300/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-cream-dim">
        {empty ? "—" : JSON.stringify(schema, null, 2)}
      </pre>
    </details>
  );
}
