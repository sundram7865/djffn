"""API tests against the real snapshot, with an independent stdlib-only re-computation."""

from __future__ import annotations

import csv
import math
import statistics
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def independent_scores(cutoff_h: int, cutoff_m: int) -> list[tuple[float, float]]:
    """(forecast, actual) pairs for Jan 2 .. Feb 1 using only csv/datetime (no pandas, no app code).

    January is GMT, so UK local time == UTC and the cutoff is simply D-1 at HH:MM UTC.
    """
    parse = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
    with open(settings.data_dir / "actuals.csv", encoding="utf-8") as fh:
        actual = {parse(r["start_time"]): float(r["generation_mw"]) for r in csv.DictReader(fh)}
    versions: dict[datetime, list[tuple[datetime, float]]] = {}
    with open(settings.data_dir / "forecasts.csv", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            versions.setdefault(parse(r["start_time"]), []).append(
                (parse(r["publish_time"]), float(r["generation_mw"]))
            )
    pairs = []
    d = date(2026, 1, 2)
    while d <= date(2026, 2, 1):
        cutoff = datetime(d.year, d.month, d.day, cutoff_h, cutoff_m) - timedelta(days=1)
        for h in range(24):
            t = datetime(d.year, d.month, d.day, h)
            eligible = [v for v in versions.get(t, []) if v[0] <= cutoff]
            if eligible and t in actual:
                pairs.append((max(eligible)[1], actual[t]))
        d += timedelta(days=1)
    return pairs


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json()["status"] == "ok"


def test_meta(client: TestClient) -> None:
    r = client.get("/api/meta")
    assert r.status_code == 200
    body = r.json()
    assert body["default_cutoff"] == "09:20"
    assert {p["time"] for p in body["presets"]} == {"09:20", "09:50", "15:30"}
    assert body["scope"]["first_delivery_day"] == "2026-01-02"
    assert body["scope"]["last_delivery_day"] == "2026-02-01"
    assert body["scope"]["last_decision_day"] == "2026-01-31"
    assert "max-age" in r.headers["cache-control"]


@pytest.mark.parametrize(
    ("cutoff", "h", "m"), [("09:20", 9, 20), ("09:50", 9, 50), ("15:30", 15, 30)]
)
def test_accuracy_matches_independent_calculation(
    client: TestClient, cutoff: str, h: int, m: int
) -> None:
    body = client.get("/api/accuracy", params={"cutoff": cutoff}).json()
    pairs = independent_scores(h, m)
    errors = [f - a for f, a in pairs]
    s = body["summary"]
    assert s["n"] == len(pairs) == 744
    assert s["mae_mw"] == pytest.approx(statistics.fmean(abs(e) for e in errors))
    assert s["bias_mw"] == pytest.approx(statistics.fmean(errors))
    assert s["rmse_mw"] == pytest.approx(math.sqrt(statistics.fmean(e * e for e in errors)))
    q = statistics.quantiles(errors, n=100, method="inclusive")
    assert s["signed_pcts"]["p90"] == pytest.approx(q[89])
    assert s["abs_pcts"]["p95"] == pytest.approx(
        statistics.quantiles([abs(e) for e in errors], n=100, method="inclusive")[94]
    )
    assert s["wape_pct"] == pytest.approx(
        sum(abs(e) for e in errors) / sum(a for _, a in pairs) * 100
    )


def test_accuracy_payload_is_consistent(client: TestClient) -> None:
    body = client.get("/api/accuracy").json()
    assert body["cutoff"]["time"] == "09:20"
    assert body["range"]["days"] == 31
    assert len(body["series"]) == 31 * 24
    assert sum(b["count"] for b in body["histogram"]) == body["summary"]["n"]
    assert sum(r["n"] for r in body["by_hour"]) == body["summary"]["n"]
    assert sum(r["n"] for r in body["by_band"]) == body["summary"]["n"]
    assert [r["key"] for r in body["by_band"]] == ["low", "medium", "high"]
    assert len(body["by_day"]) == 31
    assert body["horizon_range_h"] == [16.5, 39.5]
    assert body["data_quality"]["scored_hours"] == 744
    # Insight numbers come from the summary.
    assert body["insights"]["buffer_mw"] == body["summary"]["buffer_p90_mw"]


def test_accuracy_subrange(client: TestClient) -> None:
    body = client.get("/api/accuracy", params={"start": "2026-01-10", "end": "2026-01-16"}).json()
    assert body["range"]["days"] == 7 and body["summary"]["n"] == 7 * 24


def test_day_forecast(client: TestClient) -> None:
    body = client.get("/api/forecast", params={"date": "2026-01-15"}).json()
    pts = body["points"]
    assert len(pts) == 24
    assert body["cutoff"]["utc"] == "2026-01-14T09:20:00Z"
    assert body["runs_used"] == [
        {
            "publish_time": "2026-01-14T07:30:00Z",
            "hours": 24,
            "age_at_cutoff_h": pytest.approx(11 / 6),
        }
    ]
    fc = [p["forecast_mw"] for p in pts]
    k = body["kpis"]
    assert k["peak_mw"] == max(fc) and k["min_mw"] == min(fc)
    assert k["total_mwh"] == pytest.approx(sum(fc))
    assert k["mean_mw"] == pytest.approx(sum(fc) / 24)
    assert all(p["range_low_mw"] <= p["forecast_mw"] or p["range_low_mw"] == 0 for p in pts)
    assert all(p["range_low_mw"] <= p["range_high_mw"] for p in pts)
    assert len(body["actuals_halfhourly"]) == 48
    assert body["outcome"]["scored_hours"] == 24


def test_cutoff_at_publish_time_uses_that_run(client: TestClient) -> None:
    body = client.get("/api/forecast", params={"date": "2026-01-15", "cutoff": "15:30"}).json()
    assert body["runs_used"][0]["publish_time"] == "2026-01-14T15:30:00Z"
    assert body["runs_used"][0]["age_at_cutoff_h"] == 0


def test_day_forecast_never_uses_later_runs(client: TestClient) -> None:
    for cutoff in ("00:00", "09:20", "23:59"):
        body = client.get("/api/forecast", params={"date": "2026-01-20", "cutoff": cutoff}).json()
        limit = body["cutoff"]["utc"]
        assert all(p["publish_time"] <= limit for p in body["points"] if p["publish_time"])


def test_early_cutoff_gap_is_surfaced(client: TestClient) -> None:
    # Before 02:30 on D-1 the newest run is 22:30 on D-2, which only reaches 21:00 on D.
    body = client.get("/api/forecast", params={"date": "2026-01-20", "cutoff": "00:00"}).json()
    missing = [p["start_time"] for p in body["points"] if p["forecast_mw"] is None]
    assert missing == ["2026-01-20T22:00:00Z", "2026-01-20T23:00:00Z"]
    assert body["data_quality"]["status"] == "warning"
    assert body["kpis"]["hours"] == 22


def test_horizon(client: TestClient) -> None:
    body = client.get("/api/horizon").json()
    buckets = body["buckets"]
    assert buckets[0]["label"] == "0–6 h"
    assert all(b["horizon_to_h"] - b["horizon_from_h"] == 6 for b in buckets)
    # Older forecasts are worse: the 36–42 h bucket has a higher MAE than the 0–6 h bucket.
    by_from = {b["horizon_from_h"]: b for b in buckets}
    assert by_from[36]["mae_mw"] > by_from[0]["mae_mw"]


def test_cutoff_sweep_agrees_with_accuracy(client: TestClient) -> None:
    sweep = client.get("/api/cutoffs").json()
    assert len(sweep["points"]) >= 48
    for preset in sweep["presets"]:
        acc = client.get("/api/accuracy", params={"cutoff": preset["time"]}).json()
        assert preset["mae_mw"] == pytest.approx(acc["summary"]["mae_mw"])


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/api/forecast", {"date": "2026-01-01"}),
        ("/api/forecast", {"date": "2026-02-02"}),
        ("/api/forecast", {"date": "2026-01-15", "cutoff": "9:20"}),
        ("/api/forecast", {"date": "2026-01-15", "cutoff": "25:00"}),
        ("/api/accuracy", {"start": "2026-01-20", "end": "2026-01-10"}),
        ("/api/accuracy", {"start": "2025-12-31"}),
        ("/api/forecast", {}),
    ],
)
def test_validation_errors(client: TestClient, path: str, params: dict[str, str]) -> None:
    assert client.get(path, params=params).status_code == 422


def test_unknown_api_path_is_404(client: TestClient) -> None:
    assert client.get("/api/nope").status_code == 404
