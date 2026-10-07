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
      <Row
        label="Built from"
        value={relativeTime(doc.built_from_ts)}
        title={new Date(doc.built_from_ts).toISOString()}
      />
      <Row label="Revision" value={`rev ${doc.rev ?? 0}`} />
      <Row label="Model" value={modelLabel(doc.model ?? null)} title={doc.model} />
      <Row label="Schema" value={`v${doc.v}`} />
      <Row label="File" value={file} />
    </dl>
  );
}

const WORSE_MIN_COMPARED = 30;
const WORSE_SHARE_WARNING = 0.2;

export interface BoostVerdict {
  better: number;
  worse: number;
  same: number;
  compared: number;
}

/**
 * The verdict, when the graph ranked the used tool lower often enough to warn:
 * Ratel Cloud's `buildBoostWarning` thresholds (`lib/intent-graph/setup.ts`).
 */
export function boostWarningVerdict(verdict: {
  better: number;
  worse: number;
  same: number;
}): BoostVerdict | null {
  const compared = verdict.better + verdict.worse + verdict.same;
  if (compared < WORSE_MIN_COMPARED || verdict.worse / compared <= WORSE_SHARE_WARNING) return null;
  return { ...verdict, compared };
}
