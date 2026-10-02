import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Small single-series SVG charts in the dataviz house style: thin marks,
 * 4px rounded data-ends on a shared baseline, hairline recessive grid, a
 * hover tooltip on every mark. Text uses text colors, never the series color.
 */

export interface Point {
  /** Bucket start (ms). */
  x: number;
  y: number | null;
  /** Extra tooltip lines. */
  detail?: string[];
}

const PAD = { top: 12, right: 12, bottom: 22, left: 40 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function timeLabel(ts: number, span: number): string {
  const d = new Date(ts);
  if (span <= 2 * 86_400_000)
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ChartProps {
  points: Point[];
  height?: number;
  color: string;
  format: (y: number) => string;
  /** Fixed y-domain max (e.g. 1 for ratios); otherwise a nice max over the data. */
  yMax?: number;
  label: string;
  kind?: "columns" | "line";
}

export function TimeChart({
  points,
  height = 160,
  color,
  format,
  yMax,
  label,
  kind = "columns",
}: ChartProps) {
  const { ref, width } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const valid = points.filter((p) => p.y !== null) as (Point & { y: number })[];
  const max = yMax ?? niceMax(Math.max(0, ...valid.map((p) => p.y)));
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const n = points.length;
  const slot = n > 0 ? innerW / n : 0;
  const barW = Math.max(2, Math.min(24, slot * 0.6));
  const xAt = (i: number) => PAD.left + slot * i + slot / 2;
  const yAt = (v: number) => PAD.top + innerH - (Math.min(v, max) / max) * innerH;
  const first = points[0]?.x ?? 0;
  const span = (points.at(-1)?.x ?? first) - first;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 70))));

  let tooltip: ReactNode = null;
  if (hover !== null && points[hover]) {
    const p = points[hover];
    tooltip = (
      <div
        role="tooltip"
        className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-forest-300 bg-forest-600 px-2.5 py-1.5 text-xs shadow-xl"
        style={{
          left: Math.min(Math.max(0, xAt(hover) + 10), Math.max(0, width - 180)),
          top: 4,
        }}
      >
        <div className="text-warm-muted">{new Date(p.x).toLocaleString()}</div>
        <div className="font-mono text-cream">{p.y === null ? "no data" : format(p.y)}</div>
        {p.detail?.map((d) => (
          <div key={d} className="text-cream-dim">
            {d}
          </div>
        ))}
      </div>
    );
  }

  const linePath = valid.length
    ? points
        .map((p, i) => (p.y === null ? null : `${xAt(i)},${yAt(p.y)}`))
        .filter(Boolean)
        .map((pt, i) => `${i === 0 ? "M" : "L"}${pt}`)
        .join(" ")
    : "";

  return (
    <div ref={ref} className="relative">
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={yAt(max * f)}
                y2={yAt(max * f)}
                stroke="var(--color-forest-300)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={yAt(max * f) + 3}
                textAnchor="end"
                className="fill-warm-muted font-mono text-[10px]"
              >
                {format(max * f)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text
                key={p.x}
                x={xAt(i)}
                y={height - 6}
                textAnchor="middle"
                className="fill-warm-muted font-mono text-[10px]"
              >
                {timeLabel(p.x, span)}
              </text>
            ) : null,
          )}
          {kind === "columns"
            ? points.map((p, i) => {
                if (p.y === null || p.y <= 0) return null;
                const top = yAt(p.y);
                const h = PAD.top + innerH - top;
                const r = Math.min(4, barW / 2, h);
                const x0 = xAt(i) - barW / 2;
                const base = PAD.top + innerH;
                return (
                  <path
                    key={p.x}
                    d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${base} Z`}
                    fill={color}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                );
              })
            : null}
          {kind === "line" && linePath ? (
            <>
              <path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {points.map((p, i) =>
                p.y === null ? null : (
                  <circle
                    key={p.x}
                    cx={xAt(i)}
                    cy={yAt(p.y)}
                    r={hover === i ? 5 : 3.5}
                    fill={color}
                    stroke="var(--color-forest-600)"
                    strokeWidth={2}
                  />
                ),
              )}
            </>
          ) : null}
          {hover !== null ? (
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--color-cream-dim)"
              strokeOpacity={0.25}
            />
          ) : null}
          {points.map((p, i) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: hover only drives the tooltip; values are also on the axis.
            <rect
              key={p.x}
              x={PAD.left + slot * i}
              y={PAD.top}
              width={slot}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {tooltip}
    </div>
  );
}

/** Horizontal score bar for search hits (single hue, value labelled in text color). */
export function ScoreBar({ ratio, color }: { ratio: number; color: string }) {
  const pct = Math.max(2, Math.min(100, ratio * 100));
  return (
    <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-forest-300/50" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
