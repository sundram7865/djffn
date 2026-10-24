// Mirrors backend/app/api/schemas.py. All timestamps are ISO-8601 UTC strings.

export interface CutoffInfo {
  time: string;
  timezone: string;
  lead_days: number;
  utc: string | null;
  preset_id: string | null;
  preset_label: string;
}

export interface QualityCheck {
  id: string;
  label: string;
  status: "ok" | "warning" | "info";
  detail: string;
}

export interface DataQuality {
  status: "ok" | "warning";
  checks: QualityCheck[];
  expected_hours: number;
  forecast_hours: number;
  actual_hours: number;
  scored_hours: number;
  runs_used: string[];
}

export interface RunVersion {
  publish_time: string;
  status: "used" | "superseded" | "after_cutoff";
  hours: number;
  mae_mw: number | null;
  values: { start_time: string; forecast_mw: number }[];
}

export interface DayPoint {
  start_time: string;
  forecast_mw: number | null;
  range_low_mw: number | null;
  range_high_mw: number | null;
  actual_mw: number | null;
  publish_time: string | null;
  horizon_h: number | null;
  band: string | null;
}

export interface DayKpis {
  peak_mw: number;
  peak_time: string;
  min_mw: number;
  min_time: string;
  mean_mw: number;
  total_mwh: number;
  firm_total_mwh: number;
  firm_mean_mw: number;
  hours: number;
}

export interface BandRange {
  band: string;
  label: string;
  error_low_mw: number;
  error_high_mw: number;
  n: number;
}

export interface EvolutionRun {
  publish_time: string;
  status: "used" | "superseded" | "after_cutoff";
  lead_h: number;
  mean_forecast_mw: number;
  mae_mw: number | null;
  bias_mw: number | null;
}

export interface Evolution {
  hours: number;
  first_hour: string | null;
  last_hour: string | null;
  actual_mean_mw: number | null;
  runs: EvolutionRun[];
}

export interface DayForecast {
  delivery_day: string;
  cutoff: CutoffInfo;
  run_timeline: RunVersion[];
  evolution: Evolution;
  runs_used: { publish_time: string; hours: number; age_at_cutoff_h: number }[];
  points: DayPoint[];
  actuals_halfhourly: { start_time: string; actual_mw: number }[];
  kpis: DayKpis | Record<string, never>;
  planning_range: { lower_q: number; upper_q: number; method: string; bands: BandRange[] };
  outcome: {
    mae_mw: number;
    bias_mw: number;
    actual_total_mwh: number;
    forecast_total_mwh: number | null;
    within_range_share: number;
    scored_hours: number;
  } | null;
  data_quality: DataQuality;
}

export interface ErrorSummary {
  n: number;
  mae_mw: number;
  rmse_mw: number;
  bias_mw: number;
  mape_pct: number | null;
  mape_excluded_n: number;
  wape_pct: number;
  mae_pct_of_peak: number;
  mean_actual_mw: number;
  mean_forecast_mw: number;
  peak_actual_mw: number;
  max_abs_error_mw: number;
  abs_pcts: Record<"p50" | "p90" | "p95" | "p99", number>;
  signed_pcts: Record<"p1" | "p5" | "p10" | "p25" | "p50" | "p75" | "p90" | "p95" | "p99", number>;
  shortfall_share: number;
  shortfall_mean_mw: number;
  shortfall_max_mw: number;
  surplus_share: number;
  surplus_mean_mw: number;
  surplus_max_mw: number;
  buffer_p90_mw: number;
  buffer_p95_mw: number;
  correlation: number | null;
}

export interface GroupStat {
  key: string | number;
  n: number;
  mae_mw: number;
  rmse_mw: number;
  bias_mw: number;
  p50_abs_mw: number;
  p90_abs_mw: number;
  p10_signed_mw: number;
  p90_signed_mw: number;
  mean_forecast_mw: number;
  mean_actual_mw: number;
  label?: string | null;
}

export interface Insights {
  headline: string;
  points: { id: string; tone: "warning" | "info" | "action"; text: string }[];
  buffer_mw: number;
}

export interface Accuracy {
  range: { start: string; end: string; days: number };
  cutoff: CutoffInfo;
  summary: ErrorSummary;
  horizon_range_h: [number, number] | null;
  series: {
    start_time: string;
    forecast_mw: number | null;
    actual_mw: number | null;
    error_mw: number | null;
  }[];
  actuals_halfhourly: { start_time: string; actual_mw: number }[];
  daily_energy: DailyEnergy[];
  energy: {
    forecast_mwh: number;
    actual_mwh: number;
    error_mwh: number;
    error_pct: number | null;
    short_days: number;
    days: number;
  } | null;
  histogram: { lo_mw: number; hi_mw: number; count: number }[];
  by_hour: GroupStat[];
  by_band: GroupStat[];
  by_day: GroupStat[];
  insights: Insights;
  data_quality: DataQuality;
}

export interface DailyEnergy {
  day: string;
  forecast_mwh: number;
  actual_mwh: number;
  error_mwh: number;
  hours: number;
}

export interface HorizonBucket extends Omit<GroupStat, "key" | "label"> {
  horizon_from_h: number;
  horizon_to_h: number;
  label: string;
  low_coverage: boolean;
}

export interface Horizon {
  range: { start: string; end: string; days: number };
  bucket_h: number;
  buckets: HorizonBucket[];
  versions_scored: number;
  runs: number;
}

export interface SweepPoint {
  time: string;
  n: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  buffer_p90_mw: number | null;
  run_time: string | null;
  mean_horizon_h: number | null;
}

export interface CutoffSweep {
  range: { start: string; end: string; days: number };
  points: SweepPoint[];
  presets: (SweepPoint & { id: string; label: string })[];
}

export interface Preset {
  id: string;
  label: string;
  time: string;
  description: string;
}

export interface Meta {
  scope: {
    first_delivery_day: string;
    last_delivery_day: string;
    first_decision_day: string;
    last_decision_day: string;
    description: string;
  };
  timezone: string;
  timezone_note: string;
  default_cutoff: string;
  presets: Preset[];
  bands: { id: string; label: string; min_mw: number; max_mw: number | null }[];
  sign_convention: string;
  regular_run_times_utc: string[];
  snapshot: {
    source: string | null;
    fetched_at: string | null;
    forecast_rows: number | null;
    forecast_runs: number | null;
    actual_rows: number | null;
  };
}
