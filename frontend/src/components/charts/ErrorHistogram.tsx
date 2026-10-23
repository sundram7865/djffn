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
import { fmtAxisGW, fmtMW, fmtShare } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { Legend, TooltipCard, axisProps } from "./common";

/** Distribution of signed error. Right of zero = shortfall (red), left = surplus (grey). */
export function ErrorHistogram({ data }: { data: Accuracy }) {
  const { colors } = useTheme();
  const n = data.summary.n;
  const rows = data.histogram.map((b) => ({ ...b, mid: (b.lo_mw + b.hi_mw) / 2 }));
  const binW = rows.length ? rows[0].hi_mw - rows[0].lo_mw : 500;
  const buffer = data.summary.buffer_p90_mw;
  const bias = data.summary.bias_mw;
  const xScale = niceScale([rows[0]?.lo_mw, rows[rows.length - 1]?.hi_mw], { target: 8 });

  return (
    <div>
      <Legend
        items={[
          { label: "Shortfall hours", color: colors.short, shape: "box" },
          { label: "Surplus hours", color: colors.surplus, shape: "box" },
          { label: "9-in-10 buffer (P90)", color: colors.ink },
        ]}
      />
      <div className="h-[280px] px-2 pb-3 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 22, right: 20, bottom: 18, left: 4 }}
            barCategoryGap={2}
          >
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="mid"
              type="number"
              domain={xScale.domain}
              ticks={xScale.ticks}
              tickFormatter={fmtAxisGW}
              label={{
                value: "Forecast − actual (GW)  ·  ← surplus | shortfall →",
                position: "bottom",
                offset: 2,
                fill: colors.muted,
                fontSize: 11,
              }}
              {...axisProps}
            />
            <YAxis width={36} allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ fill: colors.grid, opacity: 0.5 }}
              content={({ active, payload }) => {
                const b = active
                  ? (payload?.[0]?.payload as (typeof rows)[number] | undefined)
                  : undefined;
                if (!b) return null;
                return (
                  <TooltipCard
                    title={`${fmtMW(b.lo_mw, { signed: true })} to ${fmtMW(b.hi_mw, { signed: true })}`}
                    rows={[
                      { key: "c", label: "hours", value: String(b.count) },
                      { key: "s", label: "of scored hours", value: fmtShare(b.count / n, 1) },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="count"
              barSize={Math.max(4, Math.min(24, 600 / Math.max(rows.length, 1)))}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              {rows.map((b) => (
                <Cell key={b.lo_mw} fill={b.lo_mw >= 0 ? colors.short : colors.surplus} />
              ))}
            </Bar>
            <ReferenceLine x={0} stroke={colors.baseline} />
            <ReferenceLine
              x={buffer}
              stroke={colors.ink}
              strokeWidth={1.5}
              label={{
                value: `P90 ${fmtMW(buffer)}`,
                position: "top",
                fill: colors.ink,
                fontSize: 11,
              }}
            />
            <ReferenceLine
              x={bias}
              stroke={colors.muted}
              label={{
                value: `mean ${fmtMW(bias, { signed: true })}`,
                position: "insideTopLeft",
                fill: colors.muted,
                fontSize: 11,
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="px-5 pb-4 text-[12px] text-muted">
        Bin width {fmtMW(binW)} · {n} scored hours
      </p>
    </div>
  );
}
