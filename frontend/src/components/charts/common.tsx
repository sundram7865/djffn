import type { ReactNode } from "react";

import type { Scale } from "../../lib/axis";
import { fmtAxisGW } from "../../lib/format";

export interface TipRow {
  key: string;
  label: string;
  value: string;
  color?: string;
  shape?: "line" | "box" | "band";
}

/** Tooltip body: values lead (strong), series names follow; series keyed by a short line. */
export function TooltipCard({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: TipRow[];
  footer?: ReactNode;
}) {
  return (
    <div className="min-w-[12rem] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-1.5 font-medium text-ink-2">{title}</div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            {r.color && <Key color={r.color} shape={r.shape ?? "line"} />}
            <span className="font-semibold tabular text-ink">{r.value}</span>
            <span className="text-ink-2">{r.label}</span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 border-t border-line pt-1.5 text-ink-2">{footer}</div>}
    </div>
  );
}

export function Key({ color, shape = "line" }: { color: string; shape?: "line" | "box" | "band" }) {
  if (shape === "box")
    return <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />;
  if (shape === "band")
    return (
      <span
        className="inline-block h-2.5 w-3.5 rounded-sm"
        style={{ background: color, opacity: 0.35 }}
      />
    );
  return <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: color }} />;
}

/** Legend row above a chart: always present for 2+ series; text stays in ink tokens. */
export function Legend({
  items,
}: {
  items: { label: string; color: string; shape?: "line" | "box" | "band" }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-2 text-[12.5px] text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Key color={i.color} shape={i.shape} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

/** Y axis in GW with clean ticks and the unit printed once above the axis. */
export function gwYAxis(scale: Scale, muted: string) {
  return {
    domain: scale.domain,
    ticks: scale.ticks,
    tickFormatter: fmtAxisGW,
    width: 40,
    allowDataOverflow: false,
    label: { value: "GW", position: "top" as const, offset: 12, fill: muted, fontSize: 11 },
    ...axisProps,
  };
}
