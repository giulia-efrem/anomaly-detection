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
MODELS_DIR = Path(os.environ.get("VEGHE_MODELS_DIR", DATA_DIR / "models")).resolve()  # scripts/download_models.py
NORMALITY_DIR = DATA_DIR / "normality"  # learned scene model per camera
INCIDENTS_DIR = DATA_DIR / "incidents"  # alert clips and thumbnails
FEEDBACK_DIR = DATA_DIR / "feedback"  # footage marked "This is normal", kept for retraining

CATALOG_PATH = BACKEND_DIR / "catalog.json"
MODELS_MANIFEST = BACKEND_DIR / "models" / "models.json"

# Ultralytics writes settings and fonts to its config dir; keep them inside the project.
os.environ.setdefault("YOLO_CONFIG_DIR", str(DATA_DIR / "ultralytics"))
os.environ.setdefault("YOLO_OFFLINE", "1")

MAX_CAMERAS = 10

# MJPEG output sent to the browser and kept in the shared frame buffer.
STREAM_WIDTH = 960
STREAM_FPS = 12
JPEG_QUALITY = 80
FRAME_BUFFER_SIZE = 24  # about 2 s of frames at 12 fps

# Incident clips: seconds of stream before and after the alert.
CLIP_PRE_SECONDS = 5.0
CLIP_POST_SECONDS = 5.0
JPEG_HISTORY_SECONDS = CLIP_PRE_SECONDS + 2.0

# Alert rule: a score must stay above its threshold this long, then the same camera and
# class stay quiet (merged into the open incident) for the cooldown.
ALERT_SUSTAIN_SECONDS = 2.0
ALERT_COOLDOWN_SECONDS = 20.0
DEFAULT_THRESHOLDS = {
    "fight": 0.6,
    "car_accident": 0.85,
    "fire_explosion": 0.6,
    "shooting": 0.6,
    "unsupervised": 0.6,
}

# Scene normality: seconds of footage a new camera learns from before it starts scoring.
LEARN_SECONDS = 600.0

# Seconds before an offline camera tries to reconnect on its own.
RECONNECT_SECONDS = 10

# Converted clips are capped at this width to keep the library small.
CLIP_MAX_WIDTH = 1280
THUMB_WIDTH = 480

# Frontend origins allowed to call the API directly (the dev server proxies /api anyway).
CORS_ORIGINS = ["http://localhost:5180", "http://127.0.0.1:5180"]


def ensure_dirs() -> None:
    for d in (DATA_DIR, DOWNLOADS_DIR, LIBRARY_DIR, UPLOADS_DIR, MODELS_DIR, NORMALITY_DIR, INCIDENTS_DIR, FEEDBACK_DIR):
        d.mkdir(parents=True, exist_ok=True)
