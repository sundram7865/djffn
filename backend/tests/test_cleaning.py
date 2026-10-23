from __future__ import annotations

from app.data.cleaning import clean_fuelhh, clean_windfor


def wf(pub: str, start: str, gen: object = 1000) -> dict[str, object]:
    return {"dataset": "WINDFOR", "publishTime": pub, "startTime": start, "generation": gen}


def fh(
    start: str, pub: str, gen: object = 900, fuel: str = "WIND", sp: int = 1
) -> dict[str, object]:
    return {
        "dataset": "FUELHH",
        "publishTime": pub,
        "startTime": start,
        "settlementDate": start[:10],
        "settlementPeriod": sp,
        "fuelType": fuel,
        "generation": gen,
    }


def test_windfor_drops_invalid_and_duplicates() -> None:
    raw = [
        wf("2026-01-14T07:30:00Z", "2026-01-15T00:00:00Z"),
        wf("2026-01-14T07:30:00Z", "2026-01-15T00:00:00Z"),  # chunk-overlap duplicate
        wf("2026-01-14T07:30:00Z", "2026-01-15T01:00:00Z", None),  # null generation
        wf("not-a-date", "2026-01-15T02:00:00Z"),
        wf("2026-01-14T07:30:00", "2026-01-15T03:00:00Z"),  # naive timestamp rejected
        wf("2026-01-14T07:30:00Z", "2026-01-15T04:30:00Z"),  # off the hourly grid -> counted
    ]
    df, stats = clean_windfor(raw)
    assert len(df) == 2
    assert stats["invalid_rows"] == 3
    assert stats["duplicate_rows_dropped"] == 1
    assert stats["off_hour_start_times"] == 1
    assert str(df["start_time"].dt.tz) == "UTC"


def test_fuelhh_keeps_latest_revision_and_counts_gaps() -> None:
    raw = [
        fh("2026-01-15T00:00:00Z", "2026-01-15T00:30:00Z", 900),
        fh("2026-01-15T00:00:00Z", "2026-01-15T02:00:00Z", 950),  # later revision wins
        fh("2026-01-15T00:30:00Z", "2026-01-15T01:00:00Z", 800, fuel="CCGT"),
        fh("2026-01-15T01:30:00Z", "2026-01-15T02:00:00Z", 700, sp=4),
    ]
    df, stats = clean_fuelhh(raw)
    assert list(df["generation_mw"]) == [950, 700]
    assert stats["duplicate_rows_dropped"] == 1
    assert stats["other_fuel_rows_ignored"] == 1
    assert stats["missing_halfhours"] == 2  # 00:30 and 01:00
