/** Warnings about the graph shown above the Learning page (Ratel Cloud's Boost warning). */
export function GraphWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <aside
      role="note"
      className="rounded-md border border-coral/40 bg-coral/[0.06] px-4 py-3 text-sm leading-6 text-cream-dim"
    >
      <ul className="flex flex-col gap-1.5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </aside>
  );
}

const WORSE_MIN_COMPARED = 30;
const WORSE_SHARE_WARNING = 0.2;

/** Ratel Cloud's `buildBoostWarning` (`lib/intent-graph/setup.ts`). */
export function buildBoostWarning(verdict: {
  better: number;
  worse: number;
  same: number;
}): string | null {
  const compared = verdict.better + verdict.worse + verdict.same;
  if (compared < WORSE_MIN_COMPARED || verdict.worse / compared <= WORSE_SHARE_WARNING) return null;
  return `On ${verdict.worse} of ${compared} compared searches this graph ranked the tool your agent used lower than it would have been. If this holds, stop ranking from it in your runtime: remove the call that enables adaptive ranking.`;
}
