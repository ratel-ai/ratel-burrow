import { cx } from "../ui";

/** A small ↑/↓ chip: green when the change is good, coral when it is bad. */
export function TrendChip({ text, up, good }: { text: string; up: boolean; good: boolean }) {
  return (
    <span
      title="Against the window just before"
      className={cx(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular",
        good ? "bg-green/15 text-green" : "bg-coral/15 text-coral",
      )}
    >
      {up ? "↑" : "↓"} {text}
    </span>
  );
}

/** Change between two rates, in percentage points; null when either is unknown or equal. */
export function pointDelta(
  now: number | null,
  before: number | null,
): { text: string; up: boolean } | null {
  if (now === null || before === null) return null;
  const pts = Math.round((now - before) * 100);
  if (pts === 0) return null;
  return { text: `${Math.abs(pts)} pts`, up: pts > 0 };
}

/** Relative change between two counts; null when there is nothing to compare. */
export function relativeDelta(now: number, before: number): { text: string; up: boolean } | null {
  if (before <= 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return null;
  return { text: `${Math.abs(change)}%`, up: change > 0 };
}
