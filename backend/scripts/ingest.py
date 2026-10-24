"""Build the committed data snapshot from the Elexon BMRS API.

Usage (from ``backend/``):

    python -m scripts.ingest              # writes data/forecasts.csv, data/actuals.csv, data/manifest.json
    python -m scripts.ingest --out /tmp/x # write somewhere else

The snapshot keeps exactly what the analysis uses, nothing more (see docs/DATA_NOTES.md §6):
  * WINDFOR: every run that forecasts any hour of the delivery days 2 Jan .. 1 Feb 2026.
    Runs are published from 31 Dec (two days ahead of 2 Jan) to 1 Feb. Values for hours outside
    the delivery window, and back-casts of hours that had already started, are dropped.
  * FUELHH (WIND): every half-hour of the same delivery days.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
from datetime import UTC, datetime
from pathlib import Path

from app.config import BACKEND_DIR, MARKET_TZ, settings
from app.core.selection import delivery_day_bounds
from app.data.cleaning import clean_fuelhh, clean_windfor
from app.data.store import ACTUALS_FILE, FORECASTS_FILE, write_snapshot
from app.elexon.client import BASE_URL, ElexonClient

# A run covers 21:00 on (publish day - 1) to 21:00 on (publish day + 2), so the earliest run that
# reaches the first delivery day is published two days before it.
WINDFOR_PUBLISH_FROM = datetime(2025, 12, 31, tzinfo=UTC)
WINDFOR_PUBLISH_TO = datetime(2026, 2, 2, tzinfo=UTC)
FUELHH_FROM = settings.scope_first_day
FUELHH_TO = settings.scope_last_day
ISO = "%Y-%m-%dT%H:%M:%SZ"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=BACKEND_DIR / "data")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    with ElexonClient() as client:
        raw_fc = client.windfor(WINDFOR_PUBLISH_FROM, WINDFOR_PUBLISH_TO)
        raw_act = client.fuelhh(FUELHH_FROM, FUELHH_TO)

    forecasts, fc_stats = clean_windfor(raw_fc)
    actuals, act_stats = clean_fuelhh(raw_act)

    # Keep only forecasts for hours of the delivery days in scope.
    target_from, _ = delivery_day_bounds(settings.scope_first_day, MARKET_TZ)
    _, target_to = delivery_day_bounds(settings.scope_last_day, MARKET_TZ)
    in_scope = (forecasts["start_time"] >= target_from) & (forecasts["start_time"] < target_to)
    fc_stats["outside_delivery_window_dropped"] = int((~in_scope).sum())
    forecasts = forecasts[in_scope].reset_index(drop=True)
    fc_stats["clean_rows"] = len(forecasts)
    fc_stats["runs"] = int(forecasts["publish_time"].nunique())

    manifest = {
        "source": BASE_URL,
        "fetched_at": datetime.now(UTC).strftime(ISO),
        "delivery_days": {
            "first": settings.scope_first_day.isoformat(),
            "last": settings.scope_last_day.isoformat(),
            "target_from": target_from.strftime(ISO),
            "target_to": target_to.strftime(ISO),
        },
        "windfor": {
            "endpoint": "/datasets/WINDFOR/stream",
            "publish_from": WINDFOR_PUBLISH_FROM.strftime(ISO),
            "publish_to": WINDFOR_PUBLISH_TO.strftime(ISO),
            "resolution": "hourly",
            **fc_stats,
        },
        "fuelhh": {
            "endpoint": "/datasets/FUELHH/stream",
            "fuel_type": "WIND",
            "settlement_from": FUELHH_FROM.isoformat(),
            "settlement_to": FUELHH_TO.isoformat(),
            "resolution": "half-hourly",
            **act_stats,
        },
    }
    write_snapshot(args.out, forecasts, actuals, manifest)
    manifest["files"] = {
        name: {"sha256": _sha256(args.out / name)} for name in (FORECASTS_FILE, ACTUALS_FILE)
    }
    write_snapshot(args.out, forecasts, actuals, manifest)
    logging.info(
        "snapshot written to %s: %d forecast rows (%d runs), %d actual rows",
        args.out,
        len(forecasts),
        fc_stats["runs"],
        len(actuals),
    )


if __name__ == "__main__":
    main()
