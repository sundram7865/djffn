"""Loads the committed data snapshot into memory once per process."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import settings

FORECASTS_FILE = "forecasts.csv"
ACTUALS_FILE = "actuals.csv"
MANIFEST_FILE = "manifest.json"


@dataclass(frozen=True)
class Snapshot:
    """Immutable in-memory view of the data.

    forecasts: publish_time, start_time (UTC), generation_mw — one row per (run, target hour)
    actuals:   start_time (UTC), settlement_date, settlement_period, generation_mw — one row per half-hour
    """

    forecasts: pd.DataFrame
    actuals: pd.DataFrame
    manifest: dict[str, Any]


def load_snapshot(data_dir: Path) -> Snapshot:
    forecasts = pd.read_csv(data_dir / FORECASTS_FILE)
    forecasts["publish_time"] = pd.to_datetime(forecasts["publish_time"], utc=True)
    forecasts["start_time"] = pd.to_datetime(forecasts["start_time"], utc=True)
    forecasts["generation_mw"] = forecasts["generation_mw"].astype(float)

    actuals = pd.read_csv(data_dir / ACTUALS_FILE)
    actuals["start_time"] = pd.to_datetime(actuals["start_time"], utc=True)
    actuals["publish_time"] = pd.to_datetime(actuals["publish_time"], utc=True)
    actuals["generation_mw"] = actuals["generation_mw"].astype(float)

    manifest_path = data_dir / MANIFEST_FILE
    manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    )
    return Snapshot(forecasts=forecasts, actuals=actuals, manifest=manifest)


def write_snapshot(
    data_dir: Path, forecasts: pd.DataFrame, actuals: pd.DataFrame, manifest: dict[str, Any]
) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    f = forecasts.copy()
    f["publish_time"] = f["publish_time"].dt.strftime(fmt)
    f["start_time"] = f["start_time"].dt.strftime(fmt)
    f["generation_mw"] = f["generation_mw"].round().astype(int)
    f.to_csv(data_dir / FORECASTS_FILE, index=False, lineterminator="\n")

    a = actuals.copy()
    a["start_time"] = a["start_time"].dt.strftime(fmt)
    a["publish_time"] = a["publish_time"].dt.strftime(fmt)
    a["generation_mw"] = a["generation_mw"].round().astype(int)
    a.to_csv(data_dir / ACTUALS_FILE, index=False, lineterminator="\n")

    (data_dir / MANIFEST_FILE).write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


@lru_cache(maxsize=1)
def get_snapshot() -> Snapshot:
    return load_snapshot(settings.data_dir)
