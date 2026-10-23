import clsx from "clsx";
import { Eye, EyeOff, Hourglass, ShieldCheck, Wind } from "lucide-react";
import { useMemo, useState } from "react";

import { useDayForecast } from "../api/hooks";
import type { DayForecast } from "../api/types";
import { DayForecastChart } from "../components/charts/DayForecastChart";
import { RunTimeline, RunVersionsChart } from "../components/charts/RunVersionsChart";
import { DataQualityPanel } from "../components/panels";
import {
  Card,
  CardHeader,
  ChartOrTable,
  ChartSkeleton,
  ErrorState,
  Pill,
  Skeleton,
  StatTile,
} from "../components/ui";
import {
  fmtDateLong,
  fmtDayShort,
  fmtGWh,
  fmtHours,
  fmtMW,
  fmtShare,
  fmtTime,
} from "../lib/format";
import { glossary } from "../lib/glossary";

export function ForecastView({ day, cutoff }: { day: string; cutoff: string }) {
  const q = useDayForecast(day, cutoff);
  const [reveal, setReveal] = useState(false);

  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const data = q.data;
  const fetching = q.isFetching;

  return (
    <div className="flex flex-col gap-4">
      <Hero data={data} day={day} dimmed={fetching} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpis data={data} />
      </div>

      <Card>
        <CardHeader
          title="Hourly wind forecast for the delivery day"
          subtitle="Forecast as it stood at the cutoff, with the range actual wind fell within in 8 of 10 comparable hours"
          info={glossary.planningRange}
          actions={
            <button
              type="button"
              aria-pressed={reveal}
              onClick={() => setReveal((r) => !r)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                reveal
                  ? "border-ink bg-ink text-surface"
                  : "border-line bg-surface text-ink hover:bg-surface-2",
              )}
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
              {reveal ? "Hide actual" : "Reveal what actually happened"}
            </button>
          }
        />
        {data ? (
          <div className={clsx("transition-opacity", fetching && "opacity-50")}>
            <DayForecastChart data={data} showActual={reveal} />
          </div>
        ) : (
          <ChartSkeleton height={340} />
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader
            title="Why this forecast?"
            subtitle="Every forecast run published on the decision day, against the gate. Only runs before the gate were available."
          />
          {data ? (
            <ChartOrTable
              dimmed={fetching}
              chart={
                <>
                  <RunTimeline data={data} />
                  <RunVersionsChart data={data} showActual={reveal} />
                </>
              }
              table={{
                columns: [
                  "Run published (UK)",
                  "Status",
                  "Mean forecast",
                  ...(reveal ? ["MAE vs actual"] : []),
                ],
                rows: data.run_timeline.map((r) => [
                  `${fmtDayShort(r.publish_time)} ${fmtTime(r.publish_time)}`,
                  r.status === "used"
                    ? "Used"
                    : r.status === "superseded"
                      ? "Superseded"
                      : "After gate",
                  fmtMW(r.values.reduce((s, v) => s + v.forecast_mw, 0) / r.values.length),
                  ...(reveal ? [fmtMW(r.mae_mw)] : []),
                ]),
              }}
            />
          ) : (
            <ChartSkeleton height={300} />
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {data ? <PositionGuidance data={data} /> : <Skeleton className="h-48" />}
          {reveal && data?.outcome && <Outcome data={data} />}
          {data && <DataQualityPanel dq={data.data_quality} compact />}
        </div>
      </div>
    </div>
  );
}

function Hero({ data, day, dimmed }: { data?: DayForecast; day: string; dimmed: boolean }) {
  const run = data?.runs_used[0];
  const k = data && "peak_mw" in data.kpis ? data.kpis : null;
  return (
    <Card className={clsx("overflow-hidden transition-opacity", dimmed && "opacity-70")}>
      <div className="flex flex-col gap-4 bg-gradient-to-r from-accent-soft to-transparent px-6 py-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wide text-accent">
            <Wind size={15} /> Wind expected for delivery on
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-ink">
            {fmtDateLong(day)}
          </h1>
          {k ? (
            <p className="mt-1 text-[15px] text-ink-2">
              <span className="text-[34px] font-semibold tracking-tight text-ink">
                {fmtGWh(k.total_mwh)}
              </span>{" "}
              forecast · {fmtMW(k.mean_mw)} on average
            </p>
          ) : (
            <Skeleton className="mt-2 h-10 w-72" />
          )}
        </div>
        <div className="max-w-md rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">
          {run && data ? (
            <>
              <div className="flex items-center gap-1.5 font-semibold text-ink">
                <Hourglass size={14} className="text-accent" /> Based on the forecast published{" "}
                {fmtDayShort(run.publish_time)}, {fmtTime(run.publish_time)} UK
              </div>
              <p className="mt-1">
                {fmtHours(run.age_at_cutoff_h)} before the {data.cutoff.time} gate on D-1 (
                {data.cutoff.preset_label}).
                {data.runs_used.length > 1 &&
                  ` ${data.runs_used.length} runs combined to fill gaps.`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone="accent">Cutoff {data.cutoff.time} UK, D-1</Pill>
                <Pill>
                  {data.data_quality.forecast_hours}/{data.data_quality.expected_hours} hours
                  forecast
                </Pill>
                {data.data_quality.status === "warning" && <Pill tone="warn">Data warnings</Pill>}
              </div>
            </>
          ) : data ? (
            <span>No forecast had been published before this cutoff.</span>
          ) : (
            <Skeleton className="h-16 w-72" />
          )}
        </div>
      </div>
    </Card>
  );
}

function Kpis({ data }: { data?: DayForecast }) {
  const k = data && "peak_mw" in data.kpis ? data.kpis : null;
  const loading = !k;
  return (
    <>
      <StatTile
        loading={loading}
        label="Peak"
        value={k ? fmtMW(k.peak_mw) : ""}
        sub={k && `at ${fmtTime(k.peak_time)} UK`}
      />
      <StatTile
        loading={loading}
        label="Minimum"
        value={k ? fmtMW(k.min_mw) : ""}
        sub={k && `at ${fmtTime(k.min_time)} UK`}
      />
      <StatTile
        loading={loading}
        label="Average"
        value={k ? fmtMW(k.mean_mw) : ""}
        sub={k && `over ${k.hours} hours`}
      />
      <StatTile
        loading={loading}
        tone="accent"
        label="Total energy"
        value={k ? fmtGWh(k.total_mwh) : ""}
        sub="forecast for the day"
      />
      <StatTile
        loading={loading}
        label="Firm wind (9 in 10)"
        info={glossary.firm}
        value={k ? fmtGWh(k.firm_total_mwh) : ""}
        sub={k && `${fmtShare(k.firm_total_mwh / k.total_mwh)} of the forecast`}
      />
    </>
  );
}

function PositionGuidance({ data }: { data: DayForecast }) {
  const g = useMemo(() => {
    const pts = data.points.filter((p) => p.forecast_mw !== null && p.range_low_mw !== null);
    if (!pts.length) return null;
    const cover = pts.map((p) => ({ t: p.start_time, mw: p.forecast_mw! - p.range_low_mw! }));
    const avg = cover.reduce((s, c) => s + c.mw, 0) / cover.length;
    const max = cover.reduce((a, b) => (b.mw > a.mw ? b : a));
    const bands = new Map(data.planning_range.bands.map((b) => [b.band, b]));
    const counts = pts.reduce<Record<string, number>>((acc, p) => {
      acc[p.band ?? "?"] = (acc[p.band ?? "?"] ?? 0) + 1;
      return acc;
    }, {});
    return { avg, max, cover, bands, counts, energy: cover.reduce((s, c) => s + c.mw, 0) };
  }, [data]);

  if (!g) return null;
  return (
    <Card>
      <CardHeader title="Position guidance" info={glossary.buffer} />
      <div className="space-y-3 px-5 pb-5 pt-3 text-[13.5px] text-ink-2">
        <div className="flex gap-2.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
          <p>
            To be covered in 9 of 10 hours, plan for wind to deliver{" "}
            <b className="text-ink">{fmtMW(g.avg)} less than forecast</b> on average,{" "}
            <b className="text-ink">{fmtGWh(g.energy)}</b> over the day. The largest gap is{" "}
            <b className="text-ink">{fmtMW(g.max.mw)}</b> at {fmtTime(g.max.t)} UK.
          </p>
        </div>
        <ul className="space-y-1.5 rounded-lg bg-surface-2 px-3 py-2.5 text-[12.5px]">
          {data.planning_range.bands
            .filter((b) => g.counts[b.band])
            .map((b) => (
              <li key={b.band} className="flex justify-between gap-3">
                <span>
                  {b.label} · {g.counts[b.band]} h
                </span>
                <span className="tabular text-ink">
                  buffer {fmtMW(Math.max(0, b.error_high_mw))}
                  <span className="text-muted"> (n={b.n})</span>
                </span>
              </li>
            ))}
        </ul>
        <p className="text-[12px] text-muted">{data.planning_range.method}</p>
      </div>
    </Card>
  );
}

function Outcome({ data }: { data: DayForecast }) {
  const o = data.outcome!;
  const diff = (o.forecast_total_mwh ?? 0) - o.actual_total_mwh;
  return (
    <Card>
      <CardHeader
        title="What actually happened"
        subtitle="Hindsight only: this was not known at the cutoff"
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-5 pt-3 text-[13px]">
        <div>
          <dt className="text-ink-2">Wind delivered</dt>
          <dd className="text-lg font-semibold text-ink">{fmtGWh(o.actual_total_mwh)}</dd>
        </div>
        <div>
          <dt className="text-ink-2">
            {diff >= 0 ? "Shortfall vs forecast" : "Surplus vs forecast"}
          </dt>
          <dd className={clsx("text-lg font-semibold", diff >= 0 ? "text-short" : "text-ink")}>
            {fmtGWh(Math.abs(diff))}
          </dd>
        </div>
        <div>
          <dt className="text-ink-2">Typical hourly miss (MAE)</dt>
          <dd className="text-lg font-semibold text-ink">{fmtMW(o.mae_mw)}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Hours inside planning range</dt>
          <dd className="text-lg font-semibold text-ink">{fmtShare(o.within_range_share)}</dd>
        </div>
      </dl>
    </Card>
  );
}
