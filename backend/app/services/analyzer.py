"""Builds view payloads from the in-memory snapshot, with memoisation.

The snapshot is immutable and small (~20k forecast rows), so every request is computed from it
in milliseconds and cached by its (hashable) arguments. The browser never waits on Elexon.
"""

from __future__ import annotations

from collections.abc import Callable, Hashable
from datetime import date, time, timedelta
from functools import lru_cache
from threading import Lock
from typing import Any, TypeVar, cast

import numpy as np
import pandas as pd

from app.config import CUTOFF_PRESETS, MARKET_TZ, WIND_BANDS, Settings, settings
from app.core.insights import build_insights
from app.core.metrics import (
    assign_bands,
    band_quantiles,
    error_summary,
    group_summary,
    histogram,
    horizon_buckets,
)
from app.core.selection import (
    all_versions_with_actuals,
    cutoff_utc,
    delivery_day_bounds,
    join_actuals,
    parse_cutoff,
    select_forecasts,
    target_grid,
)
from app.data.store import Snapshot, get_snapshot

T = TypeVar("T")
ISO = "%Y-%m-%dT%H:%M:%SZ"


def _iso(ts: pd.Timestamp) -> str:
    return ts.tz_convert("UTC").strftime(ISO)


def _num(v: Any) -> float | None:
    return None if v is None or pd.isna(v) else float(v)


def fmt_cutoff(t: time) -> str:
    return f"{t.hour:02d}:{t.minute:02d}"


def days_between(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


class Analyzer:
    def __init__(self, snapshot: Snapshot, cfg: Settings = settings) -> None:
        self.snap = snapshot
        self.cfg = cfg
        self._cache: dict[Hashable, Any] = {}
        self._lock = Lock()
        self.regular_run_times = self._regular_run_times()

    # ------------------------------------------------------------------ helpers
    def _memo(self, key: Hashable, fn: Callable[[], T]) -> T:
        with self._lock:
            if key in self._cache:
                return cast(T, self._cache[key])
        value = fn()
        with self._lock:
            self._cache[key] = value
        return value

    def _regular_run_times(self) -> list[str]:
        """Times of day at which WINDFOR runs are normally published (seen on >= 50 % of days)."""
        pubs = pd.Series(self.snap.forecasts["publish_time"].unique())
        if pubs.empty:
            return []
        tod = pubs.dt.strftime("%H:%M")
        n_days = pubs.dt.date.nunique()
        counts = tod.value_counts()
        return sorted(counts[counts >= 0.5 * n_days].index.tolist())

    def scope_days(self) -> list[date]:
        return days_between(self.cfg.scope_first_day, self.cfg.scope_last_day)

    def evaluate(self, days: tuple[date, ...], cutoff: time) -> pd.DataFrame:
        """Hourly grid for ``days`` with the selected forecast, actual, error and wind band."""

        def run() -> pd.DataFrame:
            selected = select_forecasts(
                self.snap.forecasts, days, cutoff, self.cfg.lead_days, MARKET_TZ
            )
            joined = join_actuals(target_grid(days, "1h", MARKET_TZ), selected, self.snap.actuals)
            joined["band"] = assign_bands(joined["forecast_mw"])
            joined["hour"] = joined["start_time"].dt.tz_convert(MARKET_TZ).dt.hour
            return joined

        return self._memo(("evaluate", days, cutoff), run)

    def _quality(self, joined: pd.DataFrame, days: list[date]) -> dict[str, Any]:
        """Data-quality checks for an evaluation window, surfaced in the UI (never hidden)."""
        lo, hi = joined["start_time"].min(), joined["start_time"].max() + pd.Timedelta(hours=1)
        act = self.snap.actuals
        hh = act[(act["start_time"] >= lo) & (act["start_time"] < hi)]
        expected_hh = len(target_grid(days, "30min", MARKET_TZ))
        missing_fc = joined[joined["forecast_mw"].isna()]["start_time"]
        missing_act = joined[joined["actual_mw"].isna()]["start_time"]
        sel = joined.dropna(subset=["publish_time"])
        stale = sel[sel["age_at_cutoff_h"] > self.cfg.stale_forecast_h]
        runs_used = sorted(pd.Series(sel["publish_time"].unique()).map(_iso).tolist())
        fc = self.snap.forecasts
        window_runs = pd.Series(
            fc[(fc["publish_time"] >= lo - pd.Timedelta(days=3)) & (fc["publish_time"] < hi)][
                "publish_time"
            ].unique()
        )
        off = window_runs[~window_runs.dt.strftime("%H:%M").isin(self.regular_run_times)]
        off_used = [t for t in off.map(_iso) if t in set(runs_used)]

        def check(cid: str, label: str, ok: bool, detail: str, warn: bool = True) -> dict[str, str]:
            return {
                "id": cid,
                "label": label,
                "status": "ok" if ok else ("warning" if warn else "info"),
                "detail": detail,
            }

        checks = [
            check(
                "forecast-coverage",
                "Forecast coverage",
                missing_fc.empty,
                f"{len(joined) - len(missing_fc)}/{len(joined)} target hours have a forecast "
                "published before the cutoff"
                + (
                    f"; missing: {', '.join(missing_fc.head(6).map(_iso))}"
                    + ("…" if len(missing_fc) > 6 else "")
                    if not missing_fc.empty
                    else ""
                ),
            ),
            check(
                "actual-coverage",
                "Actual generation coverage",
                missing_act.empty and len(hh) == expected_hh,
                f"{len(hh)}/{expected_hh} half-hours of FUELHH WIND present; "
                f"{len(joined) - len(missing_act)}/{len(joined)} hourly targets scoreable",
            ),
            check(
                "freshness",
                "Forecast freshness at cutoff",
                stale.empty,
                f"all selected forecasts were published ≤ {self.cfg.stale_forecast_h:g} h before "
                "the cutoff"
                if stale.empty
                else f"{len(stale)} target hours use a forecast older than "
                f"{self.cfg.stale_forecast_h:g} h at the cutoff",
            ),
            check(
                "schedule",
                "Forecast publication schedule",
                off.empty,
                "all runs published on the regular schedule "
                f"({', '.join(self.regular_run_times)} UTC)"
                if off.empty
                else f"{len(off)} off-schedule run(s): {', '.join(off.map(_iso))}"
                + (" (used in this selection)" if off_used else " (not used by this cutoff)"),
                warn=bool(off_used),
            ),
            check(
                "resolution",
                "Resolution alignment",
                False,
                "Forecasts are hourly, actuals half-hourly: accuracy is scored on the 24 hourly "
                "timestamps per day (actual for the half-hour starting on the hour).",
                warn=False,
            ),
        ]
        status = "warning" if any(c["status"] == "warning" for c in checks) else "ok"
        return {
            "status": status,
            "checks": checks,
            "expected_hours": len(joined),
            "forecast_hours": len(joined) - len(missing_fc),
            "actual_hours": len(joined) - len(missing_act),
            "scored_hours": int(joined["error_mw"].notna().sum()),
            "runs_used": runs_used,
        }

    # ------------------------------------------------------------------ View 1
    def day_forecast(self, day: date, cutoff: time) -> dict[str, Any]:
        return self._memo(("day", day, cutoff), lambda: self._day_forecast(day, cutoff))

    def _day_forecast(self, day: date, cutoff: time) -> dict[str, Any]:
        cfg = self.cfg
        joined = self.evaluate((day,), cutoff).copy()
        # Planning range from the errors of *other* days at the same cutoff (no look-ahead into D).
        others = tuple(d for d in self.scope_days() if d != day)
        hist = self.evaluate(others, cutoff)
        q = band_quantiles(hist["error_mw"], hist["band"], cfg.band_lower_q, cfg.band_upper_q)
        lo_q = joined["band"].map(lambda b: q.get(b, q["all"])[0] if b else np.nan)
        hi_q = joined["band"].map(lambda b: q.get(b, q["all"])[1] if b else np.nan)
        # actual = forecast - error  ->  actual P10 = forecast - error P90, and vice versa.
        joined["range_low_mw"] = (joined["forecast_mw"] - hi_q).clip(lower=0)
        joined["range_high_mw"] = joined["forecast_mw"] - lo_q

        fc = joined.dropna(subset=["forecast_mw"])
        kpis: dict[str, Any] = {}
        if not fc.empty:
            peak = fc.loc[fc["forecast_mw"].idxmax()]
            low = fc.loc[fc["forecast_mw"].idxmin()]
            kpis = {
                "peak_mw": float(peak["forecast_mw"]),
                "peak_time": _iso(peak["start_time"]),
                "min_mw": float(low["forecast_mw"]),
                "min_time": _iso(low["start_time"]),
                "mean_mw": float(fc["forecast_mw"].mean()),
                # hourly MW values -> MWh: each value covers one hour
                "total_mwh": float(fc["forecast_mw"].sum()),
                "firm_total_mwh": float(fc["range_low_mw"].sum()),
                "firm_mean_mw": float(fc["range_low_mw"].mean()),
                "hours": len(fc),
            }

        runs = (
            fc.groupby("publish_time")
            .agg(hours=("start_time", "size"), age=("age_at_cutoff_h", "first"))
            .reset_index()
        )
        cutoff_ts = fc["cutoff"].iloc[0] if not fc.empty else None

        act = self.snap.actuals
        lo_t, hi_t = joined["start_time"].min(), joined["start_time"].max() + pd.Timedelta(hours=1)
        hh = act[(act["start_time"] >= lo_t) & (act["start_time"] < hi_t)]

        scored = joined.dropna(subset=["forecast_mw", "actual_mw"])
        outcome = None
        if not scored.empty:
            s = error_summary(scored["forecast_mw"], scored["actual_mw"], cfg.mape_min_actual_mw)
            inside = (scored["actual_mw"] >= scored["range_low_mw"]) & (
                scored["actual_mw"] <= scored["range_high_mw"]
            )
            outcome = {
                "mae_mw": s["mae_mw"],
                "bias_mw": s["bias_mw"],
                "actual_total_mwh": float(hh["generation_mw"].sum() / 2),  # half-hours -> MWh
                "forecast_total_mwh": kpis.get("total_mwh"),
                "within_range_share": float(inside.mean()),
                "scored_hours": len(scored),
            }

        used = set(runs["publish_time"])
        return {
            "delivery_day": day.isoformat(),
            "cutoff": self._cutoff_info(cutoff, cutoff_ts),
            "run_timeline": self._run_timeline(day, cutoff, used),
            "evolution": self._evolution(day, cutoff, used),
            "runs_used": [
                {
                    "publish_time": _iso(r.publish_time),
                    "hours": int(r.hours),
                    "age_at_cutoff_h": float(r.age),
                }
                for r in runs.itertuples()
            ],
            "points": [
                {
                    "start_time": _iso(r.start_time),
                    "forecast_mw": _num(r.forecast_mw),
                    "range_low_mw": _num(r.range_low_mw),
                    "range_high_mw": _num(r.range_high_mw),
                    "actual_mw": _num(r.actual_mw),
                    "publish_time": _iso(r.publish_time) if pd.notna(r.publish_time) else None,
                    "horizon_h": _num(r.horizon_h),
                    "band": r.band if isinstance(r.band, str) else None,
                }
                for r in joined.itertuples()
            ],
            "actuals_halfhourly": [
                {"start_time": _iso(r.start_time), "actual_mw": float(r.generation_mw)}
                for r in hh.itertuples()
            ],
            "kpis": kpis,
            "planning_range": {
                "lower_q": cfg.band_lower_q,
                "upper_q": cfg.band_upper_q,
                "method": "Empirical quantiles of forecast error at this cutoff, by forecast wind "
                "band, from the other delivery days in the pilot (the selected day is excluded).",
                "bands": [
                    {
                        "band": b.id,
                        "label": b.label,
                        "error_low_mw": q[b.id][0],
                        "error_high_mw": q[b.id][1],
                        "n": q[b.id][2],
                    }
                    for b in WIND_BANDS
                ],
            },
            "outcome": outcome,
            "data_quality": self._quality(joined, [day]),
        }

    def _run_timeline(
        self, day: date, cutoff: time, used: set[pd.Timestamp]
    ) -> list[dict[str, Any]]:
        """Every run published on the decision day (plus any run actually used), with its
        forecast for ``day`` and whether the buyer could have seen it at the cutoff."""
        cut = cutoff_utc(day, cutoff, self.cfg.lead_days, MARKET_TZ)
        pub_lo, pub_hi = delivery_day_bounds(day - timedelta(days=self.cfg.lead_days), MARKET_TZ)
        d_lo, d_hi = delivery_day_bounds(day, MARKET_TZ)
        fc = self.snap.forecasts
        runs = fc[
            (
                ((fc["publish_time"] >= pub_lo) & (fc["publish_time"] < pub_hi))
                | fc["publish_time"].isin(used)
            )
            & (fc["start_time"] >= d_lo)
            & (fc["start_time"] < d_hi)
        ]
        act = self.snap.actuals[["start_time", "generation_mw"]]
        out = []
        for pub, g in runs.groupby("publish_time", sort=True):
            status = "used" if pub in used else ("superseded" if pub <= cut else "after_cutoff")
            scored = g.merge(act, on="start_time", how="inner")
            mae = (scored["generation_mw_x"] - scored["generation_mw_y"]).abs().mean()
            out.append(
                {
                    "publish_time": _iso(pub),
                    "status": status,
                    "hours": len(g),
                    "mae_mw": _num(mae) if not scored.empty else None,
                    "values": [
                        {"start_time": _iso(r.start_time), "forecast_mw": float(r.generation_mw)}
                        for r in g.sort_values("start_time").itertuples()
                    ],
                }
            )
        return out

    def _evolution(self, day: date, cutoff: time, used: set[pd.Timestamp]) -> dict[str, Any]:
        """How the forecast for ``day`` changed over every run published in the two days before it.

        Runs published on D-2 stop at 21:00 on D, so runs are compared on the hours that *all* of
        them cover; that keeps the run-to-run comparison like for like.
        """
        cut = cutoff_utc(day, cutoff, self.cfg.lead_days, MARKET_TZ)
        d_lo, d_hi = delivery_day_bounds(day, MARKET_TZ)
        pub_lo, _ = delivery_day_bounds(day - timedelta(days=2), MARKET_TZ)
        fc = self.snap.forecasts
        sub = fc[
            (fc["publish_time"] >= pub_lo)
            & (fc["publish_time"] < d_lo)
            & (fc["start_time"] >= d_lo)
            & (fc["start_time"] < d_hi)
        ]
        empty = {"hours": 0, "first_hour": None, "last_hour": None, "actual_mean_mw": None}
        if sub.empty:
            return {**empty, "runs": []}
        n_runs = sub["publish_time"].nunique()
        per_hour = sub.groupby("start_time")["publish_time"].nunique()
        common = per_hour[per_hour == n_runs].index
        sub = sub[sub["start_time"].isin(common)]
        actual = self.snap.actuals.set_index("start_time")["generation_mw"]
        actual_common = actual.reindex(common)
        runs = []
        for pub, g in sub.groupby("publish_time", sort=True):
            err = g["generation_mw"] - g["start_time"].map(actual)
            status = "used" if pub in used else ("superseded" if pub <= cut else "after_cutoff")
            runs.append(
                {
                    "publish_time": _iso(pub),
                    "status": status,
                    "lead_h": float((d_lo - pub) / pd.Timedelta(hours=1)),
                    "mean_forecast_mw": float(g["generation_mw"].mean()),
                    "mae_mw": _num(err.abs().mean()) if err.notna().any() else None,
                    "bias_mw": _num(err.mean()) if err.notna().any() else None,
                }
            )
        return {
            "hours": len(common),
            "first_hour": _iso(common.min()),
            "last_hour": _iso(common.max()),
            "actual_mean_mw": _num(actual_common.mean()) if actual_common.notna().any() else None,
            "runs": runs,
        }

    def _cutoff_info(self, cutoff: time, cutoff_ts: pd.Timestamp | None) -> dict[str, Any]:
        label = fmt_cutoff(cutoff)
        preset = next((p for p in CUTOFF_PRESETS if p.time == label), None)
        return {
            "time": label,
            "timezone": MARKET_TZ,
            "lead_days": self.cfg.lead_days,
            "utc": _iso(cutoff_ts) if cutoff_ts is not None else None,
            "preset_id": preset.id if preset else None,
            "preset_label": preset.label if preset else "Custom cutoff",
        }

    # ------------------------------------------------------------------ View 2
    def accuracy(self, start: date, end: date, cutoff: time) -> dict[str, Any]:
        return self._memo(("acc", start, end, cutoff), lambda: self._accuracy(start, end, cutoff))

    def _accuracy(self, start: date, end: date, cutoff: time) -> dict[str, Any]:
        cfg = self.cfg
        days = days_between(start, end)
        joined = self.evaluate(tuple(days), cutoff)
        scored = joined.dropna(subset=["forecast_mw", "actual_mw"]).copy()
        summary = error_summary(scored["forecast_mw"], scored["actual_mw"], cfg.mape_min_actual_mw)

        by_hour = group_summary(scored, "hour")
        by_band = group_summary(scored, "band")
        order = {b.id: i for i, b in enumerate(WIND_BANDS)}
        labels = {b.id: b.label for b in WIND_BANDS}
        by_band = sorted(by_band, key=lambda r: order[r["key"]])
        for r in by_band:
            r["label"] = labels[r["key"]]
        scored["day"] = scored["delivery_day"].map(lambda d: d.isoformat())
        by_day = group_summary(scored, "day")

        cutoff_label = fmt_cutoff(cutoff)
        alternatives = []
        for p in CUTOFF_PRESETS:
            if p.time <= cutoff_label:
                continue
            alt = self.evaluate(tuple(days), parse_cutoff(p.time)).dropna(
                subset=["forecast_mw", "actual_mw"]
            )
            alt_mae = float((alt["forecast_mw"] - alt["actual_mw"]).abs().mean())
            alternatives.append({"label": p.label, "time": p.time, "mae_mw": alt_mae})

        hh, daily, energy = self._energy(joined, days)
        insights = build_insights(
            summary, cutoff_label, by_band, by_hour, alternatives=alternatives, energy=energy
        )

        sel = joined.dropna(subset=["forecast_mw"])
        return {
            "range": {"start": start.isoformat(), "end": end.isoformat(), "days": len(days)},
            "cutoff": self._cutoff_info(cutoff, sel["cutoff"].iloc[0] if not sel.empty else None),
            "summary": summary,
            "horizon_range_h": [float(sel["horizon_h"].min()), float(sel["horizon_h"].max())]
            if not sel.empty
            else None,
            "series": [
                {
                    "start_time": _iso(r.start_time),
                    "forecast_mw": _num(r.forecast_mw),
                    "actual_mw": _num(r.actual_mw),
                    "error_mw": _num(r.error_mw),
                }
                for r in joined.itertuples()
            ],
            "actuals_halfhourly": [
                {"start_time": _iso(r.start_time), "actual_mw": float(r.generation_mw)}
                for r in hh.itertuples()
            ],
            "daily_energy": daily,
            "energy": energy,
            "histogram": histogram(scored["error_mw"], cfg.histogram_bin_mw),
            "by_hour": by_hour,
            "by_band": by_band,
            "by_day": by_day,
            "insights": insights,
            "data_quality": self._quality(joined, days),
        }

    def _energy(
        self, joined: pd.DataFrame, days: list[date]
    ) -> tuple[pd.DataFrame, list[dict[str, Any]], dict[str, Any] | None]:
        """Half-hourly actuals for the window, and forecast vs actual *energy* per day and overall.

        Energy uses both half-hours of every hour (MWh = mean MW over the hour), so every actual
        reading counts. Only hours that have both a forecast and both half-hours are compared.
        """
        lo, _ = delivery_day_bounds(days[0], MARKET_TZ)
        _, hi = delivery_day_bounds(days[-1], MARKET_TZ)
        act = self.snap.actuals
        hh = act[(act["start_time"] >= lo) & (act["start_time"] < hi)]
        by_t = hh.set_index("start_time")["generation_mw"]
        e = joined.dropna(subset=["forecast_mw"]).copy()
        first = e["start_time"].map(by_t)
        second = (e["start_time"] + pd.Timedelta(minutes=30)).map(by_t)
        e["actual_mwh"] = (first + second) / 2
        e = e.dropna(subset=["actual_mwh"])
        if e.empty:
            return hh, [], None
        g = (
            e.groupby("delivery_day")
            .agg(
                forecast_mwh=("forecast_mw", "sum"),
                actual_mwh=("actual_mwh", "sum"),
                hours=("start_time", "size"),
            )
            .reset_index()
        )
        daily = [
            {
                "day": r.delivery_day.isoformat(),
                "forecast_mwh": float(r.forecast_mwh),
                "actual_mwh": float(r.actual_mwh),
                "error_mwh": float(r.forecast_mwh - r.actual_mwh),
                "hours": int(r.hours),
            }
            for r in g.itertuples()
        ]
        fc_total, act_total = float(g["forecast_mwh"].sum()), float(g["actual_mwh"].sum())
        energy = {
            "forecast_mwh": fc_total,
            "actual_mwh": act_total,
            "error_mwh": fc_total - act_total,
            "error_pct": (fc_total - act_total) / act_total * 100 if act_total else None,
            "short_days": int((g["forecast_mwh"] > g["actual_mwh"]).sum()),
            "days": len(g),
        }
        return hh, daily, energy

    # ------------------------------------------------------------- horizon / cutoffs
    def horizon(self, start: date, end: date, bucket_h: int | None = None) -> dict[str, Any]:
        size = bucket_h or self.cfg.horizon_bucket_h

        def run() -> dict[str, Any]:
            days = days_between(start, end)
            versions = all_versions_with_actuals(
                self.snap.forecasts, self.snap.actuals, days, MARKET_TZ
            )
            return {
                "range": {"start": start.isoformat(), "end": end.isoformat(), "days": len(days)},
                "bucket_h": size,
                "buckets": horizon_buckets(versions, size),
                "versions_scored": len(versions),
                "runs": int(versions["publish_time"].nunique()) if len(versions) else 0,
            }

        return self._memo(("horizon", start, end, size), run)

    def cutoff_sweep(self, start: date, end: date, step_min: int = 30) -> dict[str, Any]:
        def run() -> dict[str, Any]:
            days = tuple(days_between(start, end))
            times = {time(h, m) for h in range(24) for m in range(0, 60, step_min)}
            times |= {parse_cutoff(p.time) for p in CUTOFF_PRESETS}
            points = []
            for t in sorted(times):
                j = self.evaluate(days, t)
                sc = j.dropna(subset=["forecast_mw", "actual_mw"])
                s = error_summary(sc["forecast_mw"], sc["actual_mw"], self.cfg.mape_min_actual_mw)
                pub = sc["publish_time"].dt.strftime("%H:%M")
                points.append(
                    {
                        "time": fmt_cutoff(t),
                        "n": s["n"],
                        "mae_mw": s.get("mae_mw"),
                        "rmse_mw": s.get("rmse_mw"),
                        "bias_mw": s.get("bias_mw"),
                        "buffer_p90_mw": s.get("buffer_p90_mw"),
                        "run_time": pub.mode().iloc[0] if not pub.empty else None,
                        "mean_horizon_h": float(sc["horizon_h"].mean()) if s["n"] else None,
                    }
                )
            by_time = {p["time"]: p for p in points}
            presets = [{"id": p.id, "label": p.label, **by_time[p.time]} for p in CUTOFF_PRESETS]
            return {
                "range": {"start": start.isoformat(), "end": end.isoformat(), "days": len(days)},
                "points": points,
                "presets": presets,
            }

        return self._memo(("sweep", start, end, step_min), run)

    # ------------------------------------------------------------------ meta
    def meta(self) -> dict[str, Any]:
        cfg = self.cfg
        m = self.snap.manifest
        return {
            "scope": {
                "first_delivery_day": cfg.scope_first_day.isoformat(),
                "last_delivery_day": cfg.scope_last_day.isoformat(),
                "first_decision_day": (
                    cfg.scope_first_day - timedelta(days=cfg.lead_days)
                ).isoformat(),
                "last_decision_day": (
                    cfg.scope_last_day - timedelta(days=cfg.lead_days)
                ).isoformat(),
                "description": "Purchase decisions made in January 2026 (cutoff on D-1), i.e. "
                "delivery days 2 Jan – 1 Feb 2026.",
            },
            "timezone": MARKET_TZ,
            "timezone_note": "All data is stored in UTC. Cutoffs are UK local time; January is GMT, "
            "so UK time equals UTC throughout the pilot.",
            "default_cutoff": fmt_cutoff(cfg.default_cutoff),
            "presets": [
                {"id": p.id, "label": p.label, "time": p.time, "description": p.description}
                for p in CUTOFF_PRESETS
            ],
            "bands": [
                {"id": b.id, "label": b.label, "min_mw": b.min_mw, "max_mw": b.max_mw}
                for b in WIND_BANDS
            ],
            "sign_convention": "error = forecast − actual. Positive = forecast too high = wind "
            "shortfall (buyer short).",
            "regular_run_times_utc": self.regular_run_times,
            "snapshot": {
                "source": m.get("source"),
                "fetched_at": m.get("fetched_at"),
                "forecast_rows": m.get("windfor", {}).get("clean_rows"),
                "forecast_runs": m.get("windfor", {}).get("runs"),
                "actual_rows": m.get("fuelhh", {}).get("clean_rows"),
            },
        }


@lru_cache(maxsize=1)
def get_analyzer() -> Analyzer:
    return Analyzer(get_snapshot())
