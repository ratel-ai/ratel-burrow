/**
 * Relevance: each hit's share of the top score in its own search, clamped to
 * 0..1 (the top hit is 1). Ratel Cloud's Playground uses the same measure; the
 * trace records only raw scores, so this is exact from it (ADR 0006).
 */
export function relevanceOf(hits: readonly { score: number }[]): number[] {
  const top = hits.reduce((max, h) => Math.max(max, h.score), Number.NEGATIVE_INFINITY);
  return hits.map((h) => (top > 0 ? Math.max(0, Math.min(1, h.score / top)) : 0));
}
