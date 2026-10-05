/**
 * "What your agent asks for": each learned pattern as plain text, with the tools
 * and skills that answered it. The readable view of the intent graph.
 */
import type { IntentGraphDocument } from "./wire.js";

export interface LearnedAnswer {
  kind: "tool" | "skill";
  id: string;
  /** Confirmed calls for this pattern. */
  count: number;
  /** Share of all confirmed calls for this pattern. */
  share: number;
}

export interface LearnedAsk {
  id: string;
  label: string;
  /** Up to three other ways users asked it. */
  examples: string[];
  /** Up to three tools or skills, most confirmed first. */
  answers: LearnedAnswer[];
  /** Confirmed searches behind the pattern. */
  support: number;
  /** Share of `support` that came from offline seeding. */
  seededShare: number;
  lastTs: number | null;
}

const MAX_EXAMPLES = 3;
const MAX_ANSWERS = 3;

export function learnedAsks(doc: IntentGraphDocument, filter = ""): LearnedAsk[] {
  const needle = filter.trim().toLowerCase();
  const rows = doc.intents.map((intent): LearnedAsk => {
    const all: LearnedAnswer[] = [
      ...Object.entries(intent.tools).map(([id, count]) => ({ kind: "tool" as const, id, count })),
      ...Object.entries(intent.skills).map(([id, count]) => ({
        kind: "skill" as const,
        id,
        count,
      })),
    ].map((a) => ({ ...a, share: 0 }));
    const total = all.reduce((n, a) => n + a.count, 0);
    return {
      id: intent.id,
      label: intent.label,
      examples: intent.members.filter((m) => m !== intent.label).slice(0, MAX_EXAMPLES),
      answers: all
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
        .slice(0, MAX_ANSWERS)
        .map((a) => ({ ...a, share: total > 0 ? a.count / total : 0 })),
      support: intent.support,
      seededShare: intent.support > 0 ? (intent.seeded_support ?? 0) / intent.support : 0,
      lastTs: intent.last_ts ?? null,
    };
  });
  const byText = (ask: LearnedAsk, intent: IntentGraphDocument["intents"][number]) =>
    [ask.label, ...intent.members, ...Object.keys(intent.tools), ...Object.keys(intent.skills)]
      .join("\n")
      .toLowerCase()
      .includes(needle);
  return rows
    .filter((ask, i) => {
      const intent = doc.intents[i];
      return needle === "" || (intent !== undefined && byText(ask, intent));
    })
    .sort((a, b) => b.support - a.support || a.label.localeCompare(b.label));
}
