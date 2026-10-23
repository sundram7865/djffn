// Formatting helpers. Times are shown in UK local time (Europe/London); in January that equals UTC.

const UK = "Europe/London";

/** 2022 -> "2.02 GW", 330 -> "330 MW" (same rules as the backend's fmt_mw). */
export function fmtMW(v: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const a = Math.abs(v);
  const sign = opts.signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "";
  if (a >= 1000) {
    const digits = a >= 10_000 ? 1 : 2;
    return `${sign}${trimZeros((a / 1000).toFixed(digits))} GW`;
  }
  return `${sign}${Math.round(a / 10) * 10} MW`;
}

/** Axis ticks: 12000 -> "12", 2500 -> "2.5", -2000 -> "−2" (unit shown once on the axis). */
export function fmtAxisGW(v: number): string {
  const gw = v / 1000;
  const s = trimZeros(Math.abs(gw).toFixed(2));
  return `${gw < 0 ? "−" : ""}${s}`;
}

export function fmtGWh(mwh: number | null | undefined): string {
  if (mwh === null || mwh === undefined) return "–";
  return `${(mwh / 1000).toFixed(1)} GWh`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "–";
  return `${v.toFixed(digits)}%`;
}

export function fmtShare(v: number | null | undefined, digits = 0): string {
  return v === null || v === undefined ? "–" : fmtPct(v * 100, digits);
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const longDayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: UK,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDayShort = (iso: string) => dayFmt.format(new Date(iso));
export const fmtDayTime = (iso: string) => `${fmtDayShort(iso)}, ${fmtTime(iso)}`;

/** "2026-01-15" -> "Thursday 15 January 2026" (date-only strings are treated as UK dates). */
export const fmtDateLong = (ymd: string) => longDayFmt.format(new Date(`${ymd}T12:00:00Z`));
export const fmtDateShort = (ymd: string) => dayFmt.format(new Date(`${ymd}T12:00:00Z`));

/** 1.8333 -> "1 h 50 min", 0 -> "0 min". */
export function fmtHours(h: number): string {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm} min`;
  return mm === 0 ? `${hh} h` : `${hh} h ${mm} min`;
}

/** Add whole days to a YYYY-MM-DD string. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
