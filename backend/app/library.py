"""Test video library: catalog of public datasets, downloads, imports, uploads.

Every download or upload runs as a background job. Jobs report progress over
the WebSocket ("library.job" events) and are listed by GET /api/library/jobs.
Imported clips are converted to H.264 MP4 with a thumbnail and stored in the
library_videos table.
"""

from __future__ import annotations

import json
import logging
import re
import tarfile
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote, urlparse

import httpx

from . import config, db, media
from .events import bus

log = logging.getLogger("veghe.library")

MY_VIDEOS_ID = "my-videos"
MY_VIDEOS_NAME = "My videos"
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".mpg", ".mpeg", ".webm", ".m4v", ".wmv"}


@lru_cache(maxsize=1)
def catalog() -> dict[str, Any]:
    return json.loads(config.CATALOG_PATH.read_text(encoding="utf-8"))


def dataset(dataset_id: str) -> dict[str, Any] | None:
    return next((d for d in catalog()["datasets"] if d["id"] == dataset_id), None)


def anomaly_label(key: str) -> str:
    return catalog()["anomaly_types"].get(key, key.replace("_", " ").capitalize())


# --- jobs --------------------------------------------------------------------


@dataclass
class Job:
    id: str
    kind: str  # dataset | url | upload
    label: str
    dataset_id: str | None = None
    stage: str = "queued"  # queued | downloading | extracting | converting | done | error
    progress: float = 0.0  # 0..1 within the current stage
    bytes_done: int = 0
    bytes_total: int | None = None
    items_done: int = 0
    items_total: int = 0
    clips_added: int = 0
    error: str | None = None
    created_at: str = field(default_factory=db.now_iso)
    finished_at: str | None = None
    _last_publish: float = 0.0

    def public(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}

    @property
    def active(self) -> bool:
        return self.stage not in ("done", "error")


_jobs: dict[str, Job] = {}
_jobs_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="library")


def list_jobs() -> list[dict[str, Any]]:
    with _jobs_lock:
        return [j.public() for j in sorted(_jobs.values(), key=lambda j: j.created_at, reverse=True)]


def _publish(job: Job, force: bool = False) -> None:
    now = time.monotonic()
    if force or now - job._last_publish > 0.3:
        job._last_publish = now
        bus.publish({"type": "library.job", "job": job.public()})


def _set_stage(job: Job, stage: str, items_total: int = 0) -> None:
    job.stage, job.progress, job.items_done, job.items_total = stage, 0.0, 0, items_total
    _publish(job, force=True)


def _submit(job: Job, fn: Callable[[Job], None]) -> Job:
    with _jobs_lock:
        _jobs[job.id] = job
    _publish(job, force=True)

    def run() -> None:
        try:
            fn(job)
            job.stage, job.progress = "done", 1.0
        except Exception as exc:
            log.exception("library job %s failed", job.id)
            job.stage, job.error = "error", str(exc) or exc.__class__.__name__
        job.finished_at = db.now_iso()
        _publish(job, force=True)
        bus.publish({"type": "library.changed"})

    _executor.submit(run)
    return job


def _new_id() -> str:
    return uuid.uuid4().hex[:10]


# --- downloading -------------------------------------------------------------


def _download(job: Job, url: str, dst: Path, expected: int | None = None) -> None:
    """Stream a URL to disk, adding to the job's byte counters."""
    if dst.exists() and expected and dst.stat().st_size == expected:
        job.bytes_done += expected
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    part = dst.with_name(dst.name + ".part")
    headers = {"User-Agent": "Veghe/0.2 (research dashboard)"}
    with httpx.stream("GET", url, follow_redirects=True, timeout=httpx.Timeout(30, read=120), headers=headers) as r:
        r.raise_for_status()
        if job.bytes_total is None and r.headers.get("content-length"):
            job.bytes_total = int(r.headers["content-length"])
        with part.open("wb") as f:
            for chunk in r.iter_bytes(1 << 16):
                f.write(chunk)
                job.bytes_done += len(chunk)
                if job.bytes_total:
                    job.progress = min(job.bytes_done / job.bytes_total, 1.0)
                _publish(job)
    part.replace(dst)


def _extract(archive: Path, dst: Path, fmt: str) -> None:
    marker = dst / ".extracted"
    if marker.exists():
        return
    dst.mkdir(parents=True, exist_ok=True)
    if fmt == "zip":
        with zipfile.ZipFile(archive) as z:
            root = dst.resolve()
            for member in z.infolist():
                target = (dst / member.filename).resolve()
                if not target.is_relative_to(root):
                    raise RuntimeError(f"Unsafe path in archive: {member.filename}")
            z.extractall(dst)
    else:
        with tarfile.open(archive, "r:*") as t:
            t.extractall(dst, filter="data")
    marker.write_text(db.now_iso())


# --- importers: map downloaded files to clips --------------------------------


@dataclass
class ClipSpec:
    key: str  # unique within the dataset, used in file names and ids
    title: str
    anomaly_types: list[str]
    src: Path | None = None  # a video file
    frames: tuple[str, float] | None = None  # (printf pattern, fps) for image sequences
    crop: str | None = None


def _num(name: str) -> int:
    m = re.findall(r"\d+", name)
    return int(m[-1]) if m else 0


def _import_ur_fall(root: Path, ds: dict[str, Any]) -> list[ClipSpec]:
    clips = []
    for f in sorted(root.glob("*-cam0.mp4")):
        kind, num = f.name.split("-")[:2]
        is_fall = kind == "fall"
        clips.append(ClipSpec(
            key=f"{kind}-{num}",
            title=f"{'Fall' if is_fall else 'Daily activity'} {num}",
            anomaly_types=["fall"] if is_fall else ["normal"],
            src=f,
            crop="crop=iw/2:ih:iw/2:0",  # keep the RGB half, drop the depth map
        ))
    return clips


def _videos_in(folder: Path) -> list[Path]:
    return sorted((p for p in folder.iterdir() if p.suffix.lower() in VIDEO_EXTS), key=lambda p: (_num(p.stem), p.name))


def _import_fight_surv(root: Path, ds: dict[str, Any]) -> list[ClipSpec]:
    clips = []
    for folder in sorted(p for p in root.rglob("*") if p.is_dir()):
        name = folder.name.lower()
        if name not in ("fight", "nofight"):
            continue
        is_fight = name == "fight"
        for i, f in enumerate(_videos_in(folder), 1):
            clips.append(ClipSpec(
                key=f"{'fight' if is_fight else 'nofight'}-{i:03d}",
                title=f"{'Fight' if is_fight else 'No fight'} {i:03d}",
                anomaly_types=["fight"] if is_fight else ["normal"],
                src=f,
            ))
    return clips


def _import_avenue(root: Path, ds: dict[str, Any]) -> list[ClipSpec]:
    clips = []
    for split, title, types in (
        ("training_videos", "Training", ["normal"]),
        ("testing_videos", "Test", ds["anomaly_types"]),
    ):
        for folder in root.rglob(split):
            for f in _videos_in(folder):
                n = _num(f.stem)
                clips.append(ClipSpec(key=f"{split.split('_')[0]}-{n:02d}", title=f"{title} {n:02d}",
                                      anomaly_types=types, src=f))
    return clips


def _import_ucsd(root: Path, ds: dict[str, Any]) -> list[ClipSpec]:
    clips = []
    for ped in sorted(root.rglob("UCSDped*")):
        if not ped.is_dir():
            continue
        ped_n = ped.name[-1]
        for split, types in (("Train", ["normal"]), ("Test", ds["anomaly_types"])):
            split_dir = ped / split
            if not split_dir.is_dir():
                continue
            for seq in sorted(split_dir.iterdir()):
                if not seq.is_dir() or seq.name.endswith("_gt") or not any(seq.glob("*.tif")):
                    continue
                n = _num(seq.name)
                clips.append(ClipSpec(
                    key=f"ped{ped_n}-{split.lower()}-{n:03d}",
                    title=f"Ped{ped_n} {split.lower()} {n:03d}",
                    anomaly_types=types,
                    frames=(str(seq / "%03d.tif"), 10.0),
                ))
    return clips


IMPORTERS: dict[str, Callable[[Path, dict[str, Any]], list[ClipSpec]]] = {
    "ur_fall": _import_ur_fall,
    "fight_surv": _import_fight_surv,
    "avenue": _import_avenue,
    "ucsd": _import_ucsd,
}


# --- converting --------------------------------------------------------------


def library_paths(dataset_id: str, key: str) -> tuple[Path, Path]:
    folder = config.LIBRARY_DIR / dataset_id
    return folder / f"{key}.mp4", folder / f"{key}.jpg"


def register_clip(
    *, video_id: str, title: str, dataset_id: str, dataset_name: str, anomaly_types: list[str],
    origin: str, video: Path, thumb: Path, original_name: str | None = None,
) -> None:
    if not thumb.exists():
        media.thumbnail(video, thumb)
    info = media.probe(video)
    db.upsert_library_video({
        "id": video_id,
        "title": title,
        "dataset_id": dataset_id,
        "dataset_name": dataset_name,
        "anomaly_types": anomaly_types,
        "origin": origin,
        "original_name": original_name,
        "file_path": video.relative_to(config.DATA_DIR).as_posix(),
        "thumb_path": thumb.relative_to(config.DATA_DIR).as_posix(),
        "size_bytes": video.stat().st_size,
        **info,
    })


def _convert_clips(job: Job, ds: dict[str, Any], clips: list[ClipSpec]) -> None:
    _set_stage(job, "converting", len(clips))
    for clip in clips:
        video, thumb = library_paths(ds["id"], clip.key)
        if not video.exists():
            if clip.frames:
                media.frames_to_h264(clip.frames[0], video, clip.frames[1])
            else:
                assert clip.src is not None
                media.to_h264(clip.src, video, crop=clip.crop)
        register_clip(
            video_id=f"{ds['id']}-{clip.key}", title=clip.title, dataset_id=ds["id"],
            dataset_name=ds["name"], anomaly_types=clip.anomaly_types, origin="catalog",
            video=video, thumb=thumb,
            original_name=clip.src.name if clip.src else Path(clip.frames[0]).parent.name if clip.frames else None,
        )
        job.items_done += 1
        job.clips_added += 1
        job.progress = job.items_done / max(job.items_total, 1)
        _publish(job)
        if job.items_done % 25 == 0:
            bus.publish({"type": "library.changed"})


def import_dataset(job: Job) -> None:
    """Download, extract and convert one catalog dataset (runs in a worker thread)."""
    ds = dataset(job.dataset_id or "")
    if ds is None:
        raise RuntimeError(f"Unknown dataset {job.dataset_id}")
    dl = ds["download"]
    folder = config.DOWNLOADS_DIR / ds["id"]

    _set_stage(job, "downloading")
    job.bytes_total = ds.get("size_bytes")
    if dl["kind"] == "files":
        for i, f in enumerate(dl["files"]):
            _download(job, f["url"], folder / f["name"], f.get("size_bytes"))
            job.items_done = i + 1
        root = folder
    else:
        archive = folder / dl["filename"]
        _download(job, dl["url"], archive)
        _set_stage(job, "extracting")
        root = folder / "extracted"
        _extract(archive, root, dl["format"])

    clips = IMPORTERS[ds["importer"]](root, ds)
    if not clips:
        raise RuntimeError("No clips found in the download")
    _convert_clips(job, ds, clips)


def start_dataset_download(dataset_id: str) -> Job:
    ds = dataset(dataset_id)
    if ds is None:
        raise KeyError(dataset_id)
    with _jobs_lock:
        running = next((j for j in _jobs.values() if j.dataset_id == dataset_id and j.active), None)
    if running:
        return running
    return _submit(Job(id=_new_id(), kind="dataset", label=ds["name"], dataset_id=dataset_id), import_dataset)


def _import_single(job: Job, src: Path, title: str, origin: str, anomaly_types: list[str], original_name: str) -> None:
    _set_stage(job, "converting", 1)
    video_id = f"{origin}-{job.id}"
    video, thumb = library_paths(MY_VIDEOS_ID, video_id)
    media.to_h264(src, video)
    register_clip(
        video_id=video_id, title=title, dataset_id=MY_VIDEOS_ID, dataset_name=MY_VIDEOS_NAME,
        anomaly_types=anomaly_types or ["normal"], origin=origin, video=video, thumb=thumb,
        original_name=original_name,
    )
    job.items_done = job.clips_added = 1


def start_url_download(url: str, title: str | None, anomaly_types: list[str]) -> Job:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Enter a full http or https link to a video file")
    name = Path(unquote(parsed.path)).name or "video"
    label = title or Path(name).stem or "Video from link"

    def run(job: Job) -> None:
        ext = Path(name).suffix.lower() if Path(name).suffix.lower() in VIDEO_EXTS else ".mp4"
        raw = config.DOWNLOADS_DIR / "url" / f"{job.id}{ext}"
        _set_stage(job, "downloading")
        _download(job, url, raw)
        try:
            _import_single(job, raw, label, "url", anomaly_types, name)
        except media.MediaError as exc:
            raise RuntimeError("The link did not point to a playable video file") from exc
        finally:
            raw.unlink(missing_ok=True)

    return _submit(Job(id=_new_id(), kind="url", label=label), run)


def start_upload_import(src: Path, original_name: str, anomaly_types: list[str]) -> Job:
    label = Path(original_name).stem or "Uploaded video"

    def run(job: Job) -> None:
        try:
            _import_single(job, src, label, "upload", anomaly_types, original_name)
        except media.MediaError as exc:
            raise RuntimeError("This file is not a video we can read") from exc
        finally:
            src.unlink(missing_ok=True)

    return _submit(Job(id=_new_id(), kind="upload", label=label), run)


def delete_clip(video: dict[str, Any]) -> None:
    for rel in (video.get("file_path"), video.get("thumb_path")):
        if rel:
            (config.DATA_DIR / rel).unlink(missing_ok=True)
    db.delete_library_video(video["id"])

