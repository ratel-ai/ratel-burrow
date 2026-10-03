import {
  formatSharePercent,
  formatTurnCount,
  MARK_ROWS,
  pixelRuns,
  SHAPE_PICTURE_LABEL,
  type ShapeMark,
  type StoryBeat,
  shapeStory,
  type TurnShapeKind,
  type TurnShapeView,
} from "@ratel-ai/burrow-model";

/**
 * The six shapes a turn can take, drawn rather than described, ported from
 * Ratel Cloud's `TurnShapes.tsx` and `TurnShapesLegend.tsx`. Cloud loops each
 * pictogram as a short story; Burrow draws the settled picture.
 */
const CREAM = "var(--color-cream)";
const DIM = "var(--color-cream-dim)";
const CORAL = "var(--color-coral)";
const MUTED = "var(--color-warm-muted)";
const MARK_PAINT: Record<ShapeMark, { fill: string; rest: number }> = {
  search: { fill: DIM, rest: 1 },
  tool: { fill: CREAM, rest: 0.92 },
  error: { fill: CORAL, rest: 1 },
  nothing: { fill: MUTED, rest: 0.7 },
  next: { fill: CREAM, rest: 0.92 },
};
const LINK_PAINT = { fill: MUTED, rest: 0.55 };
const U = 4;
const MARK = 5;
const LINK = 7;
const CANVAS_CELLS = MARK * 3 + LINK * 2;

const SHAPE_ORDER: Record<TurnShapeKind, number> = {
  direct: 0,
  detour: 1,
  dead_end: 2,
  retry: 3,
  blind: 4,
  repeat: 5,
};

export function TurnShapes({ shapes }: { shapes: readonly TurnShapeView[] }) {
  const sorted = [...shapes].sort(
    (a, b) => b.share - a.share || SHAPE_ORDER[a.shape] - SHAPE_ORDER[b.shape],
  );
  return (
    <section className="rounded-2xl border border-forest-300 bg-forest-600/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-cream">Turn shapes</h2>
        </div>
        <Legend />
      </div>
      <ul className="mt-3 xl:grid xl:grid-flow-col xl:grid-cols-2 xl:grid-rows-3 xl:gap-x-10">
        {sorted.map((shape) => (
          <li
            key={shape.shape}
            className="grid grid-cols-[minmax(0,16rem)_auto_minmax(0,1fr)_4.5rem] items-center gap-x-5 gap-y-2 border-t border-forest-300/50 py-3 first:border-t-0 xl:grid-cols-[minmax(0,1fr)_auto_4.5rem] xl:[&:nth-child(4)]:border-t-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-cream">{shape.label}</p>
              <p className="mt-0.5 text-xs leading-5 text-warm-muted">{shape.description}</p>
            </div>
            <Pictogram shape={shape.shape} />
            <div className="col-start-4 text-right xl:col-start-3">
              <p className="font-display text-xl font-semibold leading-none tabular-nums text-cream">
                {formatSharePercent(shape.share)}
              </p>
              <p className="mt-1 font-mono text-[10px] tabular-nums text-warm-muted">
                {formatTurnCount(shape.count)}
              </p>
            </div>
            <div className="col-[1/-1] h-[3px]" aria-hidden>
              <div
                className="h-full rounded-full bg-cream-dim/45"
                style={{
                  width: `${Math.max(0, Math.min(1, shape.share)) * 100}%`,
                  minWidth: shape.share > 0 ? 3 : 0,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function slotX(beat: StoryBeat): number {
  const markX = beat.slot * (MARK + LINK);
  return beat.part === "link" ? markX - LINK : markX;
}

function Pictogram({ shape }: { shape: TurnShapeKind }) {
  return (
    <svg
      role="img"
      aria-label={SHAPE_PICTURE_LABEL[shape]}
      viewBox={`0 0 ${CANVAS_CELLS * U} ${MARK * U}`}
      width={174}
      height={30}
      shapeRendering="crispEdges"
      className="block max-w-full"
    >
      {shapeStory(shape).map((beat) => {
        const paint = beat.mark ? MARK_PAINT[beat.mark] : LINK_PAINT;
        const x0 = slotX(beat);
        return (
          <g key={`${beat.part}-${beat.slot}-${beat.atMs}`} fill={paint.fill} opacity={paint.rest}>
            {beat.cells.map((cell) => (
              <rect
                key={`${cell.x}-${cell.y}`}
                x={(x0 + cell.x) * U}
                y={cell.y * U}
                width={cell.w * U}
                height={U}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

const LEGEND: { mark: ShapeMark; label: string }[] = [
  { mark: "search", label: "search" },
  { mark: "tool", label: "tool run" },
  { mark: "error", label: "error" },
  { mark: "nothing", label: "nothing run" },
];

function Legend() {
  const unit = 2;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Key">
      {LEGEND.map(({ mark, label }) => (
        <li key={mark} className="flex items-center gap-1.5">
          <svg
            viewBox={`0 0 ${MARK * unit} ${MARK * unit}`}
            width={MARK * unit}
            height={MARK * unit}
            shapeRendering="crispEdges"
            aria-hidden
          >
            <g fill={MARK_PAINT[mark].fill} opacity={MARK_PAINT[mark].rest}>
              {pixelRuns(MARK_ROWS[mark]).map((run) => (
                <rect
                  key={`${run.x}-${run.y}`}
                  x={run.x * unit}
                  y={run.y * unit}
                  width={run.w * unit}
                  height={unit}
                />
              ))}
            </g>
          </svg>
          <span className="eyebrow">{label}</span>
        </li>
      ))}
    </ul>
  );
}
