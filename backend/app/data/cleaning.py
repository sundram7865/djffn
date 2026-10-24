"""Validation and cleaning of raw Elexon rows into tidy, UTC-indexed frames.

Pure functions (raw dicts in, DataFrame + stats out) so the rules are unit-testable without the network.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from pydantic import ValidationError

from app.elexon.client import FuelHHRecord, WindForRecord

FORECAST_COLUMNS = ["publish_time", "start_time", "generation_mw"]
ACTUAL_COLUMNS = [
    "start_time",
    "settlement_date",
    "settlement_period",
    "generation_mw",
    "publish_time",
]


def clean_windfor(raw: list[dict[str, Any]]) -> tuple[pd.DataFrame, dict[str, int]]:
    """Validate WINDFOR rows; drop invalid and duplicate (publish_time, start_time) pairs."""
    valid: list[dict[str, Any]] = []
    invalid = 0
    for row in raw:
        try:
            rec = WindForRecord.model_validate(row)
        except ValidationError:
            invalid += 1
            continue
        valid.append(
            {
                "publish_time": rec.publish_time,
                "start_time": rec.start_time,
                "generation_mw": float(rec.generation),
            }
        )
    df = pd.DataFrame(valid, columns=FORECAST_COLUMNS)
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    before = len(df)
    # Chunked fetches overlap at boundaries; keep one row per version/target.
    df = df.drop_duplicates(subset=["publish_time", "start_time"], keep="last")
    dups = before - len(df)
    # Each run also restates hours that had already started when it was published. Those are
    # back-casts, not forecasts, and can never inform a decision, so they are not kept.
    backcast = df["start_time"] <= df["publish_time"]
    df = df[~backcast]
    off_grid = int((df["start_time"].dt.minute != 0).sum())
    negative = int((df["generation_mw"] < 0).sum())
    df = df.sort_values(["publish_time", "start_time"]).reset_index(drop=True)
    stats = {
        "raw_rows": len(raw),
        "invalid_rows": invalid,
        "duplicate_rows_dropped": dups,
        "backcast_rows_dropped": int(backcast.sum()),
        "clean_rows": len(df),
        "runs": int(df["publish_time"].nunique()),
        "off_hour_start_times": off_grid,
        "negative_values": negative,
    }
    return df, stats


def clean_fuelhh(
    raw: list[dict[str, Any]], fuel_type: str = "WIND"
) -> tuple[pd.DataFrame, dict[str, int]]:
    """Validate FUELHH rows for one fuel type; keep the latest publication per half-hour."""
    valid: list[dict[str, Any]] = []
    invalid = 0
    other_fuel = 0
    for row in raw:
        try:
            rec = FuelHHRecord.model_validate(row)
        except ValidationError:
            invalid += 1
            continue
        if rec.fuel_type != fuel_type:
            other_fuel += 1
            continue
        valid.append(
            {
                "start_time": rec.start_time,
                "settlement_date": rec.settlement_date.isoformat(),
                "settlement_period": rec.settlement_period,
                "generation_mw": float(rec.generation),
                "publish_time": rec.publish_time,
            }
        )
    df = pd.DataFrame(valid, columns=ACTUAL_COLUMNS)
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    before = len(df)
    # If Elexon ever re-publishes a period, the latest publication is the best estimate.
    df = df.sort_values(["start_time", "publish_time"]).drop_duplicates("start_time", keep="last")
    dups = before - len(df)
    off_grid = int((~df["start_time"].dt.minute.isin([0, 30])).sum())
    df = df.reset_index(drop=True)
    stats = {
        "raw_rows": len(raw),
        "invalid_rows": invalid,
        "other_fuel_rows_ignored": other_fuel,
        "duplicate_rows_dropped": dups,
        "clean_rows": len(df),
        "off_halfhour_start_times": off_grid,
        "missing_halfhours": len(missing_halfhours(df["start_time"])),
    }
    return df, stats


def missing_halfhours(start_times: pd.Series) -> list[pd.Timestamp]:
    """Half-hour slots absent between the first and last observed start time."""
    if start_times.empty:
        return []
    grid = pd.date_range(start_times.min(), start_times.max(), freq="30min")
    return list(grid.difference(pd.DatetimeIndex(start_times)))
