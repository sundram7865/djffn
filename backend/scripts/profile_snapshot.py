"""Reproduce the figures quoted in docs/DATA_NOTES.md from the committed snapshot.

Usage (from ``backend/``):  python -m scripts.profile_snapshot
"""

from __future__ import annotations

import itertools
from datetime import date, time

import pandas as pd

from app.core.selection import parse_cutoff
from app.data.store import get_snapshot
from app.services.analyzer import get_analyzer


def main() -> None:
    snap = get_snapshot()
    f, a = snap.forecasts, snap.actuals

    print("== WINDFOR")
    runs = pd.Series(sorted(f["publish_time"].unique()))
    print(f"rows {len(f)}, runs {len(runs)}, rows/run {f.groupby('publish_time').size().unique()}")
    print("run times (UTC):", runs.dt.strftime("%H:%M").value_counts().sort_index().to_dict())
    horizon = (f["start_time"] - f["publish_time"]) / pd.Timedelta(hours=1)
    print(f"horizon range {horizon.min()} .. {horizon.max()} h")
    print("start minutes:", sorted(f["start_time"].dt.minute.unique()))
    print(f"generation {f['generation_mw'].min():.0f} .. {f['generation_mw'].max():.0f} MW")

    piv = f.pivot_table(index="start_time", columns="publish_time", values="generation_mw")
    changes = []
    for prev, cur in itertools.pairwise(runs):
        both = piv[[prev, cur]].dropna()
        changes.append((both[cur] - both[prev]).abs().mean())
    print(f"mean abs change vs previous run: {pd.Series(changes).mean():.0f} MW")

    print("== FUELHH (WIND)")
    per_day = a.groupby("settlement_date").size()
    print(f"rows {len(a)}, days {len(per_day)}, rows/day {per_day.unique()}")
    print(f"generation {a['generation_mw'].min():.0f} .. {a['generation_mw'].max():.0f} MW")

    print("== Accuracy by cutoff (delivery days 2 Jan - 1 Feb)")
    an = get_analyzer()
    for c in ("09:20", "09:50", "15:30", "23:30"):
        s = an.accuracy(date(2026, 1, 2), date(2026, 2, 1), parse_cutoff(c))["summary"]
        print(
            f"{c}: n={s['n']} MAE={s['mae_mw']:.0f} bias={s['bias_mw']:+.0f} "
            f"RMSE={s['rmse_mw']:.0f} short={s['shortfall_share']:.0%} P90buf={s['buffer_p90_mw']:.0f}"
        )

    print("== Resolution sensitivity at 09:20 (hourly mean of both half-hours as actual)")
    j = an.evaluate(tuple(an.scope_days()), time(9, 20)).dropna(subset=["forecast_mw"])
    hh = a.set_index("start_time")["generation_mw"]
    hourly_mean = (hh + hh.shift(-1, freq="30min").reindex(hh.index)) / 2
    alt = j["forecast_mw"] - j["start_time"].map(hourly_mean)
    print(
        f"MAE exact-start join {j['error_mw'].abs().mean():.0f} vs hourly-mean {alt.abs().mean():.0f}"
    )


if __name__ == "__main__":
    main()
