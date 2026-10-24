import { useMemo, useState } from "react";

import type { Accuracy } from "../../api/types";
import { fmtDateShort, fmtMW } from "../../lib/format";
import { useTheme } from "../../lib/theme";
import { TooltipCard } from "./common";

interface Cell {
  day: string;
  hour: number;
  forecast: number | null;
  actual: number | null;
  error: number | null;
}

interface Hover {
  cell: Cell;
  x: number;
  y: number;
  w: number;
}

/** Hex colour + alpha -> rgba(). */
function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`;
}

/**
 * Every scored hour of the period as one cell: rows = hour of day (UK), columns = delivery day.
 * Diverging encoding around zero: red = shortfall, neutral grey = surplus, intensity = size.
 * The colour scale is capped at the 98th percentile of |error| so one extreme hour can't wash
 * out the rest. Click a cell to open that day.
 */
export function ErrorHeatmap({ data, onPick }: { data: Accuracy; onPick: (day: string) => void }) {
  const { colors } = useTheme();
  const [hover, setHover] = useState<Hover | null>(null);

  const { days, grid, cap } = useMemo(() => {
    const grid = new Map<string, Cell>();
    const days: string[] = [];
    for (const p of data.series) {
      const d = new Date(p.start_time);
      const day = p.start_time.slice(0, 10);
      if (!days.includes(day)) days.push(day);
      const hour = d.getUTCHours(); // January: UK time = UTC
      grid.set(`${day}|${hour}`, {
        day,
        hour,
        forecast: p.forecast_mw,
        actual: p.actual_mw,
        error: p.error_mw,
      });
    }
    const abs = data.series
      .map((p) => (p.error_mw === null ? null : Math.abs(p.error_mw)))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const cap = abs.length ? abs[Math.floor(0.98 * (abs.length - 1))] : 1;
    return { days, grid, cap: Math.max(cap, 1) };
  }, [data.series]);

  const fill = (e: number | null) => {
    if (e === null) return "transparent";
    const t = Math.min(1, Math.abs(e) / cap);
    return e >= 0 ? rgba(colors.short, 0.06 + 0.94 * t) : rgba(colors.neutral, 0.06 + 0.84 * t);
  };

  const capGW = Math.round(cap / 1000);
  return (
    <div className="px-5 pb-5 pt-3">
      <div
        className="relative overflow-x-auto"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Hourly forecast error for ${days.length} delivery days. Red cells are hours where wind fell short of the forecast.`}
      >
        <div
          className="grid min-w-[640px] gap-px"
          style={{ gridTemplateColumns: `2.25rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div />
          {days.map((d, i) => (
            <div
              key={d}
              className="pb-1 text-center text-[10px] tabular text-muted"
              title={fmtDateShort(d)}
            >
              {i === 0 || d.endsWith("-01") || Number(d.slice(8)) % 7 === 2 ? (
                <span className="font-medium text-ink-2">
                  {Number(d.slice(8))}
                  {d.slice(5, 7) === "02" ? " Feb" : i === 0 ? " Jan" : ""}
                </span>
              ) : (
                Number(d.slice(8))
              )}
            </div>
          ))}
          {Array.from({ length: 24 }, (_, hour) => (
            <Row
              key={hour}
              hour={hour}
              days={days}
              grid={grid}
              fill={fill}
              onPick={onPick}
              onHover={setHover}
            />
          ))}
        </div>
        {hover && (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              left: hover.x > hover.w - 260 ? hover.x - 250 : hover.x + 14,
              top: hover.y + 14,
            }}
          >
            <TooltipCard
              title={`${fmtDateShort(hover.cell.day)}, ${String(hover.cell.hour).padStart(2, "0")}:00 UK`}
              rows={[
                {
                  key: "f",
                  label: "forecast",
                  value: fmtMW(hover.cell.forecast),
                  color: colors.forecast,
                },
                {
                  key: "a",
                  label: "actual",
                  value: fmtMW(hover.cell.actual),
                  color: colors.actual,
                },
              ]}
              footer={
                hover.cell.error === null
                  ? "Not scored (missing data)"
                  : `${fmtMW(Math.abs(hover.cell.error))} ${hover.cell.error >= 0 ? "shortfall" : "surplus"} · click to open the day`
              }
            />
          </div>
        )}
      </div>
      <ScaleLegend capGW={capGW} colors={{ short: colors.short, neutral: colors.neutral }} />
    </div>
  );
}

function Row({
  hour,
  days,
  grid,
  fill,
  onPick,
  onHover,
}: {
  hour: number;
  days: string[];
  grid: Map<string, Cell>;
  fill: (e: number | null) => string;
  onPick: (day: string) => void;
  onHover: (h: Hover | null) => void;
}) {
  return (
    <>
      <div className="pr-1.5 text-right text-[10px] leading-[14px] tabular text-muted">
        {hour % 3 === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
      </div>
      {days.map((day) => {
        const cell = grid.get(`${day}|${hour}`);
        return (
          <button
            key={day}
            type="button"
            aria-label={
              cell?.error != null
                ? `${day} ${hour}:00, error ${fmtMW(cell.error, { signed: true })}`
                : `${day} ${hour}:00, no data`
            }
            onClick={() => onPick(day)}
            onMouseMove={(e) => {
              if (!cell) return;
              const box = (
                e.currentTarget.closest("[role=img]") as HTMLElement
              ).getBoundingClientRect();
              onHover({ cell, x: e.clientX - box.left, y: e.clientY - box.top, w: box.width });
            }}
            className="h-[14px] rounded-[2px] outline-none ring-ink/40 hover:ring-2 focus-visible:ring-2"
            style={{
              background: fill(cell?.error ?? null),
              backgroundImage:
                cell?.error == null
                  ? "repeating-linear-gradient(45deg, transparent 0 3px, rgba(127,127,127,.25) 3px 4px)"
                  : undefined,
            }}
          />
        );
      })}
    </>
  );
}

function ScaleLegend({
  capGW,
  colors,
}: {
  capGW: number;
  colors: { short: string; neutral: string };
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-[11.5px] text-muted">
      <span>Surplus</span>
      <div
        className="h-2.5 w-56 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${rgba(colors.neutral, 0.9)}, ${rgba(colors.neutral, 0.06)} 50%, ${rgba(colors.short, 0.06)} 50%, ${rgba(colors.short, 1)})`,
        }}
      />
      <span>Shortfall</span>
      <span className="tabular">scale ±{capGW} GW (98th percentile); hatched = not scored</span>
    </div>
  );
}
