import clsx from "clsx";
import {
  BookOpen,
  CircleAlert,
  CircleCheck,
  Info,
  Lightbulb,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";

import type { DataQuality, Insights, Meta } from "../api/types";
import { fmtDayTime } from "../lib/format";
import { Card, CardHeader } from "./ui";

export function InsightPanel({ insights, dimmed }: { insights: Insights; dimmed?: boolean }) {
  return (
    <Card className={clsx("overflow-hidden transition-opacity", dimmed && "opacity-60")}>
      <div className="border-l-4 border-accent px-5 py-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-accent">
          <Lightbulb size={14} /> What this means for your buying decision
        </div>
        <p className="mt-1.5 text-[17px] font-semibold leading-snug text-ink">
          {insights.headline}
        </p>
        <ul className="mt-3 grid gap-x-8 gap-y-2 md:grid-cols-2">
          {insights.points.map((p) => (
            <li key={p.id} className="flex gap-2 text-[13.5px] leading-snug text-ink-2">
              <span className="mt-0.5 shrink-0">
                {p.tone === "warning" ? (
                  <TriangleAlert size={15} className="text-short" aria-label="Risk" />
                ) : p.tone === "action" ? (
                  <ShieldCheck size={15} className="text-accent" aria-label="Recommendation" />
                ) : (
                  <Info size={15} className="text-muted" aria-label="Note" />
                )}
              </span>
              <span className={clsx(p.tone === "action" && "font-medium text-ink")}>{p.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function DataQualityPanel({ dq, compact }: { dq: DataQuality; compact?: boolean }) {
  return (
    <Card>
      <CardHeader
        title="Data quality"
        subtitle={
          dq.status === "ok"
            ? `${dq.scored_hours} of ${dq.expected_hours} hours scored · no issues found`
            : `${dq.scored_hours} of ${dq.expected_hours} hours scored · review the warnings below`
        }
      />
      <ul className={clsx("flex flex-col gap-2.5 px-5 pb-5", compact ? "pt-2" : "pt-3")}>
        {dq.checks.map((c) => (
          <li key={c.id} className="flex gap-2.5 text-[13px]">
            <span className="mt-0.5 shrink-0">
              {c.status === "ok" ? (
                <CircleCheck size={15} className="text-good" aria-label="OK" />
              ) : c.status === "warning" ? (
                <CircleAlert size={15} className="text-warn" aria-label="Warning" />
              ) : (
                <Info size={15} className="text-muted" aria-label="Information" />
              )}
            </span>
            <span>
              <span className="font-medium text-ink">{c.label}</span>
              <span className="text-ink-2"> — {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function MethodologyDrawer({
  meta,
  open,
  onClose,
}: {
  meta: Meta;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const s = meta.snapshot;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Methodology and assumptions"
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl overflow-y-auto bg-surface p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <BookOpen size={18} /> Methodology & assumptions
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-2 hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 space-y-5 text-[13.5px] leading-relaxed text-ink-2">
          <Section title="1. What forecast does the buyer see?">
            For delivery day D, the decision is made on D-1 at the cutoff (default{" "}
            <b className="text-ink">{meta.default_cutoff} UK time</b>, the EPEX SPOT GB hourly
            day-ahead gate). For every hour of D we take the forecast with the{" "}
            <b className="text-ink">latest publish time at or before the cutoff</b>. Forecasts
            published later are never used, even though they exist in the data.
          </Section>
          <Section title="2. Market gate closures (presets)">
            <ul className="list-disc pl-5">
              {meta.presets.map((p) => (
                <li key={p.id}>
                  <b className="text-ink">{p.time}</b> — {p.label}. {p.description}
                </li>
              ))}
            </ul>
            Any other time can be entered as a custom cutoff.
          </Section>
          <Section title="3. Scope">{meta.scope.description}</Section>
          <Section title="4. Time zones">
            {meta.timezone_note} Delivery days are GB settlement days (00:00–24:00 UK local time).
          </Section>
          <Section title="5. Resolution">
            Elexon publishes the wind forecast (WINDFOR) hourly and actual generation (FUELHH)
            half-hourly. Accuracy is scored on the 24 hourly timestamps per day, comparing each
            hourly forecast with the actual half-hour that starts on the hour (the join on start
            time that the brief specifies). Scoring against the hourly mean of both half-hours
            instead changes MAE by less than 1%. Charts show the half-hourly actuals for context.
          </Section>
          <Section title="6. Error sign">
            {meta.sign_convention} Shortfall is what costs a buyer money, so it is shown in red and
            reported separately.
          </Section>
          <Section title="7. Planning range & firm wind">
            The shaded range on the forecast chart is where actual wind landed in 8 of 10 comparable
            hours: same cutoff, same forecast wind level (
            {meta.bands.map((b) => b.label).join(", ")}), on the <i>other</i> days of the pilot (the
            selected day is excluded, so it never informs its own range). Its lower edge is the firm
            wind you could count on 9 times in 10.
          </Section>
          <Section title="8. Data">
            Source: Elexon BMRS ({s.source}). Snapshot fetched{" "}
            {s.fetched_at ? fmtDayTime(s.fetched_at) : "–"} UTC: {s.forecast_runs} forecast runs (
            {s.forecast_rows?.toLocaleString("en-GB")} rows) and{" "}
            {s.actual_rows?.toLocaleString("en-GB")} half-hourly actuals. Regular forecast runs at{" "}
            {meta.regular_run_times_utc.join(", ")} UTC. The deployed app reads this committed
            snapshot and never calls Elexon live.
          </Section>
          <Section title="9. Limitations">
            National transmission-metered wind only (no embedded generation). Possible causes of the
            systematic over-forecast, such as curtailment or coverage differences, cannot be
            separated using these two datasets alone. One month is a short sample, so treat
            percentiles as indicative.
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[14px] font-semibold text-ink">{title}</h3>
      <div>{children}</div>
    </section>
  );
}
