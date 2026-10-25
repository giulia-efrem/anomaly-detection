"""Paths and tunables. Everything the app writes lives under DATA_DIR."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent

DATA_DIR = Path(os.environ.get("VEGHE_DATA_DIR", PROJECT_DIR / "data")).resolve()
DB_PATH = DATA_DIR / "veghe.db"
DOWNLOADS_DIR = DATA_DIR / "downloads"  # raw archives and files as downloaded
LIBRARY_DIR = DATA_DIR / "library"  # converted H.264 clips and thumbnails
UPLOADS_DIR = DATA_DIR / "uploads"  # user uploads before conversion

CATALOG_PATH = BACKEND_DIR / "catalog.json"

MAX_CAMERAS = 10

# MJPEG output sent to the browser and kept in the shared frame buffer.
STREAM_WIDTH = 960
STREAM_FPS = 12
JPEG_QUALITY = 80
FRAME_BUFFER_SIZE = 24  # about 2 s of frames at 12 fps

# Seconds before an offline camera tries to reconnect on its own.
RECONNECT_SECONDS = 10

# Converted clips are capped at this width to keep the library small.
CLIP_MAX_WIDTH = 1280
THUMB_WIDTH = 480

# Frontend origins allowed to call the API directly (the dev server proxies /api anyway).
CORS_ORIGINS = ["http://localhost:5180", "http://127.0.0.1:5180"]


def ensure_dirs() -> None:
    for d in (DATA_DIR, DOWNLOADS_DIR, LIBRARY_DIR, UPLOADS_DIR):
        d.mkdir(parents=True, exist_ok=True)
