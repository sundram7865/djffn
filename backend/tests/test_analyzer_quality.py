"""Data-quality issues must be surfaced, not hidden. Uses a small synthetic snapshot."""

from __future__ import annotations

from dataclasses import replace
from datetime import date, time

import pandas as pd

from app.config import settings
from app.data.store import Snapshot
from app.services.analyzer import Analyzer

D = date(2026, 1, 15)


def _snapshot(drop_forecast_hours: set[int], drop_actual_hours: set[int]) -> Snapshot:
    rows = []
    for run in ("2026-01-14 04:30", "2026-01-14 07:30", "2026-01-14 12:25"):
        for h in range(24):
            if run.endswith("07:30") and h in drop_forecast_hours:
                continue
            rows.append((run, f"2026-01-15 {h:02d}:00", 10_000.0 + h))
    forecasts = pd.DataFrame(rows, columns=["publish_time", "start_time", "generation_mw"])
    forecasts["publish_time"] = pd.to_datetime(forecasts["publish_time"], utc=True)
    forecasts["start_time"] = pd.to_datetime(forecasts["start_time"], utc=True)
    halfhours = pd.date_range("2026-01-15", periods=48, freq="30min", tz="UTC")
    actuals = pd.DataFrame({"start_time": halfhours, "generation_mw": 9_000.0})
    actuals = actuals[~actuals["start_time"].dt.hour.isin(drop_actual_hours)]
    actuals["publish_time"] = actuals["start_time"] + pd.Timedelta(minutes=30)
    return Snapshot(forecasts=forecasts, actuals=actuals.reset_index(drop=True), manifest={})


def _analyzer(snap: Snapshot) -> Analyzer:
    return Analyzer(snap, replace(settings, scope_first_day=D, scope_last_day=D))


def test_clean_day_is_ok() -> None:
    body = _analyzer(_snapshot(set(), set())).day_forecast(D, time(9, 20))
    checks = {c["id"]: c["status"] for c in body["data_quality"]["checks"]}
    assert checks["forecast-coverage"] == "ok" and checks["actual-coverage"] == "ok"
    assert body["runs_used"][0]["publish_time"] == "2026-01-14T07:30:00Z"


def test_gaps_fall_back_to_older_run_and_are_reported() -> None:
    body = _analyzer(_snapshot({5, 6}, {10})).day_forecast(D, time(9, 20))
    runs = {r["publish_time"]: r["hours"] for r in body["runs_used"]}
    # The two hours missing from the 07:30 run fall back to the 04:30 run (still before cutoff).
    assert runs == {"2026-01-14T04:30:00Z": 2, "2026-01-14T07:30:00Z": 22}
    dq = {c["id"]: c for c in body["data_quality"]["checks"]}
    assert dq["actual-coverage"]["status"] == "warning"
    assert "46/48" in dq["actual-coverage"]["detail"]
    assert body["data_quality"]["scored_hours"] == 23


def test_missing_forecast_is_reported() -> None:
    snap = _snapshot(set(), set())
    snap = replace(snap, forecasts=snap.forecasts[snap.forecasts["start_time"].dt.hour != 3])
    body = _analyzer(snap).day_forecast(D, time(9, 20))
    dq = {c["id"]: c for c in body["data_quality"]["checks"]}
    assert dq["forecast-coverage"]["status"] == "warning"
    assert "2026-01-15T03:00:00Z" in dq["forecast-coverage"]["detail"]
    assert body["data_quality"]["status"] == "warning"


def test_stale_forecast_is_flagged() -> None:
    body = _analyzer(_snapshot(set(), set())).day_forecast(D, time(23, 0))
    # 23:00 cutoff uses the 12:25 run: 10.6 h old -> stale; and it is off-schedule.
    dq = {c["id"]: c for c in body["data_quality"]["checks"]}
    assert dq["freshness"]["status"] == "warning"
