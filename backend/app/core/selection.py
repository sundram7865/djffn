"""Point-in-time forecast selection.

The question a day-ahead buyer asks is *"what did the forecast say when I had to decide?"*.
For a delivery day ``D`` and a decision cutoff on ``D - lead_days`` (UK local time) we pick, for
every target hour of ``D``, the forecast version with the **latest publish_time that is
<= the cutoff**. Later revisions are never used, even if they are in the dataset.

All timestamps are tz-aware UTC. The cutoff is defined in UK local time and converted with
``zoneinfo`` so the logic stays correct across BST/GMT changes.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

from app.config import MARKET_TZ

HOUR = pd.Timedelta(hours=1)


def parse_cutoff(value: str) -> time:
    """Parse ``"HH:MM"`` (24h). Raises ``ValueError`` on anything else."""
    try:
        hh, mm = value.split(":")
        if len(hh) != 2 or len(mm) != 2:
            raise ValueError
        return time(int(hh), int(mm))
    except ValueError as exc:
        raise ValueError(f"cutoff must be HH:MM (24h), got {value!r}") from exc


def cutoff_utc(
    delivery_day: date, cutoff_local: time, lead_days: int = 1, tz: str = MARKET_TZ
) -> pd.Timestamp:
    """UTC instant of the decision cutoff for ``delivery_day``.

    >>> cutoff_utc(date(2026, 1, 15), time(9, 20))
    Timestamp('2026-01-14 09:20:00+0000', tz='UTC')
    """
    local = datetime.combine(delivery_day - timedelta(days=lead_days), cutoff_local, ZoneInfo(tz))
    return pd.Timestamp(local).tz_convert("UTC")


def delivery_day_bounds(day: date, tz: str = MARKET_TZ) -> tuple[pd.Timestamp, pd.Timestamp]:
    """[start, end) of a GB settlement day in UTC (23 h / 25 h on clock-change days)."""
    zone = ZoneInfo(tz)
    start = pd.Timestamp(datetime.combine(day, time(0), zone)).tz_convert("UTC")
    end = pd.Timestamp(datetime.combine(day + timedelta(days=1), time(0), zone)).tz_convert("UTC")
    return start, end


def delivery_day_of(start_times: pd.Series, tz: str = MARKET_TZ) -> pd.Series:
    """GB settlement day (a ``datetime.date``) that each UTC timestamp belongs to."""
    return start_times.dt.tz_convert(tz).dt.date


UTC_DTYPE = "datetime64[ns, UTC]"


def _empty(columns: dict[str, str]) -> pd.DataFrame:
    """Typed empty frame, so downstream merges on datetime keys still work."""
    return pd.DataFrame({c: pd.Series(dtype=t) for c, t in columns.items()})


def target_grid(days: Iterable[date], freq: str = "1h", tz: str = MARKET_TZ) -> pd.DataFrame:
    """Every target timestamp we expect a forecast for, with its delivery day."""
    frames = []
    for d in days:
        start, end = delivery_day_bounds(d, tz)
        idx = pd.date_range(start, end, freq=freq, inclusive="left")
        frames.append(pd.DataFrame({"start_time": idx, "delivery_day": d}))
    if not frames:
        return _empty({"start_time": UTC_DTYPE, "delivery_day": "object"})
    return pd.concat(frames, ignore_index=True)


def select_forecasts(
    forecasts: pd.DataFrame,
    days: Iterable[date],
    cutoff_local: time,
    lead_days: int = 1,
    tz: str = MARKET_TZ,
) -> pd.DataFrame:
    """Latest forecast published at or before each day's cutoff, for every target in ``days``.

    Parameters
    ----------
    forecasts : frame with ``publish_time``, ``start_time`` (UTC) and ``generation_mw``;
        may contain many versions per target.
    days : delivery days to select for.

    Returns
    -------
    One row per target that has an eligible forecast, with columns
    ``start_time, delivery_day, publish_time, forecast_mw, cutoff, horizon_h, age_at_cutoff_h``.
    Targets with no eligible version are simply absent; callers left-join onto
    :func:`target_grid` to surface them as missing.
    """
    days = sorted(set(days))
    schema = {
        "start_time": UTC_DTYPE,
        "delivery_day": "object",
        "publish_time": UTC_DTYPE,
        "forecast_mw": "float64",
        "cutoff": UTC_DTYPE,
        "horizon_h": "float64",
        "age_at_cutoff_h": "float64",
    }
    cols = list(schema)
    if not days:
        return _empty(schema)

    window_start, _ = delivery_day_bounds(days[0], tz)
    _, window_end = delivery_day_bounds(days[-1], tz)
    f = forecasts[
        (forecasts["start_time"] >= window_start) & (forecasts["start_time"] < window_end)
    ].copy()
    f["delivery_day"] = delivery_day_of(f["start_time"], tz)
    f = f[f["delivery_day"].isin(days)]

    cutoffs = {d: cutoff_utc(d, cutoff_local, lead_days, tz) for d in days}
    f["cutoff"] = pd.to_datetime(f["delivery_day"].map(cutoffs), utc=True)

    # The core rule: only versions that existed at the decision time are eligible...
    eligible = f[f["publish_time"] <= f["cutoff"]]
    # ...and of those, the most recent one wins.
    selected = (
        eligible.sort_values(["start_time", "publish_time"])
        .drop_duplicates("start_time", keep="last")
        .rename(columns={"generation_mw": "forecast_mw"})
    )
    selected["horizon_h"] = (selected["start_time"] - selected["publish_time"]) / HOUR
    selected["age_at_cutoff_h"] = (selected["cutoff"] - selected["publish_time"]) / HOUR
    return selected[cols].reset_index(drop=True)


def join_actuals(grid: pd.DataFrame, selected: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Left-join selected forecasts and actuals onto the expected target grid.

    Missing forecasts or actuals stay as NaN (they are reported as data-quality issues and
    excluded from scoring). ``error_mw = forecast - actual``: positive means the forecast was too
    high, i.e. wind under-delivered and the buyer was short.
    """
    out = grid.merge(
        selected.drop(columns=["delivery_day"]), on="start_time", how="left", validate="1:1"
    ).merge(
        actuals[["start_time", "generation_mw"]].rename(columns={"generation_mw": "actual_mw"}),
        on="start_time",
        how="left",
        validate="1:1",
    )
    out["error_mw"] = out["forecast_mw"] - out["actual_mw"]
    return out


def all_versions_with_actuals(
    forecasts: pd.DataFrame, actuals: pd.DataFrame, days: Iterable[date], tz: str = MARKET_TZ
) -> pd.DataFrame:
    """Every forecast version (not just the selected one) for targets in ``days``, with its actual.

    Used for the forecast-age analysis. Versions published at/after the target start
    (non-positive horizon) are excluded: they are not forecasts in any useful sense.
    """
    days = sorted(set(days))
    if not days:
        return _empty(
            {
                "start_time": UTC_DTYPE,
                "publish_time": UTC_DTYPE,
                "forecast_mw": "float64",
                "actual_mw": "float64",
                "horizon_h": "float64",
                "error_mw": "float64",
            }
        )
    window_start, _ = delivery_day_bounds(days[0], tz)
    _, window_end = delivery_day_bounds(days[-1], tz)
    f = forecasts[
        (forecasts["start_time"] >= window_start) & (forecasts["start_time"] < window_end)
    ]
    f = f[delivery_day_of(f["start_time"], tz).isin(days)]
    f = f[f["publish_time"] < f["start_time"]].rename(columns={"generation_mw": "forecast_mw"})
    out = f.merge(
        actuals[["start_time", "generation_mw"]].rename(columns={"generation_mw": "actual_mw"}),
        on="start_time",
        how="inner",
    )
    out["horizon_h"] = (out["start_time"] - out["publish_time"]) / HOUR
    out["error_mw"] = out["forecast_mw"] - out["actual_mw"]
    return out.reset_index(drop=True)
