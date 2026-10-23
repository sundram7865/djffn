import clsx from "clsx";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DayForecast, RunVersion } from "../../api/types";
import { niceScale } from "../../lib/axis";
import { fmtDayShort, fmtMW, fmtTime } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps, gwYAxis } from "./common";

const HOUR = 3_600_000;

/** Timeline of every run published on D-1 relative to the cutoff: which one the buyer could use. */
export function RunTimeline({ data }: { data: DayForecast }) {
  const runs = data.run_timeline;
  const cutoff = data.cutoff.utc ? Date.parse(data.cutoff.utc) : null;
  if (!runs.length || cutoff === null) return null;

  // Axis: the decision day in UK time (00:00–24:00); runs from earlier days are pinned to the left.
  const dayStart = cutoff - (cutoff % (24 * HOUR));
  const pos = (t: number) => Math.min(100, Math.max(0, ((t - dayStart) / (24 * HOUR)) * 100));

  return (
    <div className="px-5 pb-4 pt-2">
      <div className="relative h-16">
        <div className="absolute inset-x-0 top-7 h-px bg-baseline" />
        {[0, 6, 12, 18, 24].map((h) => (
          <div
            key={h}
            className="absolute top-9 -translate-x-1/2 text-[10.5px] tabular text-muted"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h % 24).padStart(2, "0")}:00
          </div>
        ))}
        <div
          className="absolute top-0 bottom-5 w-0.5 -translate-x-1/2 bg-ink"
          style={{ left: `${pos(cutoff)}%` }}
        >
          <span className="absolute -top-0.5 left-1.5 whitespace-nowrap text-[11px] font-semibold text-ink">
            Gate {data.cutoff.time}
          </span>
        </div>
        {runs.map((r) => {
          const t = Date.parse(r.publish_time);
          return (
            <div
              key={r.publish_time}
              title={`${fmtDayShort(r.publish_time)} ${fmtTime(r.publish_time)} — ${statusText(r)}`}
              className={clsx(
                "absolute top-[23px] h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-2 ring-surface",
                r.status === "used" && "h-3.5 w-3.5 top-[21px] bg-accent",
                r.status === "superseded" && "bg-ink-2",
                r.status === "after_cutoff" && "border border-dashed border-muted bg-surface",
              )}
              style={{ left: `${pos(t)}%` }}
            />
          );
        })}
      </div>
      <p className="text-[12.5px] text-ink-2">
        {runs.filter((r) => r.status === "after_cutoff").length} later runs were published after the
        gate, so the buyer could not have seen them. The app never uses them for this decision.
      </p>
    </div>
  );
}

function statusText(r: RunVersion) {
  if (r.status === "used") return "used (latest before the gate)";
  if (r.status === "superseded") return "available, but superseded";
  return "published after the gate — not available";
}

/** How the forecast for D changed run by run on D-1; the used run is highlighted. */
export function RunVersionsChart({ data, showActual }: { data: DayForecast; showActual: boolean }) {
  const { colors } = useTheme();
  const runs = data.run_timeline;

  const rows = useMemo(() => {
    const byT = new Map<number, Record<string, number>>();
    for (const r of runs) {
      for (const v of r.values) {
        const t = Date.parse(v.start_time);
        const row = byT.get(t) ?? { t };
        row[r.publish_time] = v.forecast_mw;
        byT.set(t, row);
      }
    }
    for (const p of data.points) {
      const t = Date.parse(p.start_time);
      const row = byT.get(t) ?? { t };
      if (p.actual_mw !== null) row.actual = p.actual_mw;
      byT.set(t, row);
    }
    return [...byT.values()].sort((a, b) => a.t - b.t);
  }, [runs, data.points]);

  const start = rows[0]?.t ?? 0;
  const ticks = Array.from({ length: 9 }, (_, i) => start + i * 3 * HOUR);
  const ordered = [...runs].sort((a, b) => order(a) - order(b)); // draw highlighted run last
  const scale = niceScale(
    rows.flatMap((r) =>
      Object.entries(r)
        .filter(([k]) => k !== "t")
        .map(([, v]) => v),
    ),
  );

  return (
    <div>
      <Legend
        items={[
          { label: "Run used (latest before gate)", color: colors.forecast },
          { label: "Earlier runs (superseded)", color: colors.muted },
          { label: "Runs after the gate (not available)", color: colors.later },
          ...(showActual ? [{ label: "Actual (hourly)", color: colors.actual }] : []),
        ]}
      />
      <div className="h-[260px] px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 24, right: 20, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, start + 23 * HOUR]}
              ticks={ticks.filter((t) => t <= start + 23 * HOUR)}
              tickFormatter={(t: number) => fmtTime(new Date(t).toISOString())}
              {...axisProps}
            />
            <YAxis {...gwYAxis(scale, colors.muted)} />
            <Tooltip
              cursor={{ stroke: colors.baseline, strokeWidth: 1 }}
              content={({ active, label }) => {
                if (!active || label === undefined) return null;
                const row = rows.find((r) => r.t === Number(label));
                if (!row) return null;
                const tipRows = ordered
                  .slice()
                  .reverse()
                  .filter((r) => row[r.publish_time] !== undefined)
                  .map((r) => ({
                    key: r.publish_time,
                    label: `${fmtTime(r.publish_time)} run${r.status === "used" ? " (used)" : r.status === "after_cutoff" ? " (after gate)" : ""}`,
                    value: fmtMW(row[r.publish_time]),
                    color: lineColor(r, colors),
                  }));
                if (showActual && row.actual !== undefined)
                  tipRows.push({
                    key: "a",
                    label: "actual",
                    value: fmtMW(row.actual),
                    color: colors.actual,
                  });
                return (
                  <TooltipCard
                    title={`${fmtTime(new Date(Number(label)).toISOString())} UK`}
                    rows={tipRows}
                  />
                );
              }}
            />
            {ordered.map((r) => (
              <Line
                key={r.publish_time}
                dataKey={r.publish_time}
                type="monotone"
                stroke={lineColor(r, colors)}
                strokeWidth={r.status === "used" ? 2.5 : 1.25}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            {showActual && (
              <Line
                dataKey="actual"
                type="monotone"
                stroke={colors.actual}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const order = (r: RunVersion) => (r.status === "used" ? 2 : r.status === "superseded" ? 1 : 0);
const lineColor = (r: RunVersion, c: { forecast: string; muted: string; later: string }) =>
  r.status === "used" ? c.forecast : r.status === "superseded" ? c.muted : c.later;
