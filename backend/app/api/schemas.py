"""Response models: the public contract of the API (also rendered at /api/docs)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CutoffInfo(BaseModel):
    time: str = Field(description="HH:MM, UK local time on D-1")
    timezone: str
    lead_days: int
    utc: str | None = Field(description="Cutoff instant in UTC (for the first delivery day)")
    preset_id: str | None
    preset_label: str


class QualityCheck(BaseModel):
    id: str
    label: str
    status: str = Field(description="ok | warning | info")
    detail: str


class DataQuality(BaseModel):
    status: str
    checks: list[QualityCheck]
    expected_hours: int
    forecast_hours: int
    actual_hours: int
    scored_hours: int
    runs_used: list[str]


# ----------------------------------------------------------------------------- View 1
class RunUsed(BaseModel):
    publish_time: str
    hours: int
    age_at_cutoff_h: float


class DayPoint(BaseModel):
    start_time: str
    forecast_mw: float | None
    range_low_mw: float | None = Field(description="P10 of expected actual (forecast − P90 error)")
    range_high_mw: float | None = Field(description="P90 of expected actual (forecast − P10 error)")
    actual_mw: float | None
    publish_time: str | None
    horizon_h: float | None
    band: str | None


class HalfHourActual(BaseModel):
    start_time: str
    actual_mw: float


class DayKpis(BaseModel):
    peak_mw: float
    peak_time: str
    min_mw: float
    min_time: str
    mean_mw: float
    total_mwh: float
    firm_total_mwh: float = Field(description="Energy wind delivered in 9 of 10 comparable hours")
    firm_mean_mw: float
    hours: int


class BandRange(BaseModel):
    band: str
    label: str
    error_low_mw: float
    error_high_mw: float
    n: int


class PlanningRange(BaseModel):
    lower_q: float
    upper_q: float
    method: str
    bands: list[BandRange]


class DayOutcome(BaseModel):
    mae_mw: float
    bias_mw: float
    actual_total_mwh: float
    forecast_total_mwh: float | None
    within_range_share: float
    scored_hours: int


class DayForecastResponse(BaseModel):
    delivery_day: str
    cutoff: CutoffInfo
    runs_used: list[RunUsed]
    points: list[DayPoint]
    actuals_halfhourly: list[HalfHourActual]
    kpis: DayKpis | dict[str, None]
    planning_range: PlanningRange
    outcome: DayOutcome | None
    data_quality: DataQuality


# ----------------------------------------------------------------------------- View 2
class ErrorSummary(BaseModel):
    n: int
    mae_mw: float | None = None
    rmse_mw: float | None = None
    bias_mw: float | None = None
    mape_pct: float | None = None
    mape_excluded_n: int | None = None
    wape_pct: float | None = None
    mae_pct_of_peak: float | None = None
    mean_actual_mw: float | None = None
    mean_forecast_mw: float | None = None
    peak_actual_mw: float | None = None
    max_abs_error_mw: float | None = None
    abs_pcts: dict[str, float | None] = {}
    signed_pcts: dict[str, float | None] = {}
    shortfall_share: float | None = None
    shortfall_mean_mw: float | None = None
    shortfall_max_mw: float | None = None
    surplus_share: float | None = None
    surplus_mean_mw: float | None = None
    surplus_max_mw: float | None = None
    buffer_p90_mw: float | None = None
    buffer_p95_mw: float | None = None
    correlation: float | None = None


class SeriesPoint(BaseModel):
    start_time: str
    forecast_mw: float | None
    actual_mw: float | None
    error_mw: float | None


class HistBin(BaseModel):
    lo_mw: float
    hi_mw: float
    count: int


class GroupStat(BaseModel):
    key: str | int
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    p90_abs_mw: float | None
    p10_signed_mw: float | None
    p90_signed_mw: float | None
    mean_forecast_mw: float | None
    mean_actual_mw: float | None
    label: str | None = None


class InsightPoint(BaseModel):
    id: str
    tone: str
    text: str


class Insights(BaseModel):
    headline: str
    points: list[InsightPoint]
    buffer_mw: float


class Range(BaseModel):
    start: str
    end: str
    days: int


class AccuracyResponse(BaseModel):
    range: Range
    cutoff: CutoffInfo
    summary: ErrorSummary
    horizon_range_h: list[float] | None
    series: list[SeriesPoint]
    histogram: list[HistBin]
    by_hour: list[GroupStat]
    by_band: list[GroupStat]
    by_day: list[GroupStat]
    insights: Insights
    data_quality: DataQuality


class HorizonBucket(BaseModel):
    horizon_from_h: int
    horizon_to_h: int
    label: str
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    p90_abs_mw: float | None
    p10_signed_mw: float | None
    p90_signed_mw: float | None
    mean_forecast_mw: float | None
    mean_actual_mw: float | None
    low_coverage: bool


class HorizonResponse(BaseModel):
    range: Range
    bucket_h: int
    buckets: list[HorizonBucket]
    versions_scored: int


class SweepPoint(BaseModel):
    time: str
    n: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    buffer_p90_mw: float | None
    run_time: str | None = Field(description="Most common publish time (UTC) of the run used")
    mean_horizon_h: float | None


class PresetPoint(SweepPoint):
    id: str
    label: str


class CutoffSweepResponse(BaseModel):
    range: Range
    points: list[SweepPoint]
    presets: list[PresetPoint]


# ----------------------------------------------------------------------------- meta
class Scope(BaseModel):
    first_delivery_day: str
    last_delivery_day: str
    first_decision_day: str
    last_decision_day: str
    description: str


class Preset(BaseModel):
    id: str
    label: str
    time: str
    description: str


class Band(BaseModel):
    id: str
    label: str
    min_mw: float
    max_mw: float | None


class SnapshotInfo(BaseModel):
    source: str | None
    fetched_at: str | None
    forecast_rows: int | None
    forecast_runs: int | None
    actual_rows: int | None


class MetaResponse(BaseModel):
    scope: Scope
    timezone: str
    timezone_note: str
    default_cutoff: str
    presets: list[Preset]
    bands: list[Band]
    sign_convention: str
    regular_run_times_utc: list[str]
    snapshot: SnapshotInfo
