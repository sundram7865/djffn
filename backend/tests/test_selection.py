"""Point-in-time forecast selection: the most important rule in the product."""

from __future__ import annotations

from datetime import date, time, timedelta

import numpy as np
import pandas as pd
import pytest

from app.core.selection import (
    all_versions_with_actuals,
    cutoff_utc,
    delivery_day_bounds,
    join_actuals,
    parse_cutoff,
    select_forecasts,
    target_grid,
)
from tests.conftest import make_actuals, make_forecasts, ts

D = date(2026, 1, 15)  # delivery day used in the synthetic cases; cutoff 09:20 on 14 Jan (GMT)


def pick(selected: pd.DataFrame, start: str) -> pd.Series:
    rows = selected[selected["start_time"] == ts(start)]
    assert len(rows) == 1, f"expected exactly one selection for {start}"
    return rows.iloc[0]


class TestParseCutoff:
    def test_valid(self) -> None:
        assert parse_cutoff("09:20") == time(9, 20)
        assert parse_cutoff("00:00") == time(0, 0)
        assert parse_cutoff("23:59") == time(23, 59)

    @pytest.mark.parametrize("bad", ["9:20", "0920", "24:00", "09:60", "ab:cd", "", "09:20:00"])
    def test_invalid(self, bad: str) -> None:
        with pytest.raises(ValueError):
            parse_cutoff(bad)


class TestCutoffAndDayBounds:
    def test_cutoff_is_on_previous_day_in_gmt(self) -> None:
        assert cutoff_utc(D, time(9, 20)) == ts("2026-01-14 09:20")

    def test_cutoff_lead_days(self) -> None:
        assert cutoff_utc(D, time(9, 20), lead_days=2) == ts("2026-01-13 09:20")

    def test_cutoff_respects_bst(self) -> None:
        # 31 Mar 2026 is BST (UTC+1): 09:20 local is 08:20 UTC.
        assert cutoff_utc(date(2026, 4, 1), time(9, 20)) == ts("2026-03-31 08:20")

    def test_gmt_day_bounds(self) -> None:
        assert delivery_day_bounds(D) == (ts("2026-01-15 00:00"), ts("2026-01-16 00:00"))

    def test_short_and_long_clock_change_days(self) -> None:
        assert len(target_grid([date(2026, 3, 29)])) == 23
        assert len(target_grid([date(2026, 10, 25)])) == 25
        assert len(target_grid([D], freq="30min")) == 48


class TestSelectForecasts:
    def test_latest_version_before_cutoff_wins(self) -> None:
        fc = make_forecasts(
            [
                ("2026-01-13 22:30", "2026-01-15 12:00", 100),
                ("2026-01-14 04:30", "2026-01-15 12:00", 200),
                ("2026-01-14 07:30", "2026-01-15 12:00", 300),  # latest before 09:20 -> chosen
                ("2026-01-14 09:30", "2026-01-15 12:00", 400),  # after cutoff -> ignored
                ("2026-01-14 22:30", "2026-01-15 12:00", 500),  # newest in dataset -> ignored
            ]
        )
        row = pick(select_forecasts(fc, [D], time(9, 20)), "2026-01-15 12:00")
        assert row["forecast_mw"] == 300
        assert row["publish_time"] == ts("2026-01-14 07:30")

    def test_published_exactly_at_cutoff_is_included(self) -> None:
        fc = make_forecasts(
            [
                ("2026-01-14 07:30", "2026-01-15 06:00", 1),
                ("2026-01-14 09:20", "2026-01-15 06:00", 2),
            ]
        )
        assert pick(select_forecasts(fc, [D], time(9, 20)), "2026-01-15 06:00")["forecast_mw"] == 2

    def test_published_one_second_after_cutoff_is_excluded(self) -> None:
        fc = make_forecasts(
            [
                ("2026-01-14 07:30:00", "2026-01-15 06:00", 1),
                ("2026-01-14 09:20:01", "2026-01-15 06:00", 2),
            ]
        )
        assert pick(select_forecasts(fc, [D], time(9, 20)), "2026-01-15 06:00")["forecast_mw"] == 1

    def test_no_version_before_cutoff_means_missing(self) -> None:
        fc = make_forecasts([("2026-01-14 09:30", "2026-01-15 06:00", 1)])
        assert select_forecasts(fc, [D], time(9, 20)).empty

    def test_versions_can_differ_per_target(self) -> None:
        # The 07:30 run lacks 13:00 (e.g. a truncated run): 13:00 falls back to the 04:30 run.
        fc = make_forecasts(
            [
                ("2026-01-14 04:30", "2026-01-15 12:00", 10),
                ("2026-01-14 04:30", "2026-01-15 13:00", 11),
                ("2026-01-14 07:30", "2026-01-15 12:00", 20),
            ]
        )
        sel = select_forecasts(fc, [D], time(9, 20))
        assert pick(sel, "2026-01-15 12:00")["publish_time"] == ts("2026-01-14 07:30")
        assert pick(sel, "2026-01-15 13:00")["publish_time"] == ts("2026-01-14 04:30")

    def test_day_boundary_uses_each_days_own_cutoff(self) -> None:
        # 23:00 on 15 Jan is decided on 14 Jan; 00:00 on 16 Jan is decided on 15 Jan.
        fc = make_forecasts(
            [
                ("2026-01-14 07:30", "2026-01-15 23:00", 1),
                ("2026-01-14 07:30", "2026-01-16 00:00", 1),
                ("2026-01-15 07:30", "2026-01-15 23:00", 2),
                ("2026-01-15 07:30", "2026-01-16 00:00", 2),
            ]
        )
        sel = select_forecasts(fc, [D, D + timedelta(days=1)], time(9, 20))
        assert pick(sel, "2026-01-15 23:00")["forecast_mw"] == 1
        assert pick(sel, "2026-01-16 00:00")["forecast_mw"] == 2

    def test_targets_outside_requested_days_are_ignored(self) -> None:
        fc = make_forecasts(
            [
                ("2026-01-14 07:30", "2026-01-14 23:00", 1),
                ("2026-01-14 07:30", "2026-01-15 00:00", 2),
                ("2026-01-14 07:30", "2026-01-16 00:00", 3),
            ]
        )
        sel = select_forecasts(fc, [D], time(9, 20))
        assert list(sel["start_time"]) == [ts("2026-01-15 00:00")]

    def test_input_order_and_duplicates_do_not_matter(self) -> None:
        rows = [
            ("2026-01-14 07:30", "2026-01-15 12:00", 300),
            ("2026-01-14 04:30", "2026-01-15 12:00", 200),
            ("2026-01-14 07:30", "2026-01-15 12:00", 300),
        ]
        sel = select_forecasts(make_forecasts(rows), [D], time(9, 20))
        assert len(sel) == 1 and sel.iloc[0]["forecast_mw"] == 300

    def test_horizon_and_age(self) -> None:
        fc = make_forecasts([("2026-01-14 07:30", "2026-01-15 12:00", 1)])
        row = pick(select_forecasts(fc, [D], time(9, 20)), "2026-01-15 12:00")
        assert row["horizon_h"] == pytest.approx(28.5)
        assert row["age_at_cutoff_h"] == pytest.approx(1 + 50 / 60)
        assert row["cutoff"] == ts("2026-01-14 09:20")

    def test_bst_cutoff_selection(self) -> None:
        # On 31 Mar (BST) the 09:20 local cutoff is 08:20 UTC: an 08:30 UTC run is too late.
        fc = make_forecasts(
            [
                ("2026-03-31 06:30", "2026-04-01 12:00", 1),
                ("2026-03-31 08:30", "2026-04-01 12:00", 2),
            ]
        )
        sel = select_forecasts(fc, [date(2026, 4, 1)], time(9, 20))
        assert pick(sel, "2026-04-01 12:00")["forecast_mw"] == 1

    def test_empty_inputs(self) -> None:
        assert select_forecasts(make_forecasts([]), [D], time(9, 20)).empty
        assert select_forecasts(make_forecasts([]), [], time(9, 20)).empty


class TestJoinActuals:
    def test_missing_forecast_and_actual_are_kept_as_nan(self) -> None:
        grid = target_grid([D])
        fc = make_forecasts(
            [
                ("2026-01-14 07:30", "2026-01-15 00:00", 1000),
                ("2026-01-14 07:30", "2026-01-15 01:00", 1200),
            ]
        )
        act = make_actuals([("2026-01-15 00:00", 900), ("2026-01-15 02:00", 500)])
        out = join_actuals(grid, select_forecasts(fc, [D], time(9, 20)), act)
        assert len(out) == 24
        first = out.iloc[0]
        assert first["forecast_mw"] == 1000 and first["actual_mw"] == 900
        assert first["error_mw"] == 100  # forecast - actual: positive = wind shortfall
        assert np.isnan(out.iloc[1]["actual_mw"]) and np.isnan(out.iloc[1]["error_mw"])
        assert np.isnan(out.iloc[2]["forecast_mw"]) and out.iloc[2]["actual_mw"] == 500

    def test_only_on_the_hour_actuals_are_joined(self) -> None:
        grid = target_grid([D])
        fc = make_forecasts([("2026-01-14 07:30", "2026-01-15 00:00", 1000)])
        act = make_actuals([("2026-01-15 00:00", 900), ("2026-01-15 00:30", 50)])
        out = join_actuals(grid, select_forecasts(fc, [D], time(9, 20)), act)
        assert out.iloc[0]["actual_mw"] == 900


class TestAllVersions:
    def test_excludes_non_positive_horizons(self) -> None:
        fc = make_forecasts(
            [
                ("2026-01-14 07:30", "2026-01-15 12:00", 1),
                ("2026-01-15 12:00", "2026-01-15 12:00", 2),
                ("2026-01-15 15:30", "2026-01-15 12:00", 3),
            ]
        )
        act = make_actuals([("2026-01-15 12:00", 1)])
        out = all_versions_with_actuals(fc, act, [D])
        assert list(out["forecast_mw"]) == [1]
        assert out.iloc[0]["horizon_h"] == pytest.approx(28.5)


class TestRealSnapshot:
    """Cross-check the vectorised implementation against a naive loop on real January data."""

    @pytest.mark.parametrize("cutoff", ["09:20", "09:50", "15:30", "00:00", "23:59"])
    def test_matches_brute_force(self, snapshot, cutoff: str) -> None:  # type: ignore[no-untyped-def]
        days = [date(2026, 1, 2) + timedelta(days=i) for i in range(31)]
        sel = select_forecasts(snapshot.forecasts, days, parse_cutoff(cutoff))
        fc = snapshot.forecasts
        for _, row in sel.sample(60, random_state=1).iterrows():
            target = row["start_time"]
            day = target.date()
            hh, mm = map(int, cutoff.split(":"))
            cut = pd.Timestamp(f"{day - timedelta(days=1)} {hh:02d}:{mm:02d}", tz="UTC")
            cands = fc[(fc["start_time"] == target) & (fc["publish_time"] <= cut)]
            best = cands.loc[cands["publish_time"].idxmax()]
            assert row["publish_time"] == best["publish_time"]
            assert row["forecast_mw"] == best["generation_mw"]
            assert row["publish_time"] <= cut

    def test_every_january_decision_has_full_coverage(self, snapshot) -> None:  # type: ignore[no-untyped-def]
        days = [date(2026, 1, 2) + timedelta(days=i) for i in range(31)]
        sel = select_forecasts(snapshot.forecasts, days, time(9, 20))
        assert len(sel) == 31 * 24
        # The default 09:20 cutoff always uses the 07:30 run of D-1.
        assert set(sel["publish_time"].dt.strftime("%H:%M")) == {"07:30"}
        assert (sel["publish_time"] <= sel["cutoff"]).all()

    def test_two_day_lead_leaves_late_hours_uncovered(self, snapshot) -> None:  # type: ignore[no-untyped-def]
        # Runs on D-2 only reach 21:00 on D, so 22:00 and 23:00 have no eligible version.
        sel = select_forecasts(snapshot.forecasts, [D], time(9, 20), lead_days=2)
        hours = set(sel["start_time"].dt.hour)
        assert 21 in hours and 22 not in hours and 23 not in hours
