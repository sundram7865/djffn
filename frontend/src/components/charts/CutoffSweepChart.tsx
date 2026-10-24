import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CutoffSweep } from "../../api/types";
import { niceScale } from "../../lib/axis";
import { fmtMW } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps, gwYAxis } from "./common";

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** MAE and the 9-in-10 buffer for every cutoff time on D-1. Click a point to adopt that cutoff. */
export function CutoffSweepChart({
  data,
  cutoff,
  onSelect,
}: {
  data: CutoffSweep;
  cutoff: string;
  onSelect: (time: string) => void;
}) {
  const { colors } = useTheme();
  const rows = data.points.map((p) => ({ ...p, m: minutes(p.time) }));
  const presetTimes = new Set(data.presets.map((p) => p.time));
  const scale = niceScale(rows.flatMap((r) => [r.mae_mw, r.buffer_p90_mw]));
  // Put a gate label on the left of its line when the next gate is close, so labels never collide.
  const sortedPresets = [...data.presets].sort((a, b) => minutes(a.time) - minutes(b.time));
  const labelSide = (i: number) =>
    i < sortedPresets.length - 1 &&
    minutes(sortedPresets[i + 1].time) - minutes(sortedPresets[i].time) < 120
      ? ("insideTopRight" as const)
      : ("insideTopLeft" as const);

  return (
    <div>
      <Legend
        items={[
          { label: "MAE", color: colors.forecast },
          { label: "9-in-10 shortfall buffer", color: colors.secondary },
          { label: "Gate closures (presets)", color: colors.muted },
          { label: "Your cutoff", color: colors.ink },
        ]}
      />
      <div className="h-[280px] px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 24, right: 24, bottom: 4, left: 4 }}
            onClick={(e) => {
              const idx = e?.activeTooltipIndex;
              if (typeof idx === "number" && rows[idx]) onSelect(rows[idx].time);
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="m"
              type="number"
              domain={[0, 24 * 60]}
              ticks={[0, 180, 360, 540, 720, 900, 1080, 1260, 1440]}
              tickFormatter={(m: number) =>
                `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:00`
              }
              {...axisProps}
            />
            <YAxis {...gwYAxis(scale, colors.muted)} />
            <Tooltip
              cursor={{ stroke: colors.baseline, strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = active
                  ? (payload?.[0]?.payload as (typeof rows)[number] | undefined)
                  : undefined;
                if (!p) return null;
                const preset = data.presets.find((x) => x.time === p.time);
                return (
                  <TooltipCard
                    title={`Decide at ${p.time} on D-1${preset ? ` · ${preset.label}` : ""}`}
                    rows={[
                      { key: "m", label: "MAE", value: fmtMW(p.mae_mw), color: colors.forecast },
                      {
                        key: "b",
                        label: "9-in-10 buffer",
                        value: fmtMW(p.buffer_p90_mw),
                        color: colors.secondary,
                      },
                      { key: "r", label: "run used (UTC)", value: p.run_time ?? "–" },
                    ]}
                    footer={
                      p.n < (rows[rows.length - 1]?.n ?? p.n)
                        ? `${p.n} hours covered: early runs miss the last hours of D`
                        : "Click to use this cutoff"
                    }
                  />
                );
              }}
            />
            {sortedPresets.map((p, i) => (
              <ReferenceLine
                key={p.id}
                x={minutes(p.time)}
                stroke={colors.muted}
                strokeOpacity={0.6}
                label={{
                  value: p.time,
                  position: labelSide(i),
                  fill: p.time === cutoff ? colors.ink : colors.muted,
                  fontSize: 10.5,
                  fontWeight: p.time === cutoff ? 600 : 400,
                }}
              />
            ))}
            <ReferenceLine
              x={minutes(cutoff)}
              stroke={colors.ink}
              strokeWidth={1.5}
              label={
                presetTimes.has(cutoff)
                  ? undefined
                  : {
                      value: cutoff,
                      position: "insideTopLeft",
                      fill: colors.ink,
                      fontSize: 10.5,
                      fontWeight: 600,
                    }
              }
            />
            <Line
              dataKey="mae_mw"
              type="stepAfter"
              stroke={colors.forecast}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="buffer_p90_mw"
              type="stepAfter"
              stroke={colors.secondary}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
