// "Nice" axis scales for MW data rendered in GW: clean steps (0.5, 1, 2, 2.5, 4, 5 GW…).

const STEPS_MW = [250, 500, 1000, 2000, 2500, 4000, 5000, 10_000, 20_000];

export interface Scale {
  domain: [number, number];
  ticks: number[];
}

export function niceScale(
  values: (number | null | undefined)[],
  opts: { zero?: boolean; target?: number } = {},
): Scale {
  const { zero = true, target = 5 } = opts;
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  let lo = nums.length ? Math.min(...nums) : 0;
  let hi = nums.length ? Math.max(...nums) : 1000;
  if (zero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (hi === lo) hi = lo + 1000;
  // Smallest clean step that spans the data in at most `target` intervals (least headroom).
  const intervals = (s: number) => Math.ceil(hi / s) - Math.floor(lo / s);
  const step = STEPS_MW.find((s) => intervals(s) <= target) ?? STEPS_MW[STEPS_MW.length - 1];
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(t);
  return { domain: [min, max], ticks };
}
