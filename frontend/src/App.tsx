import { BookOpen, ChartColumn, Moon, Sun, Wind } from "lucide-react";
import { useState } from "react";

import { useMeta } from "./api/hooks";
import { CutoffPicker, DayPicker, RangePicker } from "./components/controls";
import { MethodologyDrawer } from "./components/panels";
import { ErrorState, Pill, Segmented, Skeleton } from "./components/ui";
import { useTheme } from "./lib/theme";
import { useUrlState } from "./lib/urlState";
import { AccuracyView } from "./views/AccuracyView";
import { ForecastView } from "./views/ForecastView";

type View = "forecast" | "accuracy";

const DEFAULT_DAY = "2026-01-15";
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function App() {
  const meta = useMeta();
  const { mode, toggle } = useTheme();
  const [docsOpen, setDocsOpen] = useState(false);
  const [url, setUrl] = useUrlState({
    view: "forecast" as string | undefined,
    day: undefined as string | undefined,
    cutoff: undefined as string | undefined,
    start: undefined as string | undefined,
    end: undefined as string | undefined,
  });

  const m = meta.data;
  const view: View = url.view === "accuracy" ? "accuracy" : "forecast";
  const min = m?.scope.first_delivery_day ?? "2026-01-02";
  const max = m?.scope.last_delivery_day ?? "2026-02-01";
  const clamp = (d: string | undefined, fallback: string) =>
    d && d >= min && d <= max ? d : fallback;
  // Malformed or out-of-range values in a shared link fall back to defaults instead of erroring.
  const cutoff = url.cutoff && HHMM.test(url.cutoff) ? url.cutoff : (m?.default_cutoff ?? "09:20");
  const day = clamp(url.day, DEFAULT_DAY);
  const start = clamp(url.start, min);
  const end = clamp(url.end, max) < start ? max : clamp(url.end, max);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <Wind size={20} />
            </div>
            <div>
              <div className="text-[16px] font-semibold leading-tight text-ink">WindDesk</div>
              <div className="text-[12px] leading-tight text-ink-2">
                Day-ahead wind forecast & risk · GB national wind (Elexon)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone="accent">Pilot · decisions in Jan 2026</Pill>
            <button
              type="button"
              onClick={() => setDocsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface-2"
            >
              <BookOpen size={14} /> Methodology
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="rounded-lg border border-line p-2 text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {mode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        {meta.isError ? (
          <ErrorState error={meta.error} onRetry={() => meta.refetch()} />
        ) : !m ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Segmented
                  label="View"
                  value={view}
                  onChange={(v) => setUrl({ view: v })}
                  options={[
                    {
                      value: "forecast",
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Wind size={14} /> Tomorrow’s wind
                        </span>
                      ),
                    },
                    {
                      value: "accuracy",
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <ChartColumn size={14} /> Forecast accuracy
                        </span>
                      ),
                    },
                  ]}
                />
                <CutoffPicker
                  value={cutoff}
                  presets={m.presets}
                  onChange={(c) => setUrl({ cutoff: c })}
                />
              </div>
              <div className="border-t border-line pt-3">
                {view === "forecast" ? (
                  <DayPicker value={day} min={min} max={max} onChange={(d) => setUrl({ day: d })} />
                ) : (
                  <RangePicker
                    start={start}
                    end={end}
                    min={min}
                    max={max}
                    onChange={(s, e) => setUrl({ start: s, end: e })}
                  />
                )}
              </div>
            </div>

            {view === "forecast" ? (
              <ForecastView day={day} cutoff={cutoff} />
            ) : (
              <AccuracyView
                start={start}
                end={end}
                cutoff={cutoff}
                onCutoff={(c) => setUrl({ cutoff: c })}
                onOpenDay={(d) => {
                  setUrl({ view: "forecast", day: d });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}

            <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-[12px] text-muted">
              <span>
                Data: Elexon BMRS WINDFOR (forecast) & FUELHH WIND (actual) · snapshot{" "}
                {m.snapshot.fetched_at?.slice(0, 10)} · times in UK local time (GMT in January)
              </span>
              <span>Error = forecast − actual · positive = wind shortfall</span>
            </footer>
            <MethodologyDrawer meta={m} open={docsOpen} onClose={() => setDocsOpen(false)} />
          </>
        )}
      </main>
    </div>
  );
}
