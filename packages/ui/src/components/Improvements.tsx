import {
  formatPercent,
  type Improvement,
  type ImprovementExample,
  plural,
} from "@ratel-ai/burrow-model";
import {
  ArrowDownWideNarrow,
  ChevronRight,
  CircleOff,
  Lightbulb,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { href } from "../lib/route";
import { Card, Code, cx } from "./ui";

const ICON = {
  missed: SearchX,
  buried: ArrowDownWideNarrow,
  empty_searches: CircleOff,
  failing: TriangleAlert,
  never_retrieved: CircleOff,
};
const TONE = {
  missed: "text-coral",
  buried: "text-amber",
  empty_searches: "text-amber",
  failing: "text-coral",
  never_retrieved: "text-warm-muted",
};

type Kind = Improvement["kind"];

/** What to change, said once per suggestion. */
const FIX: Record<Kind, ReactNode> = {
  missed: (
    <>
      Their searchable descriptions don't match how your agent asks. Add the words its queries use,
      with <Code>experimentalSearchableDescription</Code>.
    </>
  ),
  buried:
    "Make their searchable descriptions more specific, or turn on adaptive ranking so they're promoted for asks like these.",
  empty_searches:
    "The agent asked for something no entry matches: a missing capability, or one registered after the search ran.",
  failing: "Not a ranking problem, but each failure costs the agent a turn.",
  never_retrieved:
    "Remove them if the agent doesn't need them, or rewrite their searchable descriptions in the words your agent uses.",
};

/**
 * Patterns in this project's trace that point at a concrete fix: one row per
 * suggestion, opening to the tools and example queries behind it.
 */
export function Improvements({
  id,
  items,
  searches,
  className,
}: {
  id?: string;
  items: readonly Improvement[];
  searches: number;
  className?: string;
}) {
  const [open, setOpen] = useState<Kind | null>(null);
  if (searches === 0) return null;
  const groups: { kind: Kind; items: Improvement[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.kind === item.kind) last.items.push(item);
    else groups.push({ kind: item.kind, items: [item] });
  }
  return (
    <Card id={id} title="What to improve" className={className}>
      {groups.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-cream-dim">
          <Lightbulb className="size-4 text-green" strokeWidth={1.7} aria-hidden />
          Nothing stands out.
        </p>
      ) : (
        <ul className="divide-y divide-forest-300/50">
          {groups.map((group) => (
            <Group
              key={group.kind}
              kind={group.kind}
              items={group.items}
              open={open === group.kind}
              onToggle={() => setOpen((k) => (k === group.kind ? null : group.kind))}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function Group({
  kind,
  items,
  open,
  onToggle,
}: {
  kind: Kind;
  items: Improvement[];
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = ICON[kind];
  const first = items[0];
  if (!first) return null;
  const { title, count } = summarize(kind, items);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-lg py-3 text-left transition-colors hover:bg-forest-300/15"
      >
        <Icon className={cx("mt-0.5 size-4 shrink-0", TONE[kind])} strokeWidth={1.7} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-cream">{title}</p>
        </div>
        <span className="mt-0.5 shrink-0 font-mono text-xs text-warm-muted tabular">{count}</span>
        <ChevronRight
          className={cx(
            "mt-0.5 size-4 shrink-0 text-warm-muted transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        />
      </button>
      {open ? <p className="mb-2 ml-7 text-xs leading-5 text-warm-muted">{FIX[kind]}</p> : null}
      {open ? (
        <ul className="mb-3 ml-7 divide-y divide-forest-300/40 rounded-lg border border-forest-300/50 bg-base-deep/30 px-3">
          {items.map((item) => (
            <Row key={keyOf(item)} item={item} />
          ))}
        </ul>
      ) : null}
      {open && kind !== "empty_searches" ? (
        <a
          href={href("catalog", { tab: "tools" })}
          className="mb-3 ml-7 inline-block text-xs text-green hover:underline"
        >
          Open the tool catalog →
        </a>
      ) : null}
      {open && kind === "empty_searches" ? (
        <a
          href={href("inspector", { filter: "problems" })}
          className="mb-3 ml-7 inline-block text-xs text-green hover:underline"
        >
          Open them in Searches →
        </a>
      ) : null}
    </li>
  );
}

/** Tools, skills, or both: the noun a group's headline counts. */
function noun(items: Improvement[]): string {
  const caps = new Set(items.map((i) => ("capability" in i ? i.capability : "tool")));
  return caps.size === 1 ? ([...caps][0] ?? "tool") : "entry";
}

function summarize(kind: Kind, items: Improvement[]): { title: string; count: string } {
  const n = noun(items);
  const many = n === "entry" ? "entries" : `${n}s`;
  const sum = (f: (i: Improvement) => number) => items.reduce((t, i) => t + f(i), 0);
  switch (kind) {
    case "missed":
      return {
        title: `${plural(items.length, n, many)} called after a search that didn't return ${items.length === 1 ? "it" : "them"}`,
        count: plural(
          sum((i) => (i.kind === "missed" ? i.missed : 0)),
          "call",
        ),
      };
    case "buried":
      return {
        title: `${plural(items.length, n, many)} usually ranked below the top 3`,
        count: plural(
          sum((i) => (i.kind === "buried" ? i.low : 0)),
          "call",
        ),
      };
    case "empty_searches": {
      const c = sum((i) => (i.kind === "empty_searches" ? i.count : 0));
      return { title: `${plural(c, "search", "searches")} returned nothing`, count: "" };
    }
    case "failing":
      return {
        title: `${plural(items.length, n, many)} failing often`,
        count: plural(
          sum((i) => (i.kind === "failing" ? i.errors : 0)),
          "failure",
        ),
      };
    case "never_retrieved": {
      const c = sum((i) => (i.kind === "never_retrieved" ? i.ids.length : 0));
      return { title: `${plural(c, n, many)} never returned by any search`, count: "" };
    }
  }
}

function keyOf(item: Improvement): string {
  return "id" in item
    ? `${item.kind}:${item.capability}:${item.id}`
    : `${item.kind}:${"capability" in item ? item.capability : ""}`;
}

function Row({ item }: { item: Improvement }) {
  const { title, examples, chips } = describe(item);
  return (
    <li className="py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-cream-dim">{title}</p>
        {examples?.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {examples.map((e) => (
              <li key={e.searchKey} className="min-w-0 max-w-full">
                <a
                  href={href("inspector", { session: e.sessionId, search: e.searchKey })}
                  title="Open this search in the inspector"
                  className="block max-w-[28rem] truncate rounded-md border border-forest-300 bg-base-deep/40 px-2 py-0.5 text-[11px] text-cream-dim hover:border-green/50 hover:text-cream"
                >
                  “{e.query || "empty query"}”
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {chips}
      </div>
    </li>
  );
}

function entryLink(capability: string, id: string) {
  return (
    <a
      href={href("catalog", { tab: `${capability}s`, id })}
      className="font-mono text-green hover:underline"
      title="Open in the catalog"
    >
      {id}
    </a>
  );
}

function describe(item: Improvement): {
  title: ReactNode;
  fix: ReactNode;
  examples?: ImprovementExample[];
  chips?: ReactNode;
} {
  switch (item.kind) {
    case "missed":
      return {
        title: (
          <>
            {entryLink(item.capability, item.id)} was called {item.missed} of {item.calls} times
            after a search that didn't return it.
          </>
        ),
        fix: (
          <>
            Its searchable description doesn't match how your agent asks for it. Add the words these
            queries use, with <Code>experimentalSearchableDescription</Code>.
          </>
        ),
        examples: item.examples,
      };
    case "buried":
      return {
        title: (
          <>
            {entryLink(item.capability, item.id)} usually ranks low: below the top 3 in {item.low}{" "}
            of {item.ranked} calls (median rank {item.medianRank}).
          </>
        ),
        fix: "Make its searchable description more specific, or turn on adaptive ranking so it's promoted for asks like these.",
        examples: item.examples,
      };
    case "empty_searches":
      return {
        title: `${item.count} of ${item.searches} searches (${formatPercent(item.count / item.searches)}) returned nothing.`,
        fix: "The agent asked for something no entry matches: a missing capability, or one registered after the search ran.",
        examples: item.examples,
      };
    case "failing":
      return {
        title: (
          <>
            {entryLink(item.capability, item.id)} failed {item.errors} of {item.calls} calls.
          </>
        ),
        fix: (
          <>
            Not a ranking problem, but each failure costs the agent a turn. Last error:{" "}
            <span className="font-mono text-cream-dim">{item.lastError}</span>
          </>
        ),
      };
    case "never_retrieved":
      return {
        title: `${plural(item.ids.length, item.capability)} never appeared in any of ${item.searches} searches.`,
        fix: "Remove them if the agent doesn't need them, or rewrite their searchable description in the words your agent uses.",
        chips: (
          <p className="mt-1.5 text-[11px] leading-5">
            {item.ids.slice(0, 12).map((id, i) => (
              <span key={id}>
                {i > 0 ? ", " : ""}
                {entryLink(item.capability, id)}
              </span>
            ))}
            {item.ids.length > 12 ? (
              <span className="text-warm-muted"> and {item.ids.length - 12} more</span>
            ) : null}
          </p>
        ),
      };
  }
}
