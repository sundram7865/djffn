"""Minimal, typed client for the two Elexon BMRS stream endpoints we need.

The deployed app never calls this: it is used offline by ``scripts/ingest.py`` to build the snapshot.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from datetime import date, datetime, timedelta
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, field_validator

log = logging.getLogger(__name__)

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"


class WindForRecord(BaseModel):
    """One forecast value from WINDFOR (hourly resolution)."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    publish_time: datetime = Field(alias="publishTime")
    start_time: datetime = Field(alias="startTime")
    generation: int

    @field_validator("publish_time", "start_time")
    @classmethod
    def _must_be_utc(cls, v: datetime) -> datetime:
        if v.tzinfo is None or v.utcoffset() != timedelta(0):
            raise ValueError("timestamp must be timezone-aware UTC")
        return v


class FuelHHRecord(BaseModel):
    """One half-hourly generation outturn value from FUELHH."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    publish_time: datetime = Field(alias="publishTime")
    start_time: datetime = Field(alias="startTime")
    settlement_date: date = Field(alias="settlementDate")
    settlement_period: int = Field(alias="settlementPeriod", ge=1, le=50)
    fuel_type: str = Field(alias="fuelType")
    generation: int

    @field_validator("publish_time", "start_time")
    @classmethod
    def _must_be_utc(cls, v: datetime) -> datetime:
        if v.tzinfo is None or v.utcoffset() != timedelta(0):
            raise ValueError("timestamp must be timezone-aware UTC")
        return v


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _chunks(start: datetime, end: datetime, step: timedelta) -> Iterator[tuple[datetime, datetime]]:
    cur = start
    while cur < end:
        nxt = min(cur + step, end)
        yield cur, nxt
        cur = nxt


class ElexonClient:
    def __init__(
        self,
        base_url: str = BASE_URL,
        timeout_s: float = 30.0,
        max_retries: int = 4,
        client: httpx.Client | None = None,
    ) -> None:
        self._client = client or httpx.Client(base_url=base_url, timeout=timeout_s)
        self._max_retries = max_retries

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> ElexonClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _get(self, path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        for attempt in range(self._max_retries + 1):
            try:
                resp = self._client.get(path, params=params)
                if resp.status_code in (429, 500, 502, 503, 504):
                    raise httpx.HTTPStatusError(
                        f"retryable status {resp.status_code}", request=resp.request, response=resp
                    )
                resp.raise_for_status()
                payload = resp.json()
                if not isinstance(payload, list):
                    raise ValueError(f"expected a JSON array from {path}, got {type(payload)}")
                return payload
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                if attempt == self._max_retries:
                    raise
                wait = 2**attempt
                log.warning("GET %s failed (%s); retry %d in %ss", path, exc, attempt + 1, wait)
                time.sleep(wait)
        raise RuntimeError("unreachable")

    def windfor(
        self, publish_from: datetime, publish_to: datetime, chunk: timedelta = timedelta(days=7)
    ) -> list[dict[str, Any]]:
        """All WINDFOR rows with ``publish_from <= publishTime <= publish_to``, fetched in chunks.

        Chunk boundaries are inclusive on both ends at the API, so callers must de-duplicate.
        """
        rows: list[dict[str, Any]] = []
        for a, b in _chunks(publish_from, publish_to, chunk):
            part = self._get(
                "/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": _iso(a), "publishDateTimeTo": _iso(b)},
            )
            log.info("WINDFOR %s → %s: %d rows", _iso(a), _iso(b), len(part))
            rows.extend(part)
        return rows

    def fuelhh(
        self,
        settlement_from: date,
        settlement_to: date,
        fuel_type: str = "WIND",
        chunk_days: int = 14,
    ) -> list[dict[str, Any]]:
        """All FUELHH rows for ``fuel_type`` with settlement dates in [from, to] (inclusive)."""
        rows: list[dict[str, Any]] = []
        cur = settlement_from
        while cur <= settlement_to:
            nxt = min(cur + timedelta(days=chunk_days - 1), settlement_to)
            part = self._get(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": cur.isoformat(),
                    "settlementDateTo": nxt.isoformat(),
                    "fuelType": fuel_type,
                },
            )
            log.info("FUELHH %s → %s: %d rows", cur, nxt, len(part))
            rows.extend(part)
            cur = nxt + timedelta(days=1)
        return rows
