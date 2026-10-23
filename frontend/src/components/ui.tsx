import clsx from "clsx";
import { CircleAlert, CircleHelp, Inbox, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";

export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={clsx(
        "rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  info,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  info?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
          {title}
          {info && <InfoTip text={info} />}
        </h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

const TIP_W = 288;

/**
 * Hover/focus tooltip for metric definitions. Keyboard reachable; content is plain text.
 * Rendered only while open, fixed-positioned and clamped to the viewport so it never widens the page.
 */
export function InfoTip({
  text,
  label = "What does this mean?",
}: {
  text: string;
  label?: string;
}) {
  const id = useId();
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const open = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(TIP_W, vw - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), vw - width - 8);
    setPos({ left, top: r.bottom + 8, width });
  };
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={pos ? id : undefined}
        onMouseEnter={(e) => open(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onFocus={(e) => open(e.currentTarget)}
        onBlur={() => setPos(null)}
        className="rounded-full text-muted transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        <CircleHelp size={14} strokeWidth={2} />
      </button>
      {pos && (
        <span
          id={id}
          role="tooltip"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
          className="pointer-events-none fixed z-50 rounded-lg border border-line bg-surface px-3 py-2 text-left text-[12.5px] font-normal leading-relaxed text-ink-2 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  info,
  tone = "default",
  loading,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  info?: string;
  tone?: "default" | "short" | "accent";
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
        {tone !== "default" && (
          <span
            aria-hidden
            className={clsx(
              "inline-block h-2 w-2 rounded-full",
              tone === "short" ? "bg-short" : "bg-accent",
            )}
          />
        )}
        {label}
        {info && <InfoTip text={info} />}
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-24 rounded" />
      ) : (
        <div className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-ink">
          {value}
        </div>
      )}
      {sub && !loading && <div className="mt-0.5 text-[12.5px] text-ink-2">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton rounded-lg", className)} aria-hidden />;
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="px-5 pb-5 pt-3" aria-busy="true" aria-label="Loading chart">
      <div className="skeleton w-full rounded-lg" style={{ height }} />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div
      role="alert"
      className="m-5 flex flex-col items-start gap-3 rounded-lg border border-short/30 bg-short-soft px-4 py-3 text-sm text-ink"
    >
      <div className="flex items-center gap-2 font-medium">
        <CircleAlert size={16} className="text-short" /> Couldn’t load this data
      </div>
      <p className="text-ink-2">{msg}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[13px] font-medium hover:bg-surface-2"
        >
          <RefreshCw size={13} /> Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="m-5 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-10 text-center">
      <Inbox size={22} className="text-muted" />
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="max-w-sm text-[13px] text-ink-2">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent",
            size === "sm" ? "px-2.5 py-1 text-[12.5px]" : "px-3.5 py-1.5 text-[13.5px]",
            value === o.value
              ? "bg-surface text-ink shadow-sm ring-1 ring-line"
              : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Wraps a chart with a Chart/Table toggle so no value is reachable only through a tooltip. */
export function ChartOrTable({
  chart,
  table,
  dimmed,
}: {
  chart: ReactNode;
  table: { columns: string[]; rows: (string | number)[][] };
  dimmed?: boolean;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <div className="relative">
      <div className="flex justify-end px-5 pt-2 xl:absolute xl:-top-10 xl:right-5 xl:p-0">
        <Segmented
          size="sm"
          label="Display as"
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      <div className={clsx("transition-opacity", dimmed && "opacity-50")}>
        {view === "chart" ? chart : <DataTable {...table} />}
      </div>
    </div>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-80 overflow-auto px-5 pb-5 pt-2">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 bg-surface">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                className={clsx(
                  "border-b border-line py-2 font-medium text-ink-2",
                  i === 0 ? "text-left" : "text-right",
                )}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={clsx("py-1.5 text-ink", j === 0 ? "text-left" : "text-right")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "short" | "warn" | "good";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium",
        tone === "neutral" && "bg-surface-2 text-ink-2",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "short" && "bg-short-soft text-short",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "good" && "bg-surface-2 text-good",
      )}
    >
      {children}
    </span>
  );
}
