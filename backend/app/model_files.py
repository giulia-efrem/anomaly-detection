"""Model weights: the manifest in backend/models/models.json and downloads into data/models/.

Used by scripts/download_models.py and by the detectors, which only ever load
files that passed the size and SHA-256 check here.
"""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

import httpx

from . import config

Progress = Callable[[str, int, int | None], None]  # (model id, bytes done, bytes total)


@lru_cache(maxsize=1)
def manifest() -> dict[str, Any]:
    return json.loads(config.MODELS_MANIFEST.read_text(encoding="utf-8"))


def entries() -> list[dict[str, Any]]:
    return manifest()["models"]


def entry(model_id: str) -> dict[str, Any]:
    for m in entries():
        if m["id"] == model_id:
            return m
    raise KeyError(model_id)


def path(model_id: str) -> Path:
    return config.MODELS_DIR / entry(model_id)["file"]


def sha256_of(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def is_present(model_id: str) -> bool:
    """Cheap check (size only) used at run time; the hash is checked on download."""
    m = entry(model_id)
    p = path(model_id)
    return p.is_file() and (not m.get("size_bytes") or p.stat().st_size == m["size_bytes"])


def download(model_id: str, force: bool = False, progress: Progress | None = None) -> Path:
    m = entry(model_id)
    dst = path(model_id)
    if not force and is_present(model_id) and (not m.get("sha256") or sha256_of(dst) == m["sha256"]):
        return dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    part = dst.with_name(dst.name + ".part")
    h = hashlib.sha256()
    done = 0
    headers = {"User-Agent": config.USER_AGENT}
    with httpx.stream("GET", m["url"], follow_redirects=True, headers=headers,
                      timeout=httpx.Timeout(30, read=120)) as r:
        r.raise_for_status()
        total = int(r.headers["content-length"]) if r.headers.get("content-length") else m.get("size_bytes")
        with part.open("wb") as f:
            for chunk in r.iter_bytes(1 << 16):
                f.write(chunk)
                h.update(chunk)
                done += len(chunk)
                if progress:
                    progress(model_id, done, total)
    if m.get("size_bytes") and done != m["size_bytes"]:
        part.unlink(missing_ok=True)
        raise RuntimeError(f"{model_id}: expected {m['size_bytes']} bytes, got {done}")
    if m.get("sha256") and h.hexdigest() != m["sha256"]:
        part.unlink(missing_ok=True)
        raise RuntimeError(f"{model_id}: SHA-256 mismatch, the file on the server changed")
    part.replace(dst)
    return dst


def download_all(force: bool = False, progress: Progress | None = None) -> list[str]:
    """Download every model; returns the ids that failed."""
    failed = []
    for m in entries():
        try:
            download(m["id"], force=force, progress=progress)
        except Exception:
            failed.append(m["id"])
    return failed
