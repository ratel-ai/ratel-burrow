import { RANGES, type TimeRange } from "@ratel-ai/burrow-model";
import { CalendarRange } from "lucide-react";
import { useBurrow } from "../lib/data";
import { cx } from "./ui";

const RANGE_LABEL: Record<TimeRange, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  all: "All",
};

/** The time range a page reads, beside its title; windows end at the latest event. */
export function RangePicker({ className }: { className?: string }) {
  const { range, setRange, projects } = useBurrow();
  if (projects.length === 0) return null;
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      title="Time range, ending at the latest event"
      className={cx(
        "inline-flex items-center gap-0.5 rounded-lg border border-forest-300 bg-base-deep/60 p-0.5",
        className,
      )}
    >
      <CalendarRange
        className="mx-1.5 size-3.5 shrink-0 text-warm-muted"
        strokeWidth={1.7}
        aria-hidden
      />
      {RANGES.map((r) => (
        // biome-ignore lint/a11y/useSemanticElements: a segmented control
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={range === r}
          onClick={() => setRange(r)}
          className={cx(
            "rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
            range === r ? "bg-forest-300 text-cream" : "text-warm-muted hover:text-cream",
          )}
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}
