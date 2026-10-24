"""Every row of the committed snapshot is used by the analysis: nothing is fetched for nothing."""

from __future__ import annotations

from datetime import time

import pandas as pd

from app.config import MARKET_TZ, settings
from app.core.selection import all_versions_with_actuals, delivery_day_of
from app.services.analyzer import days_between, get_analyzer


def scope_days() -> list:  # type: ignore[type-arg]
    return days_between(settings.scope_first_day, settings.scope_last_day)


def test_every_forecast_row_is_a_real_forecast_for_a_delivery_day_in_scope(snapshot) -> None:  # type: ignore[no-untyped-def]
    f = snapshot.forecasts
    assert delivery_day_of(f["start_time"], MARKET_TZ).isin(scope_days()).all()
    assert (f["publish_time"] < f["start_time"]).all()  # no back-casts


def test_every_forecast_row_is_scored_in_the_forecast_age_analysis(snapshot) -> None:  # type: ignore[no-untyped-def]
    versions = all_versions_with_actuals(snapshot.forecasts, snapshot.actuals, scope_days())
    assert len(versions) == len(snapshot.forecasts)
    horizon = get_analyzer().horizon(settings.scope_first_day, settings.scope_last_day)
    assert sum(b["n"] for b in horizon["buckets"]) == len(snapshot.forecasts)
    assert horizon["runs"] == snapshot.forecasts["publish_time"].nunique()


def test_every_actual_half_hour_is_used(snapshot) -> None:  # type: ignore[no-untyped-def]
    a = snapshot.actuals
    assert delivery_day_of(a["start_time"], MARKET_TZ).isin(scope_days()).all()
    assert len(a) == len(scope_days()) * 48
    acc = get_analyzer().accuracy(settings.scope_first_day, settings.scope_last_day, time(9, 20))
    # Every half-hour is drawn on the accuracy chart...
    assert len(acc["actuals_halfhourly"]) == len(a)
    # ...and counted in the daily energy balance (two half-hours per forecast hour).
    assert sum(d["hours"] for d in acc["daily_energy"]) * 2 == len(a)
    assert acc["energy"]["actual_mwh"] == pd.Series(a["generation_mw"]).sum() / 2
