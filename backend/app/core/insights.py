"""Plain-language, decision-oriented guidance generated from computed metrics.

Every number in the text comes from the inputs; nothing is hard-coded. Wording targets a
trading desk: what the error means for the position, not statistical jargon.
"""

from __future__ import annotations

from typing import Any

from app.config import WIND_BANDS


def fmt_mw(v: float, signed: bool = False) -> str:
    """1 234 MW -> '1.23 GW'; 450 MW -> '450 MW'. Keeps sign when ``signed``."""
    sign = ("+" if v > 0 else "−" if v < 0 else "") if signed else ("−" if v < 0 else "")
    a = abs(v)
    if a >= 1000:
        digits = 1 if a >= 10_000 else 2
        body = f"{a / 1000:.{digits}f}".rstrip("0").rstrip(".") + " GW"
    else:
        body = f"{round(a / 10) * 10:.0f} MW"
    return f"{sign}{body}"


def fmt_pct(v: float, digits: int = 0) -> str:
    return f"{v:.{digits}f}%"


def build_insights(
    summary: dict[str, Any],
    cutoff: str,
    by_band: list[dict[str, Any]],
    by_hour: list[dict[str, Any]],
    alternatives: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return ``{"headline": str, "points": [{"id", "text", "tone"}], "buffer_mw": float}``.

    ``alternatives``: other cutoffs as ``{"label", "time", "mae_mw"}`` to compare against.
    """
    if not summary or summary.get("n", 0) == 0:
        return {
            "headline": "No scored hours in the selected range.",
            "points": [],
            "buffer_mw": 0.0,
        }

    mae = summary["mae_mw"]
    wape = summary["wape_pct"]
    bias = summary["bias_mw"]
    short_share = summary["shortfall_share"] * 100
    p95 = summary["signed_pcts"]["p95"]
    buffer = summary["buffer_p90_mw"]

    headline = (
        f"At a {cutoff} cutoff on D-1, the wind forecast was typically off by {fmt_mw(mae)} "
        f"(MAE), about {fmt_pct(wape)} of average wind output."
    )
    points: list[dict[str, str]] = []

    if bias > 0:
        points.append(
            {
                "id": "direction",
                "tone": "warning",
                "text": f"The forecast ran high in {fmt_pct(short_share)} of hours (average "
                f"{fmt_mw(bias, signed=True)}). The main risk is wind delivering less than "
                "planned, which leaves the book short.",
            }
        )
    else:
        points.append(
            {
                "id": "direction",
                "tone": "info",
                "text": f"The forecast ran low in {fmt_pct(100 - short_share)} of hours (average "
                f"{fmt_mw(bias, signed=True)}), so the book tended to be over-bought, not short.",
            }
        )

    points.append(
        {
            "id": "buffer",
            "tone": "action",
            "text": f"Plan with wind at forecast − {fmt_mw(buffer)}: that buffer would have covered "
            "the shortfall in 9 out of 10 hours of the period."
            if buffer > 0
            else "No shortfall buffer was needed to cover 9 out of 10 hours in this period.",
        }
    )
    if p95 > 0:
        points.append(
            {
                "id": "tail",
                "tone": "warning",
                "text": f"The tail is long: in 1 hour in 20 wind under-delivered by more than "
                f"{fmt_mw(p95)}, and the worst hour missed by {fmt_mw(summary['shortfall_max_mw'])}.",
            }
        )

    bands = {b["key"]: b for b in by_band}
    low_band, high_band = WIND_BANDS[0], WIND_BANDS[-1]
    hi, lo = bands.get(high_band.id), bands.get(low_band.id)
    if hi and lo and hi["n"] >= 20 and lo["n"] >= 20 and low_band.max_mw is not None:
        points.append(
            {
                "id": "level",
                "tone": "info",
                "text": f"Error grows with wind: bias {fmt_mw(hi['bias_mw'], signed=True)} when the "
                f"forecast was ≥ {fmt_mw(high_band.min_mw)} (9-in-10 buffer "
                f"{fmt_mw(max(hi['p90_signed_mw'], 0))}), vs {fmt_mw(lo['bias_mw'], signed=True)} "
                f"below {fmt_mw(low_band.max_mw)} (buffer {fmt_mw(max(lo['p90_signed_mw'], 0))}). "
                "Size the buffer to the forecast level.",
            }
        )

    if by_hour:
        worst = max(by_hour, key=lambda r: r["mae_mw"])
        best = min(by_hour, key=lambda r: r["mae_mw"])
        points.append(
            {
                "id": "hour",
                "tone": "info",
                "text": f"Largest errors at {int(worst['key']):02d}:00 UK time (MAE "
                f"{fmt_mw(worst['mae_mw'])}), smallest at {int(best['key']):02d}:00 "
                f"({fmt_mw(best['mae_mw'])}).",
            }
        )

    for alt in alternatives or []:
        if alt["time"] == cutoff or alt.get("mae_mw") is None:
            continue
        delta = alt["mae_mw"] - mae
        rel = delta / mae * 100
        direction = "cut" if delta < 0 else "raise"
        points.append(
            {
                "id": f"cutoff-{alt['time']}",
                "tone": "info",
                "text": f"Waiting for the {alt['label']} gate at {alt['time']} would {direction} "
                f"MAE by {fmt_mw(abs(delta))} ({fmt_pct(abs(rel), 1)}).",
            }
        )

    return {"headline": headline, "points": points, "buffer_mw": buffer}
