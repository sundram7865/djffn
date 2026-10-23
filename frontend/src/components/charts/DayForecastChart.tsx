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

import type { DayForecast, DayPoint } from "../../api/types";
import { niceScale } from "../../lib/axis";
import { fmtMW, fmtTime } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps, gwYAxis } from "./common";
import type { TipRow } from "./common";

interface Row {
  t: number;
  /** Values as drawn: each hourly block plus a closing point so step lines span the full block. */
  fLine: number | null;
  rLine: [number, number] | null;
  aLine: number | null;
}

const HOUR = 3_600_000;
const HALF = HOUR / 2;

const rangeOf = (p?: DayPoint): [number, number] | null =>
  p && p.range_low_mw !== null && p.range_high_mw !== null
    ? [p.range_low_mw, p.range_high_mw]
    : null;

/** Hourly forecast with its planning range (step = hourly block), optional half-hourly actuals. */
export function DayForecastChart({ data, showActual }: { data: DayForecast; showActual: boolean }) {
  const { colors } = useTheme();

  const { rows, fc, act } = useMemo(() => {
    const fc = new Map(data.points.map((p) => [Date.parse(p.start_time), p]));
    const act = new Map(
      data.actuals_halfhourly.map((a) => [Date.parse(a.start_time), a.actual_mw]),
    );
    const first = data.points.length ? Date.parse(data.points[0].start_time) : 0;
    const last = first + data.points.length * HOUR;
    const rows: Row[] = [];
    for (let t = first; t <= last; t += HALF) {
      const hourT = t - (t % HOUR);
      const own = fc.get(hourT);
      // On the hour, close the previous block if this hour has no forecast (gap or end of day).
      const prev = t === hourT ? fc.get(t - HOUR) : undefined;
      const src = own?.forecast_mw != null ? own : prev?.forecast_mw != null ? prev : undefined;
      rows.push({
        t,
        fLine: src?.forecast_mw ?? null,
        rLine: rangeOf(src),
        aLine: act.get(t) ?? act.get(t - HALF) ?? null,
      });
    }
    return { rows, fc, act };
  }, [data]);

  const start = rows[0]?.t ?? 0;
  const ticks = Array.from({ length: 9 }, (_, i) => start + i * 3 * HOUR);
  const kpis = "peak_mw" in data.kpis ? data.kpis : null;
  const scale = niceScale(
    rows.flatMap((r) => [r.fLine, r.rLine?.[1], showActual ? r.aLine : null]),
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
                const h = fc.get(t - (t % HOUR));
                const range = rangeOf(h);
                const a = act.get(t);
                const tipRows: TipRow[] = [];
                tipRows.push({
                  key: "f",
                  label: h?.forecast_mw != null ? "forecast" : "no forecast before the cutoff",
                  value: h?.forecast_mw != null ? fmtMW(h.forecast_mw) : "–",
                  color: colors.forecast,
                });
                if (range)
                  tipRows.push({
                    key: "r",
                    label: "planning range",
                    value: `${fmtMW(range[0])} – ${fmtMW(range[1])}`,
                    color: colors.forecast,
                    shape: "band",
                  });
                if (showActual && a !== undefined)
                  tipRows.push({
                    key: "a",
                    label: "actual",
                    value: fmtMW(a),
                    color: colors.actual,
                  });
                const iso = new Date(t).toISOString();
                return <TooltipCard title={`${fmtTime(iso)} UK`} rows={tipRows} />;
              }}
            />
            <Area
              dataKey="rLine"
              type="stepAfter"
              stroke="none"
              fill={colors.forecast}
              fillOpacity={0.13}
              isAnimationActive={false}
            />
            <Line
              dataKey="fLine"
              type="stepAfter"
              stroke={colors.forecast}
              strokeWidth={2}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
            {showActual && (
              <Line
                dataKey="aLine"
                type="stepAfter"
                stroke={colors.actual}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: colors.surface, strokeWidth: 2 }}
                isAnimationActive={false}
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
