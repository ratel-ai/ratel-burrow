import {
  type CatalogEntry,
  estimateTokens,
  formatCount,
  formatMs,
  relativeTime,
} from "@ratel-ai/burrow-model";
import { useMemo, useState } from "react";
import {
  Card,
  Code,
  Drawer,
  Empty,
  Field,
  KindDot,
  PageHeader,
  Pill,
  Pre,
  SearchInput,
  Tabs,
} from "../components/ui";
import { useBurrow } from "../lib/data";
import { href, navigate, useRoute } from "../lib/route";

type Tab = "tools" | "skills" | "facts";
type SortKey = "name" | "retrieved" | "invoked" | "latency" | "lastSeen";

export function CatalogScreen() {
  const { catalog } = useBurrow();
  const { params } = useRoute();
  const tab = (
    ["tools", "skills", "facts"].includes(params.get("tab") ?? "") ? params.get("tab") : "tools"
  ) as Tab;
  const selectedId = params.get("id");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>("invoked");
  const entries = catalog[tab];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.filter((e) =>
          [e.id, e.name, e.description, e.searchableDescription, e.server ?? "", ...e.tags]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : entries;
    const key = (e: CatalogEntry): number | string => {
      switch (sort) {
        case "name":
          return e.name.toLowerCase();
        case "retrieved":
          return -e.stats.retrieved;
        case "invoked":
          return -e.stats.invoked;
        case "latency":
          return -(e.stats.avgLatencyMs ?? -1);
        case "lastSeen":
          return -(e.lastSeen ?? 0);
      }
    };
    return [...filtered].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : a.id < b.id ? -1 : 1;
    });
  }, [entries, query, sort]);

  const selected = selectedId ? (entries.find((e) => e.id === selectedId) ?? null) : null;
  const now = Date.now();
  const singular = tab.slice(0, -1);

  return (
    <div>
      <PageHeader eyebrow="Catalog" title="Tools, skills and facts">
        Everything Ratel can rank for your agent, with the exact text it searches over and how each
        entry has been used.
      </PageHeader>

      {!catalog.hasDefinitions && entries.length > 0 ? (
        <div className="mb-4 rounded-lg border border-amber/40 bg-amber/5 px-4 py-2.5 text-xs text-cream-dim">
          Only ids are known: descriptions and schemas were not recorded. Turn on catalog
          definitions with <Code>burrowConfig()</Code> (it sets{" "}
          <Code>events.experimentalCatalogDefinitions</Code>) or save{" "}
          <Code>catalog.snapshot()</Code> to <Code>.ratel/burrow/catalog-snapshot.json</Code>.
        </div>
      ) : null}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Tabs<Tab>
            value={tab}
            onChange={(t) => navigate("catalog", { tab: t })}
            options={(["tools", "skills", "facts"] as const).map((t) => ({
              value: t,
              label: (
                <>
                  <KindDot kind={t.slice(0, -1) as "tool" | "skill" | "fact"} />
                  <span className="capitalize">{t}</span>
                  <span className="font-mono text-xs text-warm-muted">{catalog[t].length}</span>
                </>
              ),
            }))}
          />
          <SearchInput value={query} onChange={setQuery} placeholder={`Filter ${tab}…`} />
        </div>

        {entries.length === 0 ? (
          <Empty title={`No ${tab} seen yet`}>
            {tab === "facts"
              ? "Facts appear once a FactCatalog emits definitions, searches or injections."
              : `${singular[0]?.toUpperCase()}${singular.slice(1)}s appear once Ratel registers or ranks them.`}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-forest-300/70">
                  <Th onClick={() => setSort("name")} active={sort === "name"}>
                    Name
                  </Th>
                  <Th onClick={() => setSort("retrieved")} active={sort === "retrieved"} right>
                    Retrieved
                  </Th>
                  <Th onClick={() => setSort("invoked")} active={sort === "invoked"} right>
                    {tab === "facts" ? "Injected" : "Calls"}
                  </Th>
                  <Th right>Errors</Th>
                  <Th onClick={() => setSort("latency")} active={sort === "latency"} right>
                    Avg latency
                  </Th>
                  <Th onClick={() => setSort("lastSeen")} active={sort === "lastSeen"} right>
                    Last seen
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-b border-forest-300/40 hover:bg-forest-300/25"
                    onClick={() => navigate("catalog", { tab, id: e.id })}
                  >
                    <td className="max-w-md py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <KindDot kind={e.kind} />
                        <span className="truncate font-mono text-[13px] text-cream">{e.name}</span>
                        {e.server ? <Pill>{e.server}</Pill> : null}
                        {e.removed ? <Pill tone="coral">removed</Pill> : null}
                        {e.searchableOverridden ? (
                          <Pill tone="amber" title="Search ranks an override, not the description">
                            override
                          </Pill>
                        ) : null}
                      </div>
                      {e.description ? (
                        <div className="mt-0.5 truncate pl-4 text-xs text-warm-muted">
                          {e.description}
                        </div>
                      ) : null}
                    </td>
                    <Td>{formatCount(e.stats.retrieved)}</Td>
                    <Td>{formatCount(e.stats.invoked)}</Td>
                    <Td>
                      {e.stats.errors ? <span className="text-coral">{e.stats.errors}</span> : "0"}
                    </Td>
                    <Td>{formatMs(e.stats.avgLatencyMs)}</Td>
                    <Td>{relativeTime(e.lastSeen, now)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-warm-muted">Nothing matches “{query}”.</p>
            ) : null}
          </div>
        )}
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => navigate("catalog", { tab })}
        title={
          selected ? (
            <div>
              <div className="eyebrow flex items-center gap-2">
                <KindDot kind={selected.kind} /> {selected.kind}
              </div>
              <div className="mt-1 break-all font-mono text-base text-cream">{selected.name}</div>
              {selected.name !== selected.id ? (
                <div className="font-mono text-xs text-warm-muted">{selected.id}</div>
              ) : null}
            </div>
          ) : null
        }
      >
        {selected ? <EntryDetail entry={selected} /> : null}
      </Drawer>
    </div>
  );
}

function EntryDetail({ entry }: { entry: CatalogEntry }) {
  const now = Date.now();
  const tokens = estimateTokens(
    `${entry.name}\n${entry.description}\n${JSON.stringify(entry.inputSchema ?? {})}`,
  );
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Retrieved" value={formatCount(entry.stats.retrieved)} />
        <Stat
          label={entry.kind === "fact" ? "Injected" : "Calls"}
          value={formatCount(entry.stats.invoked)}
        />
        <Stat label="Errors" value={String(entry.stats.errors)} />
        <Stat label="Avg latency" value={formatMs(entry.stats.avgLatencyMs)} />
        <Stat label="p95 latency" value={formatMs(entry.stats.p95LatencyMs)} />
        <Stat label="Last seen" value={relativeTime(entry.lastSeen, now)} />
      </div>
      {!entry.defined ? (
        <p className="text-xs text-warm-muted">Definition not recorded: only the id is known.</p>
      ) : (
        <>
          <Field label="Description (what the model sees)">
            {entry.description || <em className="text-warm-muted">empty</em>}
          </Field>
          <Field label="Searchable text (what Ratel ranks)">
            <div className="flex flex-wrap items-center gap-2">
              {entry.searchableOverridden ? (
                <Pill tone="amber">override</Pill>
              ) : (
                <Pill>derived</Pill>
              )}
              <span className="text-xs text-warm-muted">
                ~{tokens} tokens in context when exposed
              </span>
            </div>
            <div className="mt-2">
              <Pre value={entry.searchableDescription || "(empty)"} />
            </div>
          </Field>
          {entry.tags.length ? (
            <Field label="Tags">
              <div className="flex flex-wrap gap-1.5">
                {entry.tags.map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
              </div>
            </Field>
          ) : null}
          {entry.kind === "tool" ? (
            <>
              <Field label="Input schema">
                <Pre value={entry.inputSchema ?? {}} />
              </Field>
              <Field label="Output schema">
                <Pre value={entry.outputSchema ?? {}} />
              </Field>
            </>
          ) : null}
          {entry.contentHash ? (
            <Field label="Content hash">
              <span className="break-all font-mono text-xs text-warm-muted">
                {entry.contentHash}
              </span>
            </Field>
          ) : null}
        </>
      )}
      {entry.kind === "tool" ? (
        <a
          className="inline-block text-xs text-green hover:underline"
          href={href("inspector", { tool: entry.id })}
        >
          See searches that called this tool →
        </a>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-forest-300/60 bg-base-deep/30 px-3 py-2">
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-cream">{value}</div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  right,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  right?: boolean;
}) {
  return (
    <th className={`eyebrow py-2 pr-4 font-normal ${right ? "text-right" : ""}`}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`uppercase tracking-[0.06em] ${active ? "text-cream" : "hover:text-cream"}`}
        >
          {children}
          {active ? " ↓" : ""}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2.5 pr-4 text-right font-mono text-xs text-cream-dim">{children}</td>;
}
