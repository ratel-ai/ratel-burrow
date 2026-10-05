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
