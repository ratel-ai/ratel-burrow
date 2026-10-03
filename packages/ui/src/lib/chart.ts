/**
 * Pure SVG chart math, ported from Ratel Cloud's `lib/chart.ts` (same
 * monotone-cubic Fritsch–Carlson curve; it never overshoots the data).
 */

const round = (n: number) => Math.round(n * 100) / 100;

/** SVG path (`M…C…`) of a smooth monotone curve through `pts` (x ascending). */
export function smoothPath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  const x = (i: number) => pts[i]?.[0] ?? 0;
  const y = (i: number) => pts[i]?.[1] ?? 0;
  if (n === 0) return "";
  if (n === 1) return `M${round(x(0))},${round(y(0))}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = x(i + 1) - x(i);
    dx.push(h);
    slope.push(h === 0 ? 0 : (y(i + 1) - y(i)) / h);
  }
  const s = (i: number) => slope[i] ?? 0;

  // Tangents at each point, then the Fritsch–Carlson monotonicity clamp.
  const m: number[] = new Array(n).fill(0);
  m[0] = s(0);
  m[n - 1] = s(n - 2);
  for (let i = 1; i < n - 1; i++) {
    m[i] = s(i - 1) * s(i) <= 0 ? 0 : (s(i - 1) + s(i)) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (s(i) === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] ?? 0) / s(i);
    const b = (m[i + 1] ?? 0) / s(i);
    const sum = a * a + b * b;
    if (sum > 9) {
      const t = 3 / Math.sqrt(sum);
      m[i] = t * a * s(i);
      m[i + 1] = t * b * s(i);
    }
  }

  let d = `M${round(x(0))},${round(y(0))}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] ?? 0;
    const c1x = x(i) + h / 3;
    const c1y = y(i) + ((m[i] ?? 0) * h) / 3;
    const c2x = x(i + 1) - h / 3;
    const c2y = y(i + 1) - ((m[i + 1] ?? 0) * h) / 3;
    d += ` C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(x(i + 1))},${round(y(i + 1))}`;
  }
  return d;
}

/** Label every `step`-th tick, always including the last, for at most ~`target` labels. */
export function labelEvery(count: number, target = 7): (i: number) => boolean {
  const step = Math.max(1, Math.ceil(count / target));
  return (i: number) => (count - 1 - i) % step === 0;
}

/** A smooth filled-area path: the curve, then straight down to `baseY` and back. */
export function areaPath(pts: readonly (readonly [number, number])[], baseY: number): string {
  if (pts.length === 0) return "";
  const line = smoothPath(pts);
  const last = pts[pts.length - 1]?.[0] ?? 0;
  const first = pts[0]?.[0] ?? 0;
  return `${line} L${round(last)},${round(baseY)} L${round(first)},${round(baseY)} Z`;
}

/** Map a series of values to [x, y] pixel points within a plot box. */
export function toPoints(
  values: readonly number[],
  opts: { width: number; height: number; padTop: number; max: number },
): [number, number][] {
  const { width, height, padTop, max } = opts;
  const innerH = height - padTop;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const y = (v: number) => padTop + innerH - (max > 0 ? (v / max) * innerH : 0);
  return values.map((v, i) => [values.length > 1 ? i * stepX : width / 2, y(v)]);
}

/** Runs of consecutive measured values, so a line breaks over gaps: `[1, null, 2, 3]` → `[[0], [2, 3]]`. */
export function gapSegments(values: readonly (number | null)[]): number[][] {
  const runs: number[][] = [];
  values.forEach((value, index) => {
    if (value === null) return;
    const last = runs.at(-1);
    if (last && last.at(-1) === index - 1) last.push(index);
    else runs.push([index]);
  });
  return runs;
}
