import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DayForecast } from "../../api/types";
import { niceScale } from "../../lib/axis";
import { fmtMW, fmtTime } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps, gwYAxis } from "./common";
import type { TipRow } from "./common";

interface Row {
  t: number;
  forecast?: number | null;
  range?: [number, number] | null;
  actual?: number | null;
}

const HOUR = 3_600_000;

/** Hourly forecast with its planning range (step = hourly block), optional half-hourly actuals. */
export function DayForecastChart({ data, showActual }: { data: DayForecast; showActual: boolean }) {
  const { colors } = useTheme();

  const rows = useMemo(() => {
    const byT = new Map<number, Row>();
    const row = (t: number) => {
      if (!byT.has(t)) byT.set(t, { t });
      return byT.get(t)!;
    };
    for (const p of data.points) {
      const r = row(Date.parse(p.start_time));
      r.forecast = p.forecast_mw;
      r.range =
        p.range_low_mw !== null && p.range_high_mw !== null
          ? [p.range_low_mw, p.range_high_mw]
          : null;
    }
    for (const a of data.actuals_halfhourly) row(Date.parse(a.start_time)).actual = a.actual_mw;
    // Repeat the last block's values at the end of the day so step lines cover the final hour/half-hour.
    const last = data.points[data.points.length - 1];
    if (last) {
      const end = Date.parse(last.start_time) + HOUR;
      const r = row(end);
      r.forecast = last.forecast_mw;
      r.range =
        last.range_low_mw !== null && last.range_high_mw !== null
          ? [last.range_low_mw, last.range_high_mw]
          : null;
      const lastAct = data.actuals_halfhourly[data.actuals_halfhourly.length - 1];
      if (lastAct) r.actual = lastAct.actual_mw;
    }
    return [...byT.values()].sort((a, b) => a.t - b.t);
  }, [data]);

  const start = rows[0]?.t ?? 0;
  const ticks = Array.from({ length: 9 }, (_, i) => start + i * 3 * HOUR);
  const kpis = "peak_mw" in data.kpis ? data.kpis : null;
  const scale = niceScale(
    rows.flatMap((r) => [r.forecast, r.range?.[1], showActual ? r.actual : null]),
  );

  return (
    <div>
      <Legend
        items={[
          { label: "Forecast available at cutoff", color: colors.forecast },
          { label: "Planning range (P10–P90 of actual)", color: colors.forecast, shape: "band" },
          ...(showActual ? [{ label: "Actual wind (half-hourly)", color: colors.actual }] : []),
        ]}
      />
      <div className="h-[340px] px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 26, right: 20, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, start + 24 * HOUR]}
              ticks={ticks}
              tickFormatter={(t: number) => fmtTime(new Date(t).toISOString())}
              {...axisProps}
            />
            <YAxis {...gwYAxis(scale, colors.muted)} />
            <Tooltip
              cursor={{ stroke: colors.baseline, strokeWidth: 1 }}
              content={({ active, label }) => {
                if (!active || label === undefined) return null;
                const t = Number(label);
                const hourT = t - (t % HOUR);
                const h = rows.find((r) => r.t === hourT);
                const a = rows.find((r) => r.t === t);
                const tipRows: TipRow[] = [];
                if (h?.forecast != null)
                  tipRows.push({
                    key: "f",
                    label: "forecast",
                    value: fmtMW(h.forecast),
                    color: colors.forecast,
                  });
                if (h?.range)
                  tipRows.push({
                    key: "r",
                    label: "planning range",
                    value: `${fmtMW(h.range[0])} – ${fmtMW(h.range[1])}`,
                    color: colors.forecast,
                    shape: "band",
                  });
                if (showActual && a?.actual != null)
                  tipRows.push({
                    key: "a",
                    label: "actual",
                    value: fmtMW(a.actual),
                    color: colors.actual,
                  });
                const iso = new Date(t).toISOString();
                return <TooltipCard title={`${fmtTime(iso)} UK`} rows={tipRows} />;
              }}
            />
            <Area
              dataKey="range"
              type="stepAfter"
              stroke="none"
              fill={colors.forecast}
              fillOpacity={0.13}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              dataKey="forecast"
              type="stepAfter"
              stroke={colors.forecast}
              strokeWidth={2}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls
            />
            {showActual && (
              <Line
                dataKey="actual"
                type="stepAfter"
                stroke={colors.actual}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls
              />
            )}
            {kpis && (
              <ReferenceDot
                x={Date.parse(kpis.peak_time) + HOUR / 2}
                y={kpis.peak_mw}
                r={4}
                fill={colors.forecast}
                stroke={colors.surface}
                strokeWidth={2}
                label={{
                  value: `Peak ${fmtMW(kpis.peak_mw)}`,
                  position: "top",
                  fill: colors.ink,
                  fontSize: 11,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
