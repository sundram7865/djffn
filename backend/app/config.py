"""Application configuration.

Every business assumption lives here so it can be reviewed in one place and overridden via
environment variables where it makes sense (paths, CORS). Domain constants (scope, presets,
bands) are deliberately code-level: changing them changes the analysis and should be reviewed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

# GB settlement days are defined in UK local time. All data is stored and processed in UTC;
# this zone is only used to turn "09:20 on D-1" into a UTC instant (DST-safe).
MARKET_TZ = "Europe/London"


@dataclass(frozen=True)
class CutoffPreset:
    id: str
    label: str
    time: str  # HH:MM, UK local time on D-1
    description: str


# Researched gate closures (see docs/DATA_NOTES.md §5).
CUTOFF_PRESETS: tuple[CutoffPreset, ...] = (
    CutoffPreset(
        id="epex-da-60",
        label="EPEX GB day-ahead (hourly)",
        time="09:20",
        description="Gate closure of the EPEX SPOT GB 60-minute day-ahead auction. Earliest GB "
        "day-ahead gate, so the safest default for a team that may bid on either exchange.",
    ),
    CutoffPreset(
        id="n2ex-da",
        label="Nord Pool N2EX GB day-ahead",
        time="09:50",
        description="Gate closure of the Nord Pool N2EX GB day-ahead auction.",
    ),
    CutoffPreset(
        id="epex-da-30",
        label="EPEX GB day-ahead (half-hourly)",
        time="15:30",
        description="Gate closure of the EPEX SPOT GB 30-minute day-ahead auction, used to "
        "fine-tune positions on D-1.",
    ),
)

DEFAULT_CUTOFF = "09:20"


@dataclass(frozen=True)
class WindBand:
    id: str
    label: str
    min_mw: float
    max_mw: float | None  # None = open-ended


# Bands are defined on the *forecast* level because that is what the buyer knows at decision time.
WIND_BANDS: tuple[WindBand, ...] = (
    WindBand("low", "Low wind (< 8 GW)", 0.0, 8000.0),
    WindBand("medium", "Medium wind (8–14 GW)", 8000.0, 14000.0),
    WindBand("high", "High wind (≥ 14 GW)", 14000.0, None),
)


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(
        default_factory=lambda: Path(os.getenv("DATA_DIR", str(BACKEND_DIR / "data")))
    )
    static_dir: Path | None = field(
        default_factory=lambda: Path(p) if (p := os.getenv("STATIC_DIR")) else None
    )
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
            if o.strip()
        )
    )
    # Decisions made in January 2026 -> delivery days 2 Jan .. 1 Feb (cutoff on D-1).
    scope_first_day: date = date(2026, 1, 2)
    scope_last_day: date = date(2026, 2, 1)
    default_cutoff: time = time(9, 20)
    lead_days: int = 1  # decision is made on D-1
    # Planning band quantiles of forecast error (forecast - actual).
    band_lower_q: float = 0.10
    band_upper_q: float = 0.90
    histogram_bin_mw: float = 500.0
    horizon_bucket_h: int = 6
    # A selected forecast older than this at the cutoff is flagged as stale.
    stale_forecast_h: float = 6.0
    # Actuals below this are excluded from MAPE (percentage errors explode near zero).
    mape_min_actual_mw: float = 500.0


settings = Settings()
