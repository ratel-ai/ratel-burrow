import {
  formatPercent,
  type Improvement,
  type ImprovementExample,
  plural,
} from "@ratel-ai/burrow-model";
import { ArrowDownWideNarrow, CircleOff, Lightbulb, SearchX, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { href } from "../lib/route";
import { Card, Code, cx } from "./ui";

const SHOWN = 4;

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

/** Patterns in this project's trace that point at a concrete fix, most actionable first. */
export function Improvements({
  items,
  searches,
  className,
}: {
  items: readonly Improvement[];
  searches: number;
  className?: string;
}) {
  const [all, setAll] = useState(false);
  if (searches === 0) return null;
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <Card
      title="What to improve"
      hint="Patterns in your trace, each with what to change. Read from the searches and calls above."
      className={className}
    >
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-cream-dim">
          <Lightbulb className="size-4 text-green" strokeWidth={1.7} aria-hidden />
          Nothing stands out: called tools were in the results, and no search came back empty.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-forest-300/50">
            {shown.map((item, i) => (
              <Row key={keyOf(item)} item={item} showFix={shown[i - 1]?.kind !== item.kind} />
            ))}
          </ul>
          {items.length > SHOWN ? (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="mt-2 text-xs text-green hover:underline"
            >
              {all ? "Show fewer" : `Show all ${items.length}`}
            </button>
          ) : null}
        </>
      )}
    </Card>
  );
}

function keyOf(item: Improvement): string {
  return "id" in item
    ? `${item.kind}:${item.capability}:${item.id}`
    : `${item.kind}:${"capability" in item ? item.capability : ""}`;
}

function Row({ item, showFix }: { item: Improvement; showFix: boolean }) {
  const Icon = ICON[item.kind];
  const { title, fix, examples, chips } = describe(item);
  return (
    <li className="flex gap-3 py-3">
      <Icon
        className={cx("mt-0.5 size-4 shrink-0", TONE[item.kind])}
        strokeWidth={1.7}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-cream">{title}</p>
        {showFix ? <p className="mt-0.5 text-xs leading-5 text-warm-muted">{fix}</p> : null}
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
