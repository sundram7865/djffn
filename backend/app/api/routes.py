from __future__ import annotations

from datetime import date, time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app import __version__
from app.api.schemas import (
    AccuracyResponse,
    CutoffSweepResponse,
    DayForecastResponse,
    HorizonResponse,
    MetaResponse,
)
from app.config import settings
from app.core.selection import parse_cutoff
from app.services.analyzer import Analyzer, get_analyzer

router = APIRouter(prefix="/api")

# The snapshot is immutable per deployment, so responses can be cached by browsers and the CDN.
CACHE_HEADER = "public, max-age=300, s-maxage=86400"

AnalyzerDep = Annotated[Analyzer, Depends(get_analyzer)]
CutoffQ = Annotated[
    str | None,
    Query(description="Decision cutoff, HH:MM UK local time on D-1 (default 09:20)"),
]


def _cutoff(value: str | None) -> time:
    if value is None:
        return settings.default_cutoff
    try:
        return parse_cutoff(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _in_scope(d: date, name: str) -> date:
    lo, hi = settings.scope_first_day, settings.scope_last_day
    if not lo <= d <= hi:
        raise HTTPException(
            status_code=422,
            detail=f"{name} must be a delivery day between {lo.isoformat()} and {hi.isoformat()} "
            "(decisions made in January 2026)",
        )
    return d


def _range(start: date | None, end: date | None) -> tuple[date, date]:
    s = _in_scope(start or settings.scope_first_day, "start")
    e = _in_scope(end or settings.scope_last_day, "end")
    if s > e:
        raise HTTPException(status_code=422, detail="start must be on or before end")
    return s, e


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@router.get("/meta", response_model=MetaResponse)
def meta(analyzer: AnalyzerDep, response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = CACHE_HEADER
    return analyzer.meta()


@router.get("/forecast", response_model=DayForecastResponse)
def day_forecast(
    analyzer: AnalyzerDep,
    response: Response,
    day: Annotated[date, Query(alias="date", description="Delivery day D (YYYY-MM-DD)")],
    cutoff: CutoffQ = None,
) -> dict[str, Any]:
    """Latest forecast available at the cutoff on D-1 for every hour of delivery day D."""
    response.headers["Cache-Control"] = CACHE_HEADER
    return analyzer.day_forecast(_in_scope(day, "date"), _cutoff(cutoff))


@router.get("/accuracy", response_model=AccuracyResponse)
def accuracy(
    analyzer: AnalyzerDep,
    response: Response,
    start: date | None = None,
    end: date | None = None,
    cutoff: CutoffQ = None,
) -> dict[str, Any]:
    """Accuracy of the point-in-time forecasts over a range of delivery days."""
    response.headers["Cache-Control"] = CACHE_HEADER
    s, e = _range(start, end)
    return analyzer.accuracy(s, e, _cutoff(cutoff))


@router.get("/horizon", response_model=HorizonResponse)
def horizon(
    analyzer: AnalyzerDep,
    response: Response,
    start: date | None = None,
    end: date | None = None,
) -> dict[str, Any]:
    """Error vs forecast age, using every forecast version (not only the selected one)."""
    response.headers["Cache-Control"] = CACHE_HEADER
    return analyzer.horizon(*_range(start, end))


@router.get("/cutoffs", response_model=CutoffSweepResponse)
def cutoffs(
    analyzer: AnalyzerDep,
    response: Response,
    start: date | None = None,
    end: date | None = None,
) -> dict[str, Any]:
    """Accuracy for every cutoff time on D-1 (30-minute steps) plus the market presets."""
    response.headers["Cache-Control"] = CACHE_HEADER
    return analyzer.cutoff_sweep(*_range(start, end))
