import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { GroupStat, Horizon } from "../../api/types";
import { niceScale } from "../../lib/axis";
import { fmtMW } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps, gwYAxis } from "./common";

/** MAE (bars) and bias (line) by hour of day. Same unit, so one axis. */
export function ByHourChart({ rows }: { rows: GroupStat[] }) {
  const { colors } = useTheme();
  const data = rows.map((r) => ({ ...r, hour: Number(r.key) }));
  const scale = niceScale(data.flatMap((r) => [r.mae_mw, r.bias_mw]));
  return (
    <div>
      <Legend
        items={[
          { label: "MAE (typical miss)", color: colors.forecast, shape: "box" },
          { label: "Bias (forecast − actual)", color: colors.secondary },
        ]}
      />
      <div className="h-[260px] px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 24, right: 20, bottom: 4, left: 4 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="hour"
              tickFormatter={(h: number) => `${String(h).padStart(2, "0")}h`}
              interval={2}
              {...axisProps}
            />
            <YAxis {...gwYAxis(scale, colors.muted)} />
            <Tooltip
              cursor={{ fill: colors.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const r = active
                  ? (payload?.[0]?.payload as (typeof data)[number] | undefined)
                  : undefined;
                if (!r) return null;
                return (
                  <TooltipCard
                    title={`${String(r.hour).padStart(2, "0")}:00–${String(r.hour + 1).padStart(2, "0")}:00 UK`}
                    rows={[
                      {
                        key: "m",
                        label: "MAE",
                        value: fmtMW(r.mae_mw),
                        color: colors.forecast,
                        shape: "box",
                      },
                      {
                        key: "b",
                        label: "bias",
                        value: fmtMW(r.bias_mw, { signed: true }),
                        color: colors.secondary,
                      },
                      {
                        key: "p",
                        label: "9-in-10 buffer",
                        value: fmtMW(Math.max(0, r.p90_signed_mw)),
                      },
                    ]}
                    footer={`${r.n} hours`}
                  />
                );
              }}
            />
            <Bar
              dataKey="mae_mw"
              fill={colors.forecast}
              barSize={14}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              dataKey="bias_mw"
              stroke={colors.secondary}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** By forecast wind level: MAE, bias and the 9-in-10 buffer side by side (slots 1–3). */
export function ByBandChart({ rows }: { rows: GroupStat[] }) {
  const { colors, mode } = useTheme();
  const third = mode === "dark" ? "#199e70" : "#1baf7a";
  const data = rows.map((r) => ({
    ...r,
    name: (r.label ?? String(r.key)).replace(/ wind/, ""),
    buffer: Math.max(0, r.p90_signed_mw),
  }));
  const scale = niceScale(data.flatMap((r) => [r.mae_mw, r.bias_mw, r.buffer]));
  return (
    <div>
      <Legend
        items={[
          { label: "MAE", color: colors.forecast, shape: "box" },
          { label: "Bias", color: colors.secondary, shape: "box" },
          { label: "9-in-10 buffer", color: third, shape: "box" },
        ]}
      />
      <div className="h-[260px] px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 20, bottom: 4, left: 4 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...gwYAxis(scale, colors.muted)} />
            <Tooltip
              cursor={{ fill: colors.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const r = active
                  ? (payload?.[0]?.payload as (typeof data)[number] | undefined)
                  : undefined;
                if (!r) return null;
                return (
                  <TooltipCard
                    title={r.label ?? r.name}
                    rows={[
                      {
                        key: "m",
                        label: "MAE",
                        value: fmtMW(r.mae_mw),
                        color: colors.forecast,
                        shape: "box",
                      },
                      {
                        key: "b",
                        label: "bias",
                        value: fmtMW(r.bias_mw, { signed: true }),
                        color: colors.secondary,
                        shape: "box",
                      },
                      {
                        key: "p",
                        label: "9-in-10 buffer",
                        value: fmtMW(r.buffer),
                        color: third,
                        shape: "box",
                      },
                    ]}
                    footer={`${r.n} hours · mean forecast ${fmtMW(r.mean_forecast_mw)}`}
                  />
                );
              }}
            />
            <Bar
              dataKey="mae_mw"
              fill={colors.forecast}
              barSize={22}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              label={barLabel(colors.ink)}
            />
            <Bar
              dataKey="bias_mw"
              fill={colors.secondary}
              barSize={22}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              label={barLabel(colors.ink)}
            />
            <Bar
              dataKey="buffer"
              fill={third}
              barSize={22}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              label={barLabel(colors.ink)}
            />
            <ReferenceLine y={0} stroke={colors.baseline} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const barLabel = (fill: string) => ({
  position: "top" as const,
  fill,
  fontSize: 10.5,
  formatter: (v: unknown) => (typeof v === "number" ? (v / 1000).toFixed(1) : ""),
});

/**
 * Error vs forecast age over every forecast version (3-hour buckets). The line is MAE; the band
 * runs from the typical miss (P50 of |error|) to a bad miss (P90). Buckets beyond the point where
 * fewer runs reach are drawn faded: they hold fewer samples from a skewed mix of hours.
 */
export function HorizonChart({ data, used }: { data: Horizon; used: [number, number] | null }) {
  const { colors } = useTheme();
  const rows = data.buckets.map((b, i, all) => {
    const nextLow = all[i + 1]?.low_coverage ?? false;
    return {
      ...b,
      mid: (b.horizon_from_h + b.horizon_to_h) / 2,
      band: [b.p50_abs_mw, b.p90_abs_mw] as [number, number],
      maeFull: b.low_coverage ? null : b.mae_mw,
      // The last full bucket is repeated in the faded series so the two lines join up.
      maeLow: b.low_coverage || nextLow ? b.mae_mw : null,
    };
  });
  const scale = niceScale(rows.flatMap((r) => [r.p90_abs_mw, r.bias_mw]));
  const maxH = rows.length ? rows[rows.length - 1].horizon_to_h : 72;
  const firstLow = rows.find((r) => r.low_coverage)?.horizon_from_h;
  const ticks = Array.from({ length: Math.floor(maxH / 12) + 1 }, (_, i) => i * 12);

  return (
    <div>
      <Legend
        items={[
          { label: "MAE (typical miss)", color: colors.forecast },
          { label: "P50 to P90 of the miss", color: colors.forecast, shape: "band" },
          { label: "Bias", color: colors.secondary },
          ...(used
            ? [{ label: "Ages your cutoff uses", color: colors.muted, shape: "band" as const }]
            : []),
        ]}
      />
      <div className="h-[280px] px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 24, right: 20, bottom: 18, left: 4 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            {used && (
              <ReferenceArea
                x1={used[0]}
                x2={used[1]}
                fill={colors.muted}
                fillOpacity={0.12}
                ifOverflow="extendDomain"
              />
            )}
            <XAxis
              dataKey="mid"
              type="number"
              domain={[0, maxH]}
              ticks={ticks}
              tickFormatter={(h: number) => `${h} h`}
              label={{
                value: "Hours between forecast publication and delivery",
                position: "bottom",
                offset: 2,
                fill: colors.muted,
                fontSize: 11,
              }}
              {...axisProps}
            />
            <YAxis {...gwYAxis(scale, colors.muted)} />
            <Tooltip
              cursor={{ stroke: colors.baseline, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const b = active
                  ? (payload?.[0]?.payload as (typeof rows)[number] | undefined)
                  : undefined;
                if (!b) return null;
                return (
                  <TooltipCard
                    title={`Forecasts made ${b.label} ahead`}
                    rows={[
                      { key: "m", label: "MAE", value: fmtMW(b.mae_mw), color: colors.forecast },
                      {
                        key: "p",
                        label: "P50 to P90 miss",
                        value: `${fmtMW(b.p50_abs_mw)} to ${fmtMW(b.p90_abs_mw)}`,
                        color: colors.forecast,
                        shape: "band",
                      },
                      {
                        key: "b",
                        label: "bias",
                        value: fmtMW(b.bias_mw, { signed: true }),
                        color: colors.secondary,
                      },
                    ]}
                    footer={`${b.n} forecast and actual pairs${b.low_coverage ? ". Fewer runs reach this far, so treat as indicative" : ""}`}
                  />
                );
              }}
            />
            <Area
              dataKey="band"
              type="monotone"
              stroke="none"
              fill={colors.forecast}
              fillOpacity={0.12}
              isAnimationActive={false}
            />
            <Line
              dataKey="maeLow"
              type="monotone"
              stroke={colors.forecast}
              strokeOpacity={0.35}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="maeFull"
              type="monotone"
              stroke={colors.forecast}
              strokeWidth={2}
              dot={{ r: 3, fill: colors.forecast, stroke: colors.surface, strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="bias_mw"
              type="monotone"
              stroke={colors.secondary}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {firstLow !== undefined && (
              <ReferenceLine
                x={firstLow}
                stroke={colors.baseline}
                label={{
                  value: "fewer runs reach beyond here",
                  position: "insideTopRight",
                  fill: colors.muted,
                  fontSize: 10.5,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
