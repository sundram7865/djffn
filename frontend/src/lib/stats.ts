// Small statistics helpers for charts.

/** Ordinary least squares fit of actual on forecast. */
export function fitLine(points: { f: number; a: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 1, intercept: 0 };
  const mf = points.reduce((s, p) => s + p.f, 0) / n;
  const ma = points.reduce((s, p) => s + p.a, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.f - mf) * (p.a - ma);
    den += (p.f - mf) ** 2;
  }
  const slope = den ? num / den : 1;
  return { slope, intercept: ma - slope * mf };
}
