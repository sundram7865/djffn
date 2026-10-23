from __future__ import annotations

import math
import statistics

import numpy as np
import pandas as pd
import pytest

from app.core.metrics import (
    assign_bands,
    band_of,
    band_quantiles,
    error_summary,
    group_summary,
    histogram,
    horizon_buckets,
)


class TestErrorSummary:
    def test_hand_computed_values(self) -> None:
        f = [110.0, 90.0, 130.0, 100.0]
        a = [100.0, 100.0, 100.0, 100.0]
        s = error_summary(f, a, mape_min_actual_mw=0)
        # errors (f - a) = [10, -10, 30, 0]
        assert s["n"] == 4
        assert s["mae_mw"] == pytest.approx(12.5)
        assert s["rmse_mw"] == pytest.approx(math.sqrt((100 + 100 + 900 + 0) / 4))
        assert s["bias_mw"] == pytest.approx(7.5)
        assert s["mape_pct"] == pytest.approx(12.5)
        assert s["wape_pct"] == pytest.approx(50 / 400 * 100)
        assert s["shortfall_share"] == pytest.approx(0.5)
        assert s["surplus_share"] == pytest.approx(0.25)
        assert s["shortfall_mean_mw"] == pytest.approx(20)
        assert s["shortfall_max_mw"] == pytest.approx(30)
        assert s["surplus_max_mw"] == pytest.approx(10)
        assert s["max_abs_error_mw"] == pytest.approx(30)

    def test_percentiles_match_statistics_module(self) -> None:
        rng = np.random.default_rng(7)
        a = rng.uniform(2000, 18000, 500)
        f = a + rng.normal(1500, 2000, 500)
        s = error_summary(f, a)
        e = list(f - a)
        q = statistics.quantiles(e, n=100, method="inclusive")
        aq = statistics.quantiles([abs(x) for x in e], n=100, method="inclusive")
        for p in (1, 5, 10, 25, 50, 75, 90, 95, 99):
            assert s["signed_pcts"][f"p{p}"] == pytest.approx(q[p - 1])
        for p in (50, 90, 95, 99):
            assert s["abs_pcts"][f"p{p}"] == pytest.approx(aq[p - 1])
        assert s["buffer_p90_mw"] == pytest.approx(max(q[89], 0))

    def test_nan_pairs_are_dropped(self) -> None:
        s = error_summary([1.0, np.nan, 3.0], [1.0, 2.0, np.nan], mape_min_actual_mw=0)
        assert s["n"] == 1 and s["mae_mw"] == 0

    def test_empty(self) -> None:
        assert error_summary([], []) == {"n": 0}

    def test_mape_excludes_near_zero_actuals(self) -> None:
        s = error_summary([600.0, 100.0], [500.0, 10.0], mape_min_actual_mw=500)
        assert s["mape_excluded_n"] == 1
        assert s["mape_pct"] == pytest.approx(20.0)

    def test_buffer_is_never_negative(self) -> None:
        s = error_summary([0.0, 0.0, 0.0], [10.0, 20.0, 30.0])
        assert s["buffer_p90_mw"] == 0.0


class TestHistogram:
    def test_counts_and_alignment(self) -> None:
        e = [-750, -10, 0, 10, 499, 500, 1200]
        bins = histogram(e, 500)
        assert sum(b["count"] for b in bins) == len(e)
        assert bins[0]["lo_mw"] == -1000 and bins[-1]["hi_mw"] == 1500
        assert all(b["hi_mw"] - b["lo_mw"] == 500 for b in bins)
        by_lo = {b["lo_mw"]: b["count"] for b in bins}
        assert by_lo[0] == 3 and by_lo[500] == 1 and by_lo[-500] == 1

    def test_empty(self) -> None:
        assert histogram([np.nan], 500) == []


class TestBands:
    @pytest.mark.parametrize(
        ("mw", "band"),
        [
            (-50, "low"),
            (0, "low"),
            (7999.9, "low"),
            (8000, "medium"),
            (13999, "medium"),
            (14000, "high"),
            (25000, "high"),
        ],
    )
    def test_boundaries(self, mw: float, band: str) -> None:
        assert band_of(mw) == band

    def test_assign_bands_keeps_missing(self) -> None:
        out = assign_bands(pd.Series([100.0, np.nan, 15000.0]))
        assert out.iloc[0] == "low" and pd.isna(out.iloc[1]) and out.iloc[2] == "high"

    def test_band_quantiles_fall_back_when_thin(self) -> None:
        errors = pd.Series([float(x) for x in range(100)] + [1000.0])
        bands = pd.Series(["medium"] * 100 + ["high"])
        q = band_quantiles(errors, bands, 0.1, 0.9, min_n=30)
        assert q["medium"][2] == 100
        assert q["high"][:2] == q["all"][:2]  # 1 sample -> pooled quantiles
        assert q["high"][2] == 1


class TestGroups:
    def test_group_summary(self) -> None:
        df = pd.DataFrame(
            {
                "forecast_mw": [10.0, 20.0, 30.0, 40.0],
                "actual_mw": [0.0, 20.0, 40.0, 40.0],
                "k": ["a", "a", "b", "b"],
            }
        )
        out = {r["key"]: r for r in group_summary(df, "k")}
        assert out["a"]["mae_mw"] == 5 and out["a"]["bias_mw"] == 5
        assert out["b"]["mae_mw"] == 5 and out["b"]["bias_mw"] == -5

    def test_horizon_buckets_flag_low_coverage(self) -> None:
        df = pd.DataFrame(
            {
                "horizon_h": [1, 2, 3, 4, 7, 8, 9, 10, 13],
                "forecast_mw": [1.0] * 9,
                "actual_mw": [0.0] * 9,
            }
        )
        out = horizon_buckets(df, 6)
        assert [b["label"] for b in out] == ["0–6 h", "6–12 h", "12–18 h"]
        assert [b["low_coverage"] for b in out] == [False, False, True]
