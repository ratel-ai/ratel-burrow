import { type IntentGraphDocument, modelLabel, relativeTime } from "@ratel-ai/burrow-model";

/** Provenance of the graph file, beside the page title (Ratel Cloud's GraphMeta, minus server-only fields). */
function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-[10px] uppercase tracking-wide text-warm-muted">{label}</dt>
      <dd className="font-mono text-xs text-cream" title={title}>
        {value}
      </dd>
    </div>
  );
}

export function GraphMeta({ doc, file }: { doc: IntentGraphDocument; file: string }) {
  return (
    <dl className="flex min-w-56 flex-col gap-1">
      <Row label="File" value={file} />
      <Row
        label="Built from"
        value={relativeTime(doc.built_from_ts)}
        title={new Date(doc.built_from_ts).toISOString()}
      />
      <Row label="Revision" value={`rev ${doc.rev ?? 0}`} />
      <Row label="Model" value={modelLabel(doc.model ?? null)} title={doc.model} />
      <Row label="Schema" value={`v${doc.v}`} />
    </dl>
  );
}

/** What has gone wrong, one sentence each (Ratel Cloud's GraphWarnings). Nothing when all is well. */
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
