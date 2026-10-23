"""FastAPI application factory.

Serves the JSON API under ``/api``. When ``STATIC_DIR`` points at the built React app (Docker),
it also serves the single-page app, so one container runs the whole product.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api.routes import router
from app.config import settings
from app.data.store import get_snapshot


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    get_snapshot()  # fail fast if the snapshot is missing or malformed
    yield


def _mount_spa(app: FastAPI, static_dir: Path) -> None:
    root = static_dir.resolve()
    if (root / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        return FileResponse(root / "index.html")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Wind Forecast Decision API",
        version=__version__,
        description="Point-in-time GB wind forecasts and their accuracy, for day-ahead buying.",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    app.include_router(router)
    if settings.static_dir and settings.static_dir.is_dir():
        _mount_spa(app, settings.static_dir)
    return app


app = create_app()
