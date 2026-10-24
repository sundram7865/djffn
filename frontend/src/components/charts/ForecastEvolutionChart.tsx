import { useMemo } from "react";
import {
  Bar,
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

import type { DayForecast, EvolutionRun } from "../../api/types";
import { niceScale } from "../../lib/axis";
import { fmtDayShort, fmtHours, fmtMW, fmtTime } from "../../lib/format";
import type { ChartColors } from "../../lib/theme";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps, gwYAxis } from "./common";

const HOUR = 3_600_000;

const statusColor = (s: EvolutionRun["status"], c: ChartColors) =>
  s === "used" ? c.forecast : s === "superseded" ? c.neutral : c.later;

const statusLabel = (s: EvolutionRun["status"]) =>
  s === "used"
    ? "used for the decision"
    : s === "superseded"
      ? "older, superseded"
      : "after the gate";

/**
 * Every forecast run published in the two days before delivery, plotted at its publish time:
 * top = its average forecast for the day, bottom (with hindsight) = how far off it was. Shows how
 * much the picture moved before and after the gate, and why later runs are not always better.
 */
export function ForecastEvolutionChart({
  data,
  showActual,
}: {
  data: DayForecast;
  showActual: boolean;
}) {
  const { colors } = useTheme();
  const evo = data.evolution;
  const rows = useMemo(
    () => evo.runs.map((r) => ({ ...r, t: Date.parse(r.publish_time) })),
    [evo.runs],
  );
  if (!rows.length) return null;

  const dayStart = Date.parse(`${data.delivery_day}T00:00:00Z`);
  const domain: [number, number] = [dayStart - 48 * HOUR, dayStart];
  const ticks = Array.from({ length: 9 }, (_, i) => domain[0] + i * 6 * HOUR);
  const cutoff = data.cutoff.utc ? Date.parse(data.cutoff.utc) : null;
  const scale = niceScale(
    rows
      .map((r) => r.mean_forecast_mw)
      .concat(showActual && evo.actual_mean_mw ? [evo.actual_mean_mw] : []),
    { zero: false },
  );
  const maeScale = niceScale(rows.map((r) => r.mae_mw));
  const window = `${fmtTime(evo.first_hour!)} to ${fmtTime(
    new Date(Date.parse(evo.last_hour!) + HOUR).toISOString(),
  )}`;
  const tickFmt = (t: number) => {
    const iso = new Date(t).toISOString();
    return fmtTime(iso) === "00:00" ? fmtDayShort(iso) : fmtTime(iso);
  };

  const tooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: readonly { payload?: unknown }[];
  }) => {
    const r = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
    if (!r) return null;
    return (
      <TooltipCard
        title={`Run published ${fmtDayShort(r.publish_time)} ${fmtTime(r.publish_time)} UK`}
        rows={[
          {
            key: "m",
            label: `average forecast, ${window}`,
            value: fmtMW(r.mean_forecast_mw),
            color: statusColor(r.status, colors),
          },
          ...(showActual && r.mae_mw !== null
            ? [{ key: "e", label: "MAE vs actual", value: fmtMW(r.mae_mw) }]
            : []),
        ]}
        footer={`${statusLabel(r.status)} · ${fmtHours(r.lead_h)} before delivery starts`}
      />
    );
  };

  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={domain}
      ticks={ticks}
      tickFormatter={tickFmt}
      {...axisProps}
    />
  );
  const gate =
    cutoff !== null ? (
      <ReferenceArea x1={cutoff} x2={domain[1]} fill={colors.later} fillOpacity={0.18} />
    ) : null;
  const gateLine =
    cutoff !== null ? (
      <ReferenceLine
        x={cutoff}
        stroke={colors.ink}
        strokeWidth={1.5}
        label={{
          value: `Gate ${data.cutoff.time}`,
          position: "insideTopLeft",
          fill: colors.ink,
          fontSize: 11,
          fontWeight: 600,
        }}
      />
    ) : null;

  return (
    <div>
      <Legend
        items={[
          { label: "Run used for the decision", color: colors.forecast, shape: "box" },
          { label: "Older runs", color: colors.neutral, shape: "box" },
          { label: "Runs after the gate (not available)", color: colors.later, shape: "box" },
          ...(showActual ? [{ label: "What wind actually did", color: colors.actual }] : []),
        ]}
      />
      <div className="h-[230px] px-2 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 24, right: 20, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            {gate}
            {xAxis}
            <YAxis {...gwYAxis(scale, colors.muted)} />
            <Tooltip cursor={{ stroke: colors.baseline, strokeWidth: 1 }} content={tooltip} />
            {showActual && evo.actual_mean_mw !== null && (
              <ReferenceLine
                y={evo.actual_mean_mw}
                stroke={colors.actual}
                strokeWidth={2}
                label={{
                  value: `Actual ${fmtMW(evo.actual_mean_mw)}`,
                  position: "insideBottomLeft",
                  fill: colors.ink,
                  fontSize: 11,
                }}
              />
            )}
            {gateLine}
            <Line
              dataKey="mean_forecast_mw"
              type="linear"
              stroke={colors.baseline}
              strokeWidth={1.5}
              isAnimationActive={false}
              dot={(p: {
                cx?: number;
                cy?: number;
                payload?: (typeof rows)[number];
                index?: number;
              }) => (
                <circle
                  key={p.index}
                  cx={p.cx}
                  cy={p.cy}
                  r={p.payload?.status === "used" ? 6 : 4.5}
                  fill={p.payload ? statusColor(p.payload.status, colors) : colors.muted}
                  stroke={colors.surface}
                  strokeWidth={2}
                />
              )}
              activeDot={{ r: 6, stroke: colors.surface, strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {showActual && (
        <>
          <div className="px-5 pt-1 text-[12px] font-medium text-ink-2">
            How far off each run was for this day (MAE)
          </div>
          <div className="h-[140px] px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 20, bottom: 4, left: 4 }}>
                <CartesianGrid vertical={false} stroke={colors.grid} />
                {gate}
                {xAxis}
                <YAxis {...gwYAxis(maeScale, colors.muted)} label={undefined} />
                <Tooltip cursor={{ fill: colors.grid, opacity: 0.4 }} content={tooltip} />
                {gateLine}
                <Bar dataKey="mae_mw" barSize={10} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {rows.map((r) => (
                    <Cell key={r.publish_time} fill={statusColor(r.status, colors)} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <p className="px-5 pb-4 text-[12px] text-muted">
        Each dot is one forecast run. Runs are compared on {window} UK, the {evo.hours} hours that
        every run covers (runs published two days ahead stop at 21:00).
      </p>
    </div>
  );
}
