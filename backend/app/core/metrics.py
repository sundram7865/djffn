"""Forecast-error statistics. Pure numpy/pandas, no I/O.

Sign convention everywhere: ``error = forecast - actual`` (MW).
  * error > 0  -> forecast too high -> wind **shortfall** -> buyer is short and must top up.
  * error < 0  -> forecast too low  -> wind **surplus**   -> buyer over-bought.
Percentiles use numpy's default linear interpolation.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

import numpy as np
import pandas as pd

from app.config import WIND_BANDS, WindBand

ABS_PCTS = (50, 90, 95, 99)
SIGNED_PCTS = (1, 5, 10, 25, 50, 75, 90, 95, 99)


def _f(x: float | np.floating[Any]) -> float | None:
    """JSON-safe float (NaN/inf -> None)."""
    v = float(x)
    return v if math.isfinite(v) else None


def error_summary(
    forecast: Sequence[float] | pd.Series | np.ndarray,
    actual: Sequence[float] | pd.Series | np.ndarray,
    mape_min_actual_mw: float = 500.0,
) -> dict[str, Any]:
    """Headline accuracy metrics for paired forecast/actual values (NaN pairs are dropped)."""
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    ok = np.isfinite(f) & np.isfinite(a)
    f, a = f[ok], a[ok]
    n = int(f.size)
    if n == 0:
        return {"n": 0}

    e = f - a
    ae = np.abs(e)
    mape_mask = a >= mape_min_actual_mw
    shortfall = e[e > 0]
    surplus = -e[e < 0]

    return {
        "n": n,
        "mae_mw": _f(ae.mean()),
        "rmse_mw": _f(np.sqrt(np.mean(e**2))),
        "bias_mw": _f(e.mean()),
        "mape_pct": _f(np.mean(ae[mape_mask] / a[mape_mask]) * 100) if mape_mask.any() else None,
        "mape_excluded_n": int((~mape_mask).sum()),
        # WAPE = total absolute error / total actual energy. Robust where MAPE is not.
        "wape_pct": _f(ae.sum() / a.sum() * 100) if a.sum() > 0 else None,
        # MAE relative to the highest observed output in the window (proxy for capacity).
        "mae_pct_of_peak": _f(ae.mean() / a.max() * 100) if a.max() > 0 else None,
        "mean_actual_mw": _f(a.mean()),
        "mean_forecast_mw": _f(f.mean()),
        "peak_actual_mw": _f(a.max()),
        "max_abs_error_mw": _f(ae.max()),
        "abs_pcts": {f"p{p}": _f(np.percentile(ae, p)) for p in ABS_PCTS},
        "signed_pcts": {f"p{p}": _f(np.percentile(e, p)) for p in SIGNED_PCTS},
        "shortfall_share": _f(np.mean(e > 0)),
        "shortfall_mean_mw": _f(shortfall.mean()) if shortfall.size else 0.0,
        "shortfall_max_mw": _f(shortfall.max()) if shortfall.size else 0.0,
        "surplus_share": _f(np.mean(e < 0)),
        "surplus_mean_mw": _f(surplus.mean()) if surplus.size else 0.0,
        "surplus_max_mw": _f(surplus.max()) if surplus.size else 0.0,
        # Buffer that would have covered the shortfall in 90 % / 95 % of hours.
        "buffer_p90_mw": _f(max(np.percentile(e, 90), 0.0)),
        "buffer_p95_mw": _f(max(np.percentile(e, 95), 0.0)),
        "correlation": _f(np.corrcoef(f, a)[0, 1])
        if n > 1 and f.std() > 0 and a.std() > 0
        else None,
    }


def histogram(
    errors: Sequence[float] | pd.Series | np.ndarray, bin_mw: float
) -> list[dict[str, Any]]:
    """Fixed-width histogram of signed errors with bins aligned to multiples of ``bin_mw``."""
    e = np.asarray(errors, dtype=float)
    e = e[np.isfinite(e)]
    if e.size == 0:
        return []
    lo = math.floor(e.min() / bin_mw) * bin_mw
    hi = math.floor(e.max() / bin_mw) * bin_mw + bin_mw
    edges = np.arange(lo, hi + bin_mw / 2, bin_mw)
    counts, _ = np.histogram(e, bins=edges)
    return [
        {"lo_mw": float(a), "hi_mw": float(b), "count": int(c)}
        for a, b, c in zip(edges[:-1], edges[1:], counts, strict=True)
    ]


def band_of(forecast_mw: float, bands: Sequence[WindBand] = WIND_BANDS) -> str:
    for b in bands:
        if forecast_mw >= b.min_mw and (b.max_mw is None or forecast_mw < b.max_mw):
            return b.id
    return bands[0].id  # negative forecasts fall into the lowest band


def assign_bands(forecast_mw: pd.Series, bands: Sequence[WindBand] = WIND_BANDS) -> pd.Series:
    return forecast_mw.map(lambda v: band_of(v, bands) if pd.notna(v) else None)


def group_summary(df: pd.DataFrame, key: str) -> list[dict[str, Any]]:
    """Compact metrics per group. ``df`` needs ``forecast_mw``, ``actual_mw`` and ``key``."""
    scored = df.dropna(subset=["forecast_mw", "actual_mw"])
    out = []
    for k, g in scored.groupby(key, sort=True):
        e = (g["forecast_mw"] - g["actual_mw"]).to_numpy()
        out.append(
            {
                "key": k,
                "n": len(g),
                "mae_mw": _f(np.abs(e).mean()),
                "rmse_mw": _f(np.sqrt(np.mean(e**2))),
                "bias_mw": _f(e.mean()),
                "p90_abs_mw": _f(np.percentile(np.abs(e), 90)),
                "p10_signed_mw": _f(np.percentile(e, 10)),
                "p90_signed_mw": _f(np.percentile(e, 90)),
                "mean_forecast_mw": _f(g["forecast_mw"].mean()),
                "mean_actual_mw": _f(g["actual_mw"].mean()),
            }
        )
    return out


def horizon_buckets(versions: pd.DataFrame, bucket_h: int) -> list[dict[str, Any]]:
    """Error by forecast horizon (start_time - publish_time), in ``bucket_h``-hour buckets."""
    if versions.empty:
        return []
    v = versions.dropna(subset=["forecast_mw", "actual_mw"]).copy()
    v["bucket"] = (np.floor(v["horizon_h"] / bucket_h) * bucket_h).astype(int)
    rows = group_summary(v, "bucket")
    max_n = max((r["n"] for r in rows), default=0)
    for r in rows:
        lo = int(r.pop("key"))
        r["horizon_from_h"] = lo
        r["horizon_to_h"] = lo + bucket_h
        r["label"] = f"{lo}–{lo + bucket_h} h"
        # Long horizons are only reached by early runs for late target hours, so those buckets
        # hold fewer samples from a skewed mix of hours: flag rather than compare like-for-like.
        r["low_coverage"] = r["n"] < 0.9 * max_n
    return rows


def band_quantiles(
    errors: pd.Series, bands: pd.Series, lower_q: float, upper_q: float, min_n: int = 30
) -> dict[str, tuple[float, float, int]]:
    """Per wind band: (lower, upper) quantiles of signed error and sample size.

    Bands with fewer than ``min_n`` samples fall back to the pooled quantiles, so a thin
    band never produces an over-confident range.
    """
    ok = errors.notna() & bands.notna()
    e, b = errors[ok], bands[ok]
    pooled = (
        (float(np.quantile(e, lower_q)), float(np.quantile(e, upper_q)), len(e))
        if len(e)
        else (0.0, 0.0, 0)
    )
    out: dict[str, tuple[float, float, int]] = {"all": pooled}
    for band in WIND_BANDS:
        sub = e[b == band.id]
        if len(sub) >= min_n:
            out[band.id] = (
                float(np.quantile(sub, lower_q)),
                float(np.quantile(sub, upper_q)),
                len(sub),
            )
        else:
            out[band.id] = (pooled[0], pooled[1], len(sub))
    return out
