import {
  type CatalogEntry,
  type CatalogView,
  callOutcomes,
  catalogTableParams,
  firstResultRate,
  formatCount,
  formatPercent,
  needsAttention,
  outcomesByCapability,
  resolveCatalogView,
  summarizeOutcomes,
} from "@ratel-ai/burrow-model";
import {
  ArrowUpRight,
  BookOpen,
  Database,
  type LucideIcon,
  Parentheses,
  RadioTower,
  Target,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useMemo } from "react";
import { CatalogTable } from "../components/catalog/CatalogTable";
import { EntryModal } from "../components/catalog/EntryModal";
import { Code, cx } from "../components/ui";
import { useBurrow } from "../lib/data";
import { href, useRoute } from "../lib/route";
import { TERMS } from "../lib/terms";

type Kind = "tools" | "skills" | "facts";

const KINDS: Record<
  Kind,
  {
    title: string;
    noun: string;
    eyebrow: string;
    description: string;
    icon: LucideIcon;
    callsLabel: string;
  }
> = {
  skills: {
    title: "Skills",
    noun: "skill",
    eyebrow: "Instruction catalog",
    description: "Playbooks your agent retrieves.",
    icon: BookOpen,
    callsLabel: "Loads",
  },
  tools: {
    title: "Tools",
    noun: "tool",
    eyebrow: "Capability catalog",
    description: "Everything Ratel can rank.",
    icon: Wrench,
    callsLabel: "Calls",
  },
  facts: {
    title: "Facts",
    noun: "fact",
    eyebrow: "Knowledge catalog",
    description: "Knowledge your agent retrieves.",
    icon: Database,
    callsLabel: "Injected",
  },
};

export function CatalogScreen() {
  const { params } = useRoute();
  const { catalog } = useBurrow();
  const tab = params.get("tab");
  // With only tools, an index of one card is a click for nothing.
  const kinds = (["skills", "tools", "facts"] as const).filter((k) => catalog[k].length > 0);
  const single = kinds.length <= 1;
  if (tab === "tools" || tab === "skills" || tab === "facts")
    return <CatalogPage kind={tab} params={params} single={single} />;
  if (single) return <CatalogPage kind={kinds[0] ?? "tools"} params={params} single />;
  return <CatalogIndex kinds={kinds} />;
}

/** Ratel Cloud's catalog index: one card per catalog. */
function CatalogIndex({ kinds }: { kinds: readonly Kind[] }) {
  const { catalog } = useBurrow();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
      <header className="border-b border-forest-300 pb-5">
        <div className="eyebrow">Capabilities</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-cream">
          Catalogs
        </h1>
      </header>
      <section aria-label="Project catalogs" className="grid gap-3 md:grid-cols-3">
        {kinds.map((kind) => {
          const meta = KINDS[kind];
          const Icon = meta.icon;
          return (
            <a
              key={kind}
              href={href("catalog", { tab: kind })}
              aria-label={`Open ${meta.title} catalog`}
              className="group relative flex min-h-48 flex-col overflow-hidden rounded-2xl border border-forest-300 bg-forest-600/50 p-5 transition-[border-color,background-color,transform] duration-300 hover:-translate-y-0.5 hover:border-coral/35 hover:bg-forest-600/75"
            >
              <div
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-coral/0 to-transparent transition-colors group-hover:via-coral/70"
                aria-hidden
              />
              <div className="flex items-start justify-between gap-4">
                <span className="flex size-10 items-center justify-center rounded-xl border border-forest-300 bg-base-deep/55 text-coral transition-colors group-hover:border-coral/30 group-hover:bg-coral/10">
                  <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                </span>
                <ArrowUpRight
                  className="size-4 text-warm-muted/45 transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-cream"
                  aria-hidden
                />
              </div>
              <div className="mt-6">
                <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-warm-muted">
                  {meta.eyebrow}
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-cream">
                  {meta.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-warm-muted">{meta.description}</p>
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 border-t border-forest-300/60 pt-5">
                <span className="font-display text-4xl font-semibold leading-none tracking-tight text-cream tabular">
                  {formatCount(catalog[kind].length)}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-warm-muted">
                  seen
                </span>
              </div>
            </a>
          );
        })}
      </section>
    </div>
  );
}

function CatalogPage({
  kind,
  params,
  single,
}: {
  kind: Kind;
  params: URLSearchParams;
  /** The only catalog with entries: no "All catalogs" back link. */
  single: boolean;
}) {
  const { catalog, sessions } = useBurrow();
  const outcomeList = useMemo(() => callOutcomes(sessions), [sessions]);
  const health = useMemo(() => outcomesByCapability(outcomeList), [outcomeList]);
  const meta = KINDS[kind];
  const entries = catalog[kind];
  const view = resolveCatalogView(Object.fromEntries(params));
  const selectedId = params.get("id");
  const selected = selectedId ? (entries.find((e) => e.id === selectedId) ?? null) : null;

  const go = (next: CatalogView, extra: Record<string, string> = {}, replace = false) => {
    const target = href("catalog", { tab: kind, ...catalogTableParams(next), ...extra });
    if (replace) window.location.replace(target);
    else window.location.hash = target;
  };
  const update = (patch: Partial<CatalogView>, replace = false) => {
    const merged = { ...view, ...patch };
    go({ ...merged, offset: (merged.page - 1) * merged.pageSize }, {}, replace);
  };

  const totals = summarizeOutcomes(
    outcomeList.filter((o) => `${o.kind}s` === kind && entries.some((e) => e.id === o.id)),
  );
  const first = firstResultRate(totals);
  const attention = entries.filter((e) => needsAttention(health.get(`${e.kind}:${e.id}`))).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-5">
        {single ? null : (
          <a
            href={href("catalog")}
            className="inline-flex w-fit items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-warm-muted transition-colors hover:text-cream"
          >
            <span aria-hidden>←</span>
            All catalogs
          </a>
        )}
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="eyebrow">{meta.title.slice(0, -1)} catalog</div>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-cream">
              {meta.title}
            </h1>
          </div>
        </header>
      </div>

      <section
        aria-label={`${meta.title} totals`}
        className="grid gap-px overflow-hidden rounded-xl border border-forest-300 bg-forest-300 sm:grid-cols-2 lg:grid-cols-4"
      >
        <SummaryDatum icon={meta.icon} label={meta.title} value={formatCount(entries.length)} />
        <SummaryDatum
          icon={Parentheses}
          label={meta.callsLabel}
          value={formatCount(totals.calls)}
        />
        <SummaryDatum
          icon={Target}
          label={TERMS.firstResult.label}
          value={first === null ? "–" : formatPercent(first)}
        />
        <SummaryDatum
          icon={TriangleAlert}
          label="Need attention"
          value={formatCount(attention)}
          tone={attention ? "amber" : undefined}
          href={attention ? href("catalog", { tab: kind, attention: "1" }) : undefined}
        />
      </section>

      {!catalog.hasDefinitions && entries.length > 0 ? (
        <p className="rounded-lg border border-amber/40 bg-amber/5 px-4 py-2.5 text-xs text-cream-dim">
          Only ids are known: descriptions and schemas were not recorded. Turn on catalog
          definitions with <Code>burrowConfig()</Code> (it sets{" "}
          <Code>events.experimentalCatalogDefinitions</Code>) or save{" "}
          <Code>catalog.snapshot()</Code> to <Code>.ratel/burrow/catalog-snapshot.json</Code>.
        </p>
      ) : null}

      {entries.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-forest-300 bg-forest-600/20 px-6 py-10 text-center">
          <RadioTower className="mx-auto size-5 text-coral" strokeWidth={1.6} aria-hidden />
          <h2 className="mt-4 font-display text-lg font-semibold text-cream">
            No {meta.noun}s seen yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-warm-muted">
            {kind === "facts"
              ? "Facts appear once a FactCatalog emits definitions, searches or injections."
              : `${meta.title} appear once Ratel registers or ranks them.`}
          </p>
        </section>
      ) : (
        <CatalogTable
          noun={meta.noun}
          callsLabel={meta.callsLabel}
          entries={entries}
          view={view}
          health={health}
          onChange={update}
          onOpen={(entry: CatalogEntry) => go(view, { id: entry.id })}
        />
      )}

      {selected ? (
        <EntryModal
          entry={selected}
          outcomes={health.get(`${selected.kind}:${selected.id}`)}
          missedExamples={outcomeList
            .filter((o) => o.id === selected.id && o.outcome === "missed")
            .slice(0, 3)}
          onClose={() => go(view)}
        />
      ) : null}
    </div>
  );
}

function SummaryDatum({
  icon: Icon,
  label,
  value,
  tone,
  href: link,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "amber";
  href?: string;
}) {
  const body = (
    <>
      <Icon
        className={cx("size-4 shrink-0", tone ? "text-amber" : "text-warm-muted")}
        strokeWidth={1.6}
        aria-hidden
      />
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.09em] text-warm-muted">
          {label}
        </div>
        <div
          className={cx(
            "mt-1 font-display text-2xl font-semibold leading-none tabular",
            tone ? "text-amber" : "text-cream",
          )}
        >
          {value}
        </div>
      </div>
    </>
  );
  return link ? (
    <a
      href={link}
      className="flex min-h-20 items-center gap-3 bg-base-deep p-4 hover:bg-forest-600"
    >
      {body}
    </a>
  ) : (
    <div className="flex min-h-20 items-center gap-3 bg-base-deep p-4">{body}</div>
  );
}
