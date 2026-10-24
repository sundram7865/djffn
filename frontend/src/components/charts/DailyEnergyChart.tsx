import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Accuracy } from "../../api/types";
import { niceScale } from "../../lib/axis";
import { fmtDateShort, fmtGWh } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps } from "./common";

/**
 * Energy gap per delivery day (forecast GWh minus actual GWh). Positive (red) = wind delivered
 * less energy than the forecast, so the day's position was short by that much.
 */
export function DailyEnergyChart({
  data,
  onPick,
}: {
  data: Accuracy;
  onPick: (day: string) => void;
}) {
  const { colors } = useTheme();
  const rows = data.daily_energy.map((d) => ({ ...d, label: String(Number(d.day.slice(8))) }));
  const scale = niceScale(rows.map((r) => r.error_mwh));
  const worst = rows.reduce<(typeof rows)[number] | null>(
    (w, r) => (!w || r.error_mwh > w.error_mwh ? r : w),
    null,
  );
  const e = data.energy;

  return (
    <div>
      <Legend
        items={[
          { label: "Short: wind below forecast", color: colors.short, shape: "box" },
          { label: "Long: wind above forecast", color: colors.neutral, shape: "box" },
        ]}
      />
      <div className="h-[280px] px-2 pb-1 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 24, right: 20, bottom: 4, left: 4 }}
            barCategoryGap={2}
            onClick={(s) => {
              const i = s?.activeTooltipIndex;
              if (typeof i === "number" && rows[i]) onPick(rows[i].day);
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis dataKey="label" interval={0} {...axisProps} tick={{ fontSize: 10 }} />
            <YAxis
              domain={scale.domain}
              ticks={scale.ticks}
              tickFormatter={(v: number) => `${Math.round(v / 1000)}`}
              width={40}
              label={{
                value: "GWh",
                position: "top",
                offset: 12,
                fill: colors.muted,
                fontSize: 11,
              }}
              {...axisProps}
            />
            <Tooltip
              cursor={{ fill: colors.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const r = active
                  ? (payload?.[0]?.payload as (typeof rows)[number] | undefined)
                  : undefined;
                if (!r) return null;
                return (
                  <TooltipCard
                    title={fmtDateShort(r.day)}
                    rows={[
                      {
                        key: "f",
                        label: "forecast",
                        value: fmtGWh(r.forecast_mwh),
                        color: colors.forecast,
                      },
                      {
                        key: "a",
                        label: "delivered",
                        value: fmtGWh(r.actual_mwh),
                        color: colors.actual,
                      },
                    ]}
                    footer={`${fmtGWh(Math.abs(r.error_mwh))} ${r.error_mwh > 0 ? "short" : "long"} (${Math.round((Math.abs(r.error_mwh) / r.actual_mwh) * 100)}% of delivered) · click to open`}
                  />
                );
              }}
            />
            <ReferenceLine y={0} stroke={colors.baseline} />
            <Bar
              dataKey="error_mwh"
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              label={{
                position: "top",
                fontSize: 10.5,
                fill: colors.ink,
                formatter: (v: unknown) =>
                  worst && v === worst.error_mwh ? `${Math.round(Number(v) / 1000)} GWh` : "",
              }}
            >
              {rows.map((r) => (
                <Cell key={r.day} fill={r.error_mwh > 0 ? colors.short : colors.neutral} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {e && (
        <p className="px-5 pb-4 text-[12.5px] text-ink-2">
          Over {e.days} days wind delivered <b className="text-ink">{fmtGWh(e.actual_mwh)}</b>{" "}
          against <b className="text-ink">{fmtGWh(e.forecast_mwh)}</b> forecast:{" "}
          <b className="text-short">
            {fmtGWh(Math.abs(e.error_mwh))} {e.error_mwh > 0 ? "short" : "long"}
          </b>{" "}
          ({Math.abs(e.error_pct ?? 0).toFixed(0)}%), short on {e.short_days} of {e.days} days.
          Energy uses both half-hours of every hour.
        </p>
      )}
    </div>
  );
}
