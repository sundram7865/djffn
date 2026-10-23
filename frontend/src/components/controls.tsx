import clsx from "clsx";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Preset } from "../api/types";
import { addDays, daysInclusive, fmtDateShort } from "../lib/format";
import { glossary } from "../lib/glossary";
import { InfoTip } from "./ui";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function CutoffPicker({
  value,
  presets,
  onChange,
}: {
  value: string;
  presets: Preset[];
  onChange: (v: string) => void;
}) {
  const isPreset = presets.some((p) => p.time === value);
  const [custom, setCustom] = useState(isPreset ? "" : value);

  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="sr-only">Decision cutoff</legend>
      <span className="flex items-center gap-1 text-[12.5px] font-medium text-ink-2">
        <Clock size={14} /> Decide by (D-1, UK)
        <InfoTip text={glossary.cutoff} />
      </span>
      <div className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-0.5">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.description}
            aria-pressed={value === p.time}
            onClick={() => onChange(p.time)}
            className={clsx(
              "rounded-md px-2.5 py-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              value === p.time ? "bg-surface shadow-sm ring-1 ring-line" : "hover:bg-surface/60",
            )}
          >
            <span className="block text-[13.5px] font-semibold tabular text-ink">{p.time}</span>
            <span className="block text-[11px] leading-tight text-ink-2">{shortLabel(p)}</span>
          </button>
        ))}
        <label
          className={clsx(
            "flex flex-col justify-center rounded-md px-2.5 py-1",
            !isPreset ? "bg-surface shadow-sm ring-1 ring-line" : "",
          )}
        >
          <input
            type="time"
            aria-label="Custom cutoff time"
            value={isPreset ? custom : value}
            min="00:00"
            max="23:59"
            onChange={(e) => {
              setCustom(e.target.value);
              if (TIME_RE.test(e.target.value)) onChange(e.target.value);
            }}
            className="w-[5.5rem] bg-transparent text-[13.5px] font-semibold tabular text-ink outline-none"
          />
          <span className="block text-[11px] leading-tight text-ink-2">Custom</span>
        </label>
      </div>
    </fieldset>
  );
}

function shortLabel(p: Preset): string {
  if (p.id === "epex-da-60") return "EPEX hourly";
  if (p.id === "n2ex-da") return "N2EX";
  if (p.id === "epex-da-30") return "EPEX ½-hourly";
  return p.label;
}

export function DayPicker({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (d: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Calendar grid: Monday-first weeks covering the scope.
  const firstDow = (new Date(`${min}T12:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = addDays(min, -firstDow);
  const lastDow = (new Date(`${max}T12:00:00Z`).getUTCDay() + 6) % 7;
  const gridEnd = addDays(max, 6 - lastDow);
  const cells = daysInclusive(gridStart, gridEnd);

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <span className="mr-1 flex items-center gap-1 text-[12.5px] font-medium text-ink-2">
        <CalendarDays size={14} /> Delivery day
      </span>
      <button
        type="button"
        aria-label="Previous day"
        disabled={value <= min}
        onClick={() => onChange(addDays(value, -1))}
        className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="min-w-[9.5rem] rounded-lg border border-line bg-surface px-3 py-1.5 text-[13.5px] font-semibold text-ink hover:bg-surface-2"
      >
        {fmtDateShort(value)} 2026
      </button>
      <button
        type="button"
        aria-label="Next day"
        disabled={value >= max}
        onClick={() => onChange(addDays(value, 1))}
        className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-30"
      >
        <ChevronRight size={16} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose delivery day"
          className="absolute left-0 top-full z-40 mt-2 w-[19rem] rounded-xl border border-line bg-surface p-3 shadow-xl"
        >
          <div className="mb-2 text-[12px] text-ink-2">
            Delivery days decided in January 2026 (D-1 cutoff)
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <div key={d}>{d}</div>
            ))}
            {cells.map((d) => {
              const inScope = d >= min && d <= max;
              const selected = d === value;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!inScope}
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                  }}
                  className={clsx(
                    "relative rounded-md py-1.5 text-[13px] tabular",
                    !inScope && "text-muted/40",
                    inScope && !selected && "text-ink hover:bg-surface-2",
                    selected && "bg-accent font-semibold text-white",
                  )}
                >
                  {Number(d.slice(8))}
                  {d.slice(5, 7) === "02" && inScope && (
                    <span className="absolute -top-1 right-0 text-[9px] text-muted">Feb</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function RangePicker({
  start,
  end,
  min,
  max,
  onChange,
}: {
  start: string;
  end: string;
  min: string;
  max: string;
  onChange: (start: string, end: string) => void;
}) {
  const presets = [
    { label: "Full pilot", start: min, end: max },
    { label: "First half", start: min, end: addDays(min, 14) },
    { label: "Second half", start: addDays(min, 15), end: max },
    { label: "Last 7 days", start: addDays(max, -6), end: max },
  ];
  const active = presets.find((p) => p.start === start && p.end === end);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-[12.5px] font-medium text-ink-2">
        <CalendarDays size={14} /> Delivery days
      </span>
      <div className="flex flex-wrap gap-1 rounded-lg bg-surface-2 p-0.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={active === p}
            onClick={() => onChange(p.start, p.end)}
            className={clsx(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-medium",
              active === p
                ? "bg-surface text-ink shadow-sm ring-1 ring-line"
                : "text-ink-2 hover:text-ink",
            )}
          >
            {active === p && <Check size={13} strokeWidth={3} />}
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[13px]">
        <input
          type="date"
          aria-label="Start delivery day"
          value={start}
          min={min}
          max={end}
          onChange={(e) => e.target.value && onChange(e.target.value, end)}
          className="rounded-md border border-line bg-surface px-2 py-1 tabular text-ink"
        />
        <span className="text-muted">→</span>
        <input
          type="date"
          aria-label="End delivery day"
          value={end}
          min={start}
          max={max}
          onChange={(e) => e.target.value && onChange(start, e.target.value)}
          className="rounded-md border border-line bg-surface px-2 py-1 tabular text-ink"
        />
      </div>
    </div>
  );
}
