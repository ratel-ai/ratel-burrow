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
