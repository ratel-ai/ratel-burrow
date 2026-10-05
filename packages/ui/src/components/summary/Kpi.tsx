import type { ReactNode } from "react";
import { cx } from "../ui";

/** One headline number with what it counts and, when known, how it moved. */
export function Kpi({
  label,
  value,
  sub,
  tone,
  trend,
  hint,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  tone: "green" | "amber" | "coral" | "muted";
  trend?: ReactNode;
  hint?: string;
}) {
  const dot = { green: "bg-green", amber: "bg-amber", coral: "bg-coral", muted: "bg-warm-muted" }[
    tone
  ];
  return (
    <div
      className="rounded-xl border border-forest-300/60 bg-forest-600/70 px-4 py-3.5"
      title={hint}
    >
      <div className="eyebrow flex items-center gap-2">
        <span className={cx("inline-block size-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="font-mono text-3xl text-cream tabular">{value}</span>
        {trend}
      </div>
      <div className="mt-0.5 text-xs text-warm-muted">{sub}</div>
    </div>
  );
}
