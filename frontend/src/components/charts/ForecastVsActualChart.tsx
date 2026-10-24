import { useMemo } from "react";
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Accuracy } from "../../api/types";
import { niceScale } from "../../lib/axis";
import { fmtDayShort, fmtDayTime, fmtMW } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps, gwYAxis } from "./common";

interface Row {
  t: number;
  forecast: number | null;
  actual: number | null;
  short: [number, number] | null;
  surplus: [number, number] | null;
  scored: number | null;
}

const HOUR = 3_600_000;
const HALF = HOUR / 2;
const DAY = 24 * HOUR;

/**
 * Forecast vs actual at half-hour resolution: every FUELHH reading is drawn, with the hourly
 * forecast held across both half-hours of its hour. The band between the two lines is the miss:
 * red where wind fell short of the forecast (buyer short), grey where it beat it. Zero-height
 * segments (instead of gaps) keep each band continuous so step blocks render their full width.
 */
export function ForecastVsActualChart({ data }: { data: Accuracy }) {
  const { colors } = useTheme();

  const rows = useMemo<Row[]>(() => {
    const fc = new Map(data.series.map((p) => [Date.parse(p.start_time), p]));
    const act = new Map(
      data.actuals_halfhourly.map((a) => [Date.parse(a.start_time), a.actual_mw]),
    );
    const times = [...new Set([...fc.keys(), ...act.keys()])].sort((a, b) => a - b);
    if (!times.length) return [];
    const out: Row[] = [];
    const first = times[0];
    const last = times[times.length - 1] + HALF;
    for (let t = first; t <= last; t += HALF) {
      const hour = fc.get(t - (t % HOUR));
      const f = hour?.forecast_mw ?? null;
      // Closing point at the very end so the last half-hour block is drawn in full.
      const a = act.get(t) ?? (t === last ? (act.get(t - HALF) ?? null) : null);
      const both = f !== null && a !== null;
      out.push({
        t,
        forecast: f ?? (t === last ? (fc.get(t - HOUR)?.forecast_mw ?? null) : null),
        actual: a,
        short: both ? (f > a ? [a, f] : [a, a]) : null,
        surplus: both ? (a > f ? [f, a] : [f, f]) : null,
        scored: t % HOUR === 0 ? (hour?.error_mw ?? null) : null,
      });
    }
    return out;
  }, [data.series, data.actuals_halfhourly]);

  const first = rows[0]?.t ?? 0;
  const last = rows[rows.length - 1]?.t ?? 0;
  const spanDays = Math.max(1, Math.round((last - first) / DAY));
  const step = spanDays > 20 ? 7 : spanDays > 8 ? 2 : 1;
  const scale = niceScale(rows.flatMap((r) => [r.forecast, r.actual]));
  const ticks: number[] = [];
  for (let t = first; t <= last; t += step * DAY) ticks.push(t);

  return (
    <div>
      <Legend
        items={[
          { label: "Forecast at cutoff (hourly)", color: colors.forecast },
          { label: "Actual (every half-hour)", color: colors.actual },
          { label: "Shortfall: wind below forecast", color: colors.short, shape: "band" },
          { label: "Surplus: wind above forecast", color: colors.surplus, shape: "band" },
        ]}
      />
      <div className="h-[400px] px-2 pb-2 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 24, right: 20, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(t: number) => fmtDayShort(new Date(t).toISOString())}
              {...axisProps}
            />
            <YAxis {...gwYAxis(scale, colors.muted)} />
            <Tooltip
              cursor={{ stroke: colors.baseline, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                if (!row) return null;
                const gap =
                  row.forecast !== null && row.actual !== null ? row.forecast - row.actual : null;
                return (
                  <TooltipCard
                    title={`${fmtDayTime(new Date(row.t).toISOString())} UK`}
                    rows={[
                      {
                        key: "f",
                        label: "forecast",
                        value: fmtMW(row.forecast),
                        color: colors.forecast,
                      },
                      { key: "a", label: "actual", value: fmtMW(row.actual), color: colors.actual },
                    ]}
                    footer={
                      gap === null ? (
                        "Missing data for this half-hour"
                      ) : (
                        <span>
                          <strong className="text-ink">{fmtMW(Math.abs(gap))}</strong>{" "}
                          {gap > 0
                            ? "shortfall: wind under-delivered"
                            : gap < 0
                              ? "surplus: wind over-delivered"
                              : "exact"}
                          {row.scored !== null && " (scored hour)"}
                        </span>
                      )
                    }
                  />
                );
              }}
            />
            <Area
              dataKey="short"
              type="stepAfter"
              stroke="none"
              fill={colors.short}
              fillOpacity={0.3}
              isAnimationActive={false}
            />
            <Area
              dataKey="surplus"
              type="stepAfter"
              stroke="none"
              fill={colors.surplus}
              fillOpacity={0.5}
              isAnimationActive={false}
            />
            <Line
              dataKey="actual"
              type="stepAfter"
              stroke={colors.actual}
              strokeWidth={1.25}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="forecast"
              type="stepAfter"
              stroke={colors.forecast}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {rows.length > 144 && (
              <Brush
                dataKey="t"
                height={26}
                travellerWidth={8}
                stroke={colors.baseline}
                fill={colors.surface}
                tickFormatter={(t: number) => fmtDayShort(new Date(t).toISOString())}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
