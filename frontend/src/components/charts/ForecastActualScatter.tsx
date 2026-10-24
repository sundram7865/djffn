import { useMemo } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Accuracy } from "../../api/types";
import { niceScale } from "../../lib/axis";
import { fmtAxisGW, fmtDayTime, fmtMW } from "../../lib/format";
import { fitLine } from "../../lib/stats";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps } from "./common";

interface Point {
  t: string;
  f: number;
  a: number;
}

/**
 * Every scored hour as a dot: forecast (x) against what wind actually did (y). Dots below the
 * diagonal are shortfalls. The fitted line shows the systematic pattern: its slope below 1 means
 * the higher the forecast, the more it overshoots.
 */
export function ForecastActualScatter({ data }: { data: Accuracy }) {
  const { colors } = useTheme();
  const { short, surplus, fit, scale } = useMemo(() => {
    const pts: Point[] = data.series
      .filter((p) => p.forecast_mw !== null && p.actual_mw !== null)
      .map((p) => ({ t: p.start_time, f: p.forecast_mw!, a: p.actual_mw! }));
    const scale = niceScale(pts.flatMap((p) => [p.f, p.a]));
    return {
      short: pts.filter((p) => p.f > p.a),
      surplus: pts.filter((p) => p.f <= p.a),
      fit: fitLine(pts),
      scale,
    };
  }, [data.series]);

  const [lo, hi] = scale.domain;
  const fitAt = (x: number) => fit.slope * x + fit.intercept;
  const sign = fit.intercept >= 0 ? "+" : "−";

  return (
    <div>
      <Legend
        items={[
          { label: `Shortfall hours (${short.length})`, color: colors.short, shape: "box" },
          { label: `Surplus hours (${surplus.length})`, color: colors.neutral, shape: "box" },
          { label: "Perfect forecast (actual = forecast)", color: colors.muted },
          {
            label: `Fitted: actual ≈ ${fit.slope.toFixed(2)} × forecast ${sign} ${fmtMW(Math.abs(fit.intercept))}`,
            color: colors.secondary,
          },
        ]}
      />
      <div className="h-[320px] px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 24, right: 20, bottom: 18, left: 4 }}>
            <CartesianGrid stroke={colors.grid} />
            <XAxis
              type="number"
              dataKey="f"
              domain={scale.domain}
              ticks={scale.ticks}
              tickFormatter={fmtAxisGW}
              label={{
                value: "Forecast at cutoff (GW)",
                position: "bottom",
                offset: 2,
                fill: colors.muted,
                fontSize: 11,
              }}
              {...axisProps}
            />
            <YAxis
              type="number"
              dataKey="a"
              domain={scale.domain}
              ticks={scale.ticks}
              tickFormatter={fmtAxisGW}
              width={40}
              label={{
                value: "Actual (GW)",
                position: "top",
                offset: 12,
                dx: 22,
                fill: colors.muted,
                fontSize: 11,
              }}
              {...axisProps}
            />
            <Tooltip
              cursor={{ stroke: colors.baseline, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!p) return null;
                const e = p.f - p.a;
                return (
                  <TooltipCard
                    title={`${fmtDayTime(p.t)} UK`}
                    rows={[
                      { key: "f", label: "forecast", value: fmtMW(p.f), color: colors.forecast },
                      { key: "a", label: "actual", value: fmtMW(p.a), color: colors.actual },
                    ]}
                    footer={`${fmtMW(Math.abs(e))} ${e > 0 ? "shortfall" : "surplus"}`}
                  />
                );
              }}
            />
            <ReferenceLine
              segment={[
                { x: lo, y: lo },
                { x: hi, y: hi },
              ]}
              stroke={colors.muted}
              strokeWidth={1.5}
            />
            <Scatter
              data={surplus}
              fill={colors.neutral}
              fillOpacity={0.45}
              shape="circle"
              isAnimationActive={false}
              legendType="none"
            />
            <Scatter
              data={short}
              fill={colors.short}
              fillOpacity={0.45}
              shape="circle"
              isAnimationActive={false}
              legendType="none"
            />
            <ReferenceLine
              segment={[
                { x: lo, y: fitAt(lo) },
                { x: hi, y: fitAt(hi) },
              ]}
              stroke={colors.secondary}
              strokeWidth={2}
              ifOverflow="hidden"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
