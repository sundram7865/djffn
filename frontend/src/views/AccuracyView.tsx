import clsx from "clsx";
import { TriangleAlert } from "lucide-react";

import { useAccuracy, useCutoffSweep, useHorizon } from "../api/hooks";
import type { CutoffSweep } from "../api/types";
import { ByBandChart, ByHourChart, HorizonChart } from "../components/charts/Breakdowns";
import { CutoffSweepChart } from "../components/charts/CutoffSweepChart";
import { DailyCalendar } from "../components/charts/DailyCalendar";
import { ErrorHistogram } from "../components/charts/ErrorHistogram";
import { ForecastVsActualChart } from "../components/charts/ForecastVsActualChart";
import { DataQualityPanel, InsightPanel } from "../components/panels";
import {
  Card,
  CardHeader,
  ChartOrTable,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  Skeleton,
  StatTile,
} from "../components/ui";
import { fmtDateShort, fmtMW, fmtPct, fmtShare } from "../lib/format";
import { glossary } from "../lib/glossary";

export function AccuracyView({
  start,
  end,
  cutoff,
  onCutoff,
  onOpenDay,
}: {
  start: string;
  end: string;
  cutoff: string;
  onCutoff: (c: string) => void;
  onOpenDay: (d: string) => void;
}) {
  const acc = useAccuracy(start, end, cutoff);
  const horizon = useHorizon(start, end);
  const sweep = useCutoffSweep(start, end);

  if (acc.isError && !acc.data)
    return <ErrorState error={acc.error} onRetry={() => acc.refetch()} />;
  const a = acc.data;
  const s = a?.summary;
  const dim = acc.isFetching;
  const loading = !s;

  if (a && a.summary.n === 0) {
    return (
      <EmptyState title="No scored hours in this range">
        Every hour in the selected range is missing either a forecast or an actual. Widen the range
        or choose a later cutoff.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {a ? <InsightPanel insights={a.insights} dimmed={dim} /> : <Skeleton className="h-36" />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          loading={loading}
          label="MAE"
          info={glossary.mae}
          value={s ? fmtMW(s.mae_mw) : ""}
          sub={s && `${fmtPct(s.wape_pct)} of wind output (WAPE)`}
        />
        <StatTile
          loading={loading}
          label="RMSE"
          info={glossary.rmse}
          value={s ? fmtMW(s.rmse_mw) : ""}
          sub={s && `${fmtPct(s.mae_pct_of_peak)} of peak output (MAE)`}
        />
        <StatTile
          loading={loading}
          tone="short"
          label="Bias"
          info={glossary.bias}
          value={s ? fmtMW(s.bias_mw, { signed: true }) : ""}
          sub={
            s && (s.bias_mw > 0 ? "forecast too high on average" : "forecast too low on average")
          }
        />
        <StatTile
          loading={loading}
          tone="short"
          label="Hours short"
          info={glossary.shortfallShare}
          value={s ? fmtShare(s.shortfall_share) : ""}
          sub={s && `avg shortfall ${fmtMW(s.shortfall_mean_mw)}`}
        />
        <StatTile
          loading={loading}
          tone="accent"
          label="9-in-10 buffer"
          info={glossary.buffer}
          value={s ? fmtMW(s.buffer_p90_mw) : ""}
          sub={s && `1 in 20: ${fmtMW(s.buffer_p95_mw)}`}
        />
        <StatTile
          loading={loading}
          label="P95 |error|"
          info={glossary.p95}
          value={s ? fmtMW(s.abs_pcts.p95) : ""}
          sub={
            s && (
              <span className="inline-flex items-center gap-1" title={glossary.mape}>
                <TriangleAlert size={12} className="text-warn" /> MAPE {fmtPct(s.mape_pct)}{" "}
                (unreliable)
              </span>
            )
          }
        />
      </div>

      <Card>
        <CardHeader
          title="Forecast vs actual"
          subtitle={
            a
              ? `${a.range.days} delivery days · forecast as available at ${a.cutoff.time} UK on D-1 · drag the handles below to zoom`
              : "Loading…"
          }
          info={glossary.cutoff}
        />
        {a ? (
          <div className={clsx("transition-opacity", dim && "opacity-50")}>
            <ForecastVsActualChart data={a} />
          </div>
        ) : (
          <ChartSkeleton height={380} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="How big are the misses?"
            subtitle="Distribution of hourly error. Right of zero, wind fell short of the forecast."
            info={glossary.buffer}
          />
          {a && s ? (
            <ChartOrTable
              dimmed={dim}
              chart={<ErrorHistogram data={a} />}
              table={{
                columns: ["Percentile", "Signed error (f − a)", "Absolute error"],
                rows: (["p50", "p90", "p95", "p99"] as const)
                  .map((p) => [
                    p.toUpperCase(),
                    fmtMW(s.signed_pcts[p], { signed: true }),
                    fmtMW(s.abs_pcts[p]),
                  ])
                  .concat([
                    ["P10", fmtMW(s.signed_pcts.p10, { signed: true }), "–"],
                    ["P5", fmtMW(s.signed_pcts.p5, { signed: true }), "–"],
                  ]),
              }}
            />
          ) : (
            <ChartSkeleton />
          )}
        </Card>
        <Card>
          <CardHeader
            title="Error by hour of day"
            subtitle="When in the day the forecast misses most (UK time)"
            info={glossary.mae}
          />
          {a ? (
            <ChartOrTable
              dimmed={dim}
              chart={<ByHourChart rows={a.by_hour} />}
              table={{
                columns: ["Hour (UK)", "MAE", "Bias", "9-in-10 buffer", "Hours"],
                rows: a.by_hour.map((r) => [
                  `${String(r.key).padStart(2, "0")}:00`,
                  fmtMW(r.mae_mw),
                  fmtMW(r.bias_mw, { signed: true }),
                  fmtMW(Math.max(0, r.p90_signed_mw)),
                  r.n,
                ]),
              }}
            />
          ) : (
            <ChartSkeleton height={260} />
          )}
        </Card>
        <Card>
          <CardHeader
            title="Error by wind level"
            subtitle="Grouped by the forecast level, which is what you know when you buy"
            info={glossary.bias}
          />
          {a ? (
            <ChartOrTable
              dimmed={dim}
              chart={<ByBandChart rows={a.by_band} />}
              table={{
                columns: ["Forecast level", "MAE", "Bias", "9-in-10 buffer", "Hours"],
                rows: a.by_band.map((r) => [
                  r.label ?? String(r.key),
                  fmtMW(r.mae_mw),
                  fmtMW(r.bias_mw, { signed: true }),
                  fmtMW(Math.max(0, r.p90_signed_mw)),
                  r.n,
                ]),
              }}
            />
          ) : (
            <ChartSkeleton height={260} />
          )}
        </Card>
        <Card>
          <CardHeader
            title="Error vs forecast age"
            subtitle={
              a?.horizon_range_h
                ? `All forecast versions. Your ${a.cutoff.time} cutoff uses forecasts ${a.horizon_range_h[0]}–${a.horizon_range_h[1]} h ahead.`
                : "All forecast versions"
            }
            info={glossary.horizon}
          />
          {horizon.data ? (
            <ChartOrTable
              dimmed={horizon.isFetching}
              chart={<HorizonChart data={horizon.data} used={a?.horizon_range_h ?? null} />}
              table={{
                columns: ["Forecast age", "MAE", "Bias", "Pairs", "Coverage"],
                rows: horizon.data.buckets.map((b) => [
                  b.label,
                  fmtMW(b.mae_mw),
                  fmtMW(b.bias_mw, { signed: true }),
                  b.n,
                  b.low_coverage ? "low" : "full",
                ]),
              }}
            />
          ) : horizon.isError ? (
            <ErrorState error={horizon.error} onRetry={() => horizon.refetch()} />
          ) : (
            <ChartSkeleton height={260} />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Compare cutoff choices"
          subtitle="Accuracy if the decision were locked in at each time on D-1. Click the chart or a row to switch cutoff."
          info={glossary.cutoff}
        />
        {sweep.data ? (
          <div
            className={clsx(
              "grid gap-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
              sweep.isFetching && "opacity-50",
            )}
          >
            <CutoffSweepChart data={sweep.data} cutoff={cutoff} onSelect={onCutoff} />
            <PresetTable sweep={sweep.data} cutoff={cutoff} onSelect={onCutoff} />
          </div>
        ) : sweep.isError ? (
          <ErrorState error={sweep.error} onRetry={() => sweep.refetch()} />
        ) : (
          <ChartSkeleton height={280} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Daily accuracy"
            subtitle="MAE per delivery day (GW). Click a day to see that day's forecast."
          />
          {a ? (
            <DailyCalendar rows={a.by_day} onPick={onOpenDay} />
          ) : (
            <ChartSkeleton height={260} />
          )}
        </Card>
        {a ? <DataQualityPanel dq={a.data_quality} /> : <Skeleton className="h-60" />}
      </div>
    </div>
  );
}

function PresetTable({
  sweep,
  cutoff,
  onSelect,
}: {
  sweep: CutoffSweep;
  cutoff: string;
  onSelect: (t: string) => void;
}) {
  const current = sweep.points.find((p) => p.time === cutoff);
  const rows = [...sweep.presets];
  const isPreset = rows.some((p) => p.time === cutoff);
  return (
    <div className="px-5 pb-5 pt-2">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-ink-2">
            <th className="py-2 text-left font-medium">Gate (D-1, UK)</th>
            <th className="py-2 text-right font-medium">Run used</th>
            <th className="py-2 text-right font-medium">MAE</th>
            <th className="py-2 text-right font-medium">Bias</th>
            <th className="py-2 text-right font-medium">Buffer</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((p) => (
            <tr
              key={p.id}
              onClick={() => onSelect(p.time)}
              className={clsx(
                "cursor-pointer border-b border-line/60 hover:bg-surface-2",
                p.time === cutoff && "bg-accent-soft",
              )}
            >
              <td className="py-2">
                <div className="font-semibold text-ink">{p.time}</div>
                <div className="text-[11.5px] text-ink-2">{p.label}</div>
              </td>
              <td className="py-2 text-right text-ink-2">{p.run_time}</td>
              <td className="py-2 text-right text-ink">{fmtMW(p.mae_mw)}</td>
              <td className="py-2 text-right text-ink">{fmtMW(p.bias_mw, { signed: true })}</td>
              <td className="py-2 text-right text-ink">{fmtMW(p.buffer_p90_mw)}</td>
            </tr>
          ))}
          {!isPreset && current && (
            <tr className="bg-accent-soft">
              <td className="py-2">
                <div className="font-semibold text-ink">{current.time}</div>
                <div className="text-[11.5px] text-ink-2">Custom cutoff</div>
              </td>
              <td className="py-2 text-right text-ink-2">{current.run_time}</td>
              <td className="py-2 text-right text-ink">{fmtMW(current.mae_mw)}</td>
              <td className="py-2 text-right text-ink">
                {fmtMW(current.bias_mw, { signed: true })}
              </td>
              <td className="py-2 text-right text-ink">{fmtMW(current.buffer_p90_mw)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-[12px] text-muted">
        Run times are UTC (= UK time in January). Delivery days {fmtDateShort(sweep.range.start)} –{" "}
        {fmtDateShort(sweep.range.end)}. Buffer = 9-in-10 shortfall.
      </p>
    </div>
  );
}
