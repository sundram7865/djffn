from __future__ import annotations

import numpy as np
import pytest

from app.core.insights import build_insights, fmt_mw
from app.core.metrics import error_summary


@pytest.mark.parametrize(
    ("value", "signed", "expected"),
    [
        (2022.47, False, "2.02 GW"),
        (1745.9, True, "+1.75 GW"),
        (-330.0, True, "−330 MW"),
        (14000, False, "14 GW"),
        (8000, False, "8 GW"),
        (12345, False, "12.3 GW"),
        (0, True, "0 MW"),
    ],
)
def test_fmt_mw(value: float, signed: bool, expected: str) -> None:
    assert fmt_mw(value, signed) == expected


def _summary(bias: float) -> dict:  # type: ignore[type-arg]
    rng = np.random.default_rng(3)
    a = rng.uniform(3000, 17000, 400)
    return error_summary(a + rng.normal(bias, 1500, 400), a)


def test_numbers_in_text_are_the_computed_ones() -> None:
    s = _summary(1500)
    out = build_insights(s, "09:20", [], [])
    assert fmt_mw(s["mae_mw"]) in out["headline"]
    assert f"{s['wape_pct']:.0f}%" in out["headline"]
    text = " ".join(p["text"] for p in out["points"])
    assert fmt_mw(s["buffer_p90_mw"]) in text
    assert fmt_mw(s["signed_pcts"]["p95"]) in text
    assert f"{s['shortfall_share'] * 100:.0f}%" in text
    assert out["buffer_mw"] == s["buffer_p90_mw"]


def test_under_forecast_wording() -> None:
    out = build_insights(_summary(-1500), "09:20", [], [])
    direction = next(p for p in out["points"] if p["id"] == "direction")
    assert "ran low" in direction["text"]


def test_cutoff_alternatives_are_compared() -> None:
    s = _summary(1500)
    alts = [{"label": "Later gate", "time": "15:30", "mae_mw": s["mae_mw"] - 100}]
    out = build_insights(s, "09:20", [], [], alternatives=alts)
    alt = next(p for p in out["points"] if p["id"] == "cutoff-15:30")
    assert "cut MAE by 100 MW" in alt["text"]


def test_empty_summary() -> None:
    assert build_insights({"n": 0}, "09:20", [], [])["points"] == []
