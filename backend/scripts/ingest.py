"""Build the committed data snapshot from the Elexon BMRS API.

Usage (from ``backend/``):

    python -m scripts.ingest              # writes data/forecasts.csv, data/actuals.csv, data/manifest.json
    python -m scripts.ingest --out /tmp/x # write somewhere else

Windows fetched (see docs/DATA_NOTES.md §6 for the reasoning):
  * WINDFOR runs published 2025-12-30T00:00Z .. 2026-02-02T00:00Z
    - covers every run a January decision could use, plus older runs for the forecast-age analysis
  * FUELHH (WIND) settlement dates 2026-01-01 .. 2026-02-01
    - actuals for every delivery day decided in January (2 Jan .. 1 Feb), plus 1 Jan for context
"""

from __future__ import annotations

import argparse
import hashlib
import logging
from datetime import UTC, date, datetime
from pathlib import Path

from app.config import BACKEND_DIR
from app.data.cleaning import clean_fuelhh, clean_windfor
from app.data.store import ACTUALS_FILE, FORECASTS_FILE, write_snapshot
from app.elexon.client import BASE_URL, ElexonClient

WINDFOR_PUBLISH_FROM = datetime(2025, 12, 30, tzinfo=UTC)
WINDFOR_PUBLISH_TO = datetime(2026, 2, 2, tzinfo=UTC)
FUELHH_FROM = date(2026, 1, 1)
FUELHH_TO = date(2026, 2, 1)


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

    # Keep the snapshot strictly inside the requested windows.
    forecasts = forecasts[
        (forecasts["publish_time"] >= WINDFOR_PUBLISH_FROM)
        & (forecasts["publish_time"] <= WINDFOR_PUBLISH_TO)
    ].reset_index(drop=True)

    manifest = {
        "source": BASE_URL,
        "fetched_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "windfor": {
            "endpoint": "/datasets/WINDFOR/stream",
            "publish_from": WINDFOR_PUBLISH_FROM.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publish_to": WINDFOR_PUBLISH_TO.strftime("%Y-%m-%dT%H:%M:%SZ"),
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
        "snapshot written to %s: %d forecast rows, %d actual rows",
        args.out,
        len(forecasts),
        len(actuals),
    )


if __name__ == "__main__":
    main()
