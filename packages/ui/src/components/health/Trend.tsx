import type { ReactNode } from "react";
import { areaPath, gapSegments, smoothPath, toPoints } from "../../lib/chart";
import { cx } from "../ui";

/** Ported from Ratel Cloud's `components/dashboard/Sparkline.tsx` (Trend, TrendChip). */

export function TrendChip({
  up,
  good,
  label,
  title,
  size = "sm",
  children,
}: {
  up: boolean;
  good: boolean;
  label: string;
  title?: string;
  size?: "sm" | "md";
  children?: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md font-mono font-medium tabular-nums",
        size === "md"
          ? "gap-1 px-2 py-1 text-xs leading-none"
          : "gap-0.5 px-1.5 py-0.5 text-[11px]",
        good ? "bg-green/12 text-green" : "bg-coral/12 text-coral",
      )}
      title={title}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 9 9"
        fill="none"
        aria-hidden
        className={up ? "" : "rotate-180"}
      >
        <path
          d="M4.5 1.5v6M2 4l2.5-2.5L7 4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
      {children}
    </span>
  );
}

const TREND_W = 240;
type Point = [number, number];
interface TrendInk {
  strokeWidth: number;
  strokeOpacity: number;
  fillOpacity: number;
  dot: number;
  lone: number;
  halo: number;
}
const INK_STRONG: TrendInk = {
  strokeWidth: 2,
  strokeOpacity: 1,
  fillOpacity: 0.16,
  dot: 6,
  lone: 5,
  halo: 12,
};

/** A full-bleed sparkline over a domain; `null` days are gaps, a lone day is a dot. */
export function Trend({
  data,
  accent,
  domain,
  height = 36,
}: {
  data: readonly (number | null)[];
  accent: string;
  domain: { min: number; max: number } | null;
  height?: number;
}) {
  const ink = INK_STRONG;
  const measured = data.filter((v): v is number => v !== null);
  if (!domain || measured.length === 0) return <div style={{ height }} aria-hidden />;
  const span = Math.max(domain.max - domain.min, Number.EPSILON);
  const shifted = data.map((v) => (v === null ? 0 : Math.max(0, v - domain.min)));
  const all = toPoints(shifted, { width: TREND_W - 8, height: height - 4, padTop: 8, max: span });
  const runs = gapSegments(data);
  const last = runs.at(-1)?.at(-1);
  const at = (i: number): Point => all[i] ?? [0, 0];
  return (
    <svg
      viewBox={`0 0 ${TREND_W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden
      className="block"
      style={{ color: accent }}
    >
      {last !== undefined ? (
        <line
          x1={0}
          x2={TREND_W}
          y1={at(last)[1]}
          y2={at(last)[1]}
          stroke="currentColor"
          strokeOpacity={0.35}
          strokeWidth={1}
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {runs.map((run) =>
        run.length === 1 ? (
          <Dot key={run[0]} point={at(run[0] ?? 0)} opacity={0.7} size={ink.lone} />
        ) : (
          <g key={run[0]}>
            <path
              d={areaPath(run.map(at), height)}
              fill="currentColor"
              fillOpacity={ink.fillOpacity}
              stroke="none"
            />
            <path
              d={smoothPath(run.map(at))}
              fill="none"
              stroke="currentColor"
              strokeOpacity={ink.strokeOpacity}
              strokeWidth={ink.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ),
      )}
      {last !== undefined ? (
        <>
          <Dot point={at(last)} opacity={0.22} size={ink.halo} />
          <Dot point={at(last)} opacity={1} size={ink.dot} />
        </>
      ) : null}
    </svg>
  );
}

function Dot({ point, opacity, size }: { point: Point; opacity: number; size: number }) {
  return (
    <path
      d={`M${point[0]},${point[1]}h0.01`}
      stroke="currentColor"
      strokeOpacity={opacity}
      strokeWidth={size}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}
