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
  error: number | null;
  short: [number, number] | null;
  surplus: [number, number] | null;
}

const DAY = 86_400_000;

/**
 * Forecast vs actual with the error band between them, split by sign: red where wind fell short
 * of the forecast (buyer short), grey where it beat the forecast. Zero-height segments (instead
 * of gaps) keep each band continuous so step blocks render their full width.
 */
export function ForecastVsActualChart({ data }: { data: Accuracy }) {
  const { colors } = useTheme();
  const rows = useMemo<Row[]>(
    () =>
      data.series.map((p) => {
        const f = p.forecast_mw;
        const a = p.actual_mw;
        const both = f !== null && a !== null;
        return {
          t: Date.parse(p.start_time),
          forecast: f,
          actual: a,
          error: p.error_mw,
          short: both ? (f > a ? [a, f] : [a, a]) : null,
          surplus: both ? (a > f ? [f, a] : [f, f]) : null,
        };
      }),
    [data.series],
  );

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
          { label: "Forecast at cutoff", color: colors.forecast },
          { label: "Actual", color: colors.actual },
          { label: "Shortfall (wind below forecast)", color: colors.short, shape: "band" },
          { label: "Surplus (wind above forecast)", color: colors.surplus, shape: "band" },
        ]}
      />
      <div className="h-[380px] px-2 pb-2 pt-2">
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
                      row.error === null ? (
                        "Not scored (missing data)"
                      ) : (
                        <span>
                          <strong className="text-ink">{fmtMW(Math.abs(row.error))}</strong>{" "}
                          {row.error > 0
                            ? "shortfall — wind under-delivered"
                            : row.error < 0
                              ? "surplus — wind over-delivered"
                              : "exact"}
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
              fillOpacity={0.28}
              isAnimationActive={false}
            />
            <Area
              dataKey="surplus"
              type="stepAfter"
              stroke="none"
              fill={colors.surplus}
              fillOpacity={0.45}
              isAnimationActive={false}
            />
            <Line
              dataKey="actual"
              type="stepAfter"
              stroke={colors.actual}
              strokeWidth={1.5}
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
            {rows.length > 72 && (
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
