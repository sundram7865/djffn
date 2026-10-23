import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

/** Error vs forecast age (all versions). Shades the horizons the chosen cutoff actually uses. */
export function HorizonChart({ data, used }: { data: Horizon; used: [number, number] | null }) {
  const { colors } = useTheme();
  const rows = data.buckets;
  const scale = niceScale(rows.flatMap((b) => [b.mae_mw, b.bias_mw]));
  const usedLabels =
    used && rows.length
      ? rows
          .filter((b) => b.horizon_to_h > used[0] && b.horizon_from_h < used[1])
          .map((b) => b.label)
      : [];
  return (
    <div>
      <Legend
        items={[
          { label: "MAE by forecast age", color: colors.forecast, shape: "box" },
          { label: "Bias", color: colors.secondary },
          ...(usedLabels.length
            ? [{ label: "Ages used at your cutoff", color: colors.muted, shape: "band" as const }]
            : []),
        ]}
      />
      <div className="h-[260px] px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 24, right: 20, bottom: 18, left: 4 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            {usedLabels.length > 0 && (
              <ReferenceArea
                x1={usedLabels[0]}
                x2={usedLabels[usedLabels.length - 1]}
                fill={colors.muted}
                fillOpacity={0.12}
              />
            )}
            <XAxis
              dataKey="label"
              interval="preserveStartEnd"
              minTickGap={2}
              tickFormatter={(l: string) => l.replace(" h", "")}
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
              cursor={{ fill: colors.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const b = active
                  ? (payload?.[0]?.payload as (typeof rows)[number] | undefined)
                  : undefined;
                if (!b) return null;
                return (
                  <TooltipCard
                    title={`Forecast ${b.label} ahead`}
                    rows={[
                      {
                        key: "m",
                        label: "MAE",
                        value: fmtMW(b.mae_mw),
                        color: colors.forecast,
                        shape: "box",
                      },
                      {
                        key: "b",
                        label: "bias",
                        value: fmtMW(b.bias_mw, { signed: true }),
                        color: colors.secondary,
                      },
                    ]}
                    footer={`${b.n} forecast–actual pairs${b.low_coverage ? " · low coverage: only early runs reach this far, for late hours" : ""}`}
                  />
                );
              }}
            />
            <Bar dataKey="mae_mw" barSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {rows.map((b) => (
                <Cell
                  key={b.label}
                  fill={colors.forecast}
                  fillOpacity={b.low_coverage ? 0.35 : 1}
                />
              ))}
            </Bar>
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
