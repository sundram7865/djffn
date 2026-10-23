from __future__ import annotations

import pandas as pd
import pytest

from app.data.store import Snapshot, get_snapshot


def ts(value: str) -> pd.Timestamp:
    """UTC timestamp from a short ISO string, e.g. ``ts("2026-01-14 09:20")``."""
    return pd.Timestamp(value, tz="UTC")


def make_forecasts(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    """Rows of (publish_time, start_time, generation_mw) -> forecasts frame."""
    return pd.DataFrame(
        {
            "publish_time": pd.to_datetime([r[0] for r in rows], utc=True),
            "start_time": pd.to_datetime([r[1] for r in rows], utc=True),
            "generation_mw": [float(r[2]) for r in rows],
        }
    )


def make_actuals(rows: list[tuple[str, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "start_time": pd.to_datetime([r[0] for r in rows], utc=True),
            "generation_mw": [float(r[1]) for r in rows],
        }
    )


@pytest.fixture(scope="session")
def snapshot() -> Snapshot:
    """The real committed snapshot (January 2026)."""
    return get_snapshot()
