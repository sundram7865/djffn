"""Vercel serverless entrypoint.

Vercel serves the built React app as static files and routes /api/* here (see vercel.json).
This module only re-exports the same FastAPI app used by Docker and the tests.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
