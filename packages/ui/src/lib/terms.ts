/**
 * One label and one hint per metric, used on every page so the same number
 * always has the same name (ADR 0006).
 */
export const TERMS = {
  firstResult: {
    label: "First result right",
    hint: "Calls where the tool the agent ran was Ratel's first result.",
  },
  inResults: {
    label: "In results",
    hint: "Calls where the tool the agent ran was anywhere in Ratel's results.",
  },
  missed: {
    label: "Missed by search",
    hint: "Calls where the agent ran a tool the search before it did not return.",
  },
  failed: { label: "Failed calls", hint: "Calls that returned an error." },
  relevance: {
    label: "Relevance",
    hint: "How close a result scored to the best one in that search (the top result is 100%).",
  },
  patterns: {
    label: "Patterns learned",
    hint: "Groups of similar requests, each remembered with the tools that answered it.",
  },
} as const;

/** Where a search came from (the trace's `origin`), in plain words. */
export const ORIGINS = {
  agent: {
    label: "Agent",
    hint: "The model wrote this query and called Ratel's search tool.",
  },
  direct: {
    label: "Your code",
    hint: "Your code called search() directly with this query.",
  },
  baseline: {
    label: "Observed",
    hint: "Ratel was only watching: the agent picked from its full tool list, not Ratel's results. Not counted in Ratel's rates.",
  },
} as const;
