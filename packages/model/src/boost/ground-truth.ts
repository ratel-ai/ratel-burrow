/**
 * The selection shape the Boost panel scores, and the helpers it needs, ported
 * from Ratel Cloud's `lib/quality/ground-truth.ts` (only what Burrow uses).
 */

/** What decided the target of a turn: the invoked tool, or the reference arm's own list. */
export type EvidenceTier = "revealed" | "judged" | "reference";

/** One arm's ranked list for one search. */
export interface ArmRanking {
  arm: string;
  /** `serving` when this arm's list was the one handed to the agent. */
  role: "serving" | "shadow" | null;
  resultIds: readonly string[];
  resultScores?: readonly number[] | null;
}

/** Everything known about one search that was ranked by more than one arm. */
export interface EvaluableSelection {
  selectionId: string;
  occurredAt: Date;
  query: string | null;
  arms: readonly ArmRanking[];
  /** The tool the agent ran after this search, when telemetry named one. */
  invokedToolId: string | null;
  /** Where the invoked tool sat in an arm's list, when only a position was recorded (unused by Burrow). */
  invokedRank?: { arm: string; rank: number | null } | null;
}

/** 1-based position of `targetId` in a list, or null when absent. */
export function rankOf(resultIds: readonly string[], targetId: string): number | null {
  const index = resultIds.indexOf(targetId);
  return index === -1 ? null : index + 1;
}

/** The revealed target: the tool the agent invoked. */
export function revealedTarget(selection: EvaluableSelection): string | null {
  return selection.invokedToolId;
}

export type RevealedBias = "independent" | "self-selected" | "mixed";

/**
 * Whether the revealed target was independent of the arm being scored.
 * `self-selected`: this arm served the list the agent chose from, so its
 * containment is close to a tautology. `mixed`: it served some and shadowed others.
 */
export function revealedArmBias(
  selections: readonly EvaluableSelection[],
  arm: string,
): RevealedBias {
  let serving = 0;
  let shadow = 0;
  for (const selection of selections) {
    if (selection.invokedToolId === null) continue;
    const ranking = selection.arms.find((candidate) => candidate.arm === arm);
    if (!ranking) continue;
    if (ranking.role === "serving") serving += 1;
    else if (ranking.role === "shadow") shadow += 1;
  }
  if (serving > 0 && shadow > 0) return "mixed";
  return serving > 0 ? "self-selected" : "independent";
}

export const BIAS_NOTES: Record<RevealedBias, string> = {
  independent:
    "This arm shadowed these searches, so the tool the agent ran was chosen from someone else's list. The number is an honest read.",
  "self-selected":
    "This arm served these searches, so the agent could only run what this arm returned. Read its containment as close to a tautology, and compare arms on placement instead.",
  mixed:
    "This arm served some of these searches and shadowed others, so its containment sits between an honest read and a tautology.",
};
