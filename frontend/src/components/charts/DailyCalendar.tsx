import clsx from "clsx";

import type { GroupStat } from "../../api/types";
import { addDays, daysInclusive, fmtDateShort, fmtMW } from "../../lib/format";
import { seqColor, useTheme } from "../../lib/theme";

/** Calendar heatmap of daily MAE (one-hue sequential ramp). Click a day to open its forecast. */
export function DailyCalendar({
  rows,
  onPick,
}: {
  rows: GroupStat[];
  onPick: (day: string) => void;
}) {
  const { colors, mode } = useTheme();
  if (!rows.length) return null;
  const byDay = new Map(rows.map((r) => [String(r.key), r]));
  const days = rows.map((r) => String(r.key));
  const first = days[0];
  const last = days[days.length - 1];
  const firstDow = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const lastDow = (new Date(`${last}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells = daysInclusive(addDays(first, -firstDow), addDays(last, 6 - lastDow));
  const maes = rows.map((r) => r.mae_mw);
  const min = Math.min(...maes);
  const max = Math.max(...maes);

  return (
    <div className="px-5 pb-5 pt-3">
      <div className="grid grid-cols-7 gap-1.5">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-[11px] text-muted">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const r = byDay.get(d);
          if (!r) return <div key={d} className="h-14 rounded-md bg-surface-2/50" />;
          const fill = seqColor(colors, r.mae_mw, min, max);
          const idx = (colors.seq as readonly string[]).indexOf(fill);
          // Ink on light cells, white on dark ones (the ramp runs the other way in dark mode).
          const darkText = mode === "light" ? idx < 3 : idx >= 4;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              title={`${fmtDateShort(d)}: MAE ${fmtMW(r.mae_mw)}, bias ${fmtMW(r.bias_mw, { signed: true })} — open this day`}
              className={clsx(
                "flex h-14 flex-col items-start justify-between rounded-md px-1.5 py-1 text-left transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-accent",
                darkText ? "text-[#0b0b0b]" : "text-white",
              )}
              style={{ background: fill }}
            >
              <span className="text-[11px] font-medium opacity-80">
                {Number(d.slice(8))}
                {d.slice(5, 7) === "02" ? " Feb" : ""}
              </span>
              <span className="text-[12.5px] font-semibold tabular">
                {(r.mae_mw / 1000).toFixed(1)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11.5px] text-muted">
        <span>MAE {fmtMW(min)}</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full">
          {colors.seq.map((c) => (
            <div key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
        <span>{fmtMW(max)}</span>
      </div>
    </div>
  );
}
