import asyncio
import logging
import re
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import cv2
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from .. import config, db, overlay
from ..cameras import resolve_file_source
from ..events import bus
from ..normality import REASON_LABELS, NormalityModel
from ..pipeline import learn_from_video
from ..runtime import cameras as manager
from ..runtime import pipeline
from ..schemas import Camera, CameraCreate, CameraUpdate, LearnRequest

log = logging.getLogger("vad.routes.cameras")

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

URL_RE = re.compile(r"^(rtsp|rtsps|http|https)://\S+$", re.IGNORECASE)
BOUNDARY = "frame"


def camera_out(row: dict[str, Any], counts: dict[str, int] | None = None) -> dict[str, Any]:
    counts = db.review_counts() if counts is None else counts
    st = pipeline.state(row["id"])
    progress = row["learning_progress"]
    if st is not None and row["unsupervised"] == "learning":
        progress = round(min(1.0, st.normality.seconds / (row["learn_seconds"] or config.LEARN_SECONDS)), 3)
    return {
        "id": row["id"],
        "name": row["name"],
        "stream_url": f"/api/cameras/{row['id']}/stream",
        "people_count": st.people_count if st else 0,
        "to_review": counts.get(row["id"], 0),
        "supervised": row["supervised"],
        "unsupervised": row["unsupervised"],
        "learning_progress": progress if row["unsupervised"] == "learning" else None,
        "thresholds": {**config.DEFAULT_THRESHOLDS, **row["thresholds"]},
        "learn_seconds": row["learn_seconds"],
        "source_type": row["source_type"],
        "source": row["source"],
        "library_video_id": row["library_video_id"],
        "status": manager.status(row["id"]),
        "position": row["position"],
    }


def _resolve_source(source_type: str, source: str | None, library_video_id: str | None) -> tuple[str, str | None]:
    """Validate a camera source. Returns (source, library_video_id)."""
    if source_type == "file":
        if library_video_id:
            video = db.get_library_video(library_video_id)
            if video is None:
                raise HTTPException(422, "That library video no longer exists")
            return video["file_path"], library_video_id
        if not source:
            raise HTTPException(422, "Choose a video from the library or enter a file path")
        if not resolve_file_source(source).is_file():
            raise HTTPException(422, f"File not found: {source}")
        return source, None
    if source_type == "webcam":
        source = (source or "0").strip()
        if not source.isdigit() or int(source) > 9:
            raise HTTPException(422, "Webcam index must be a number from 0 to 9")
        return source, None
    if not source or not URL_RE.match(source.strip()):
        raise HTTPException(422, "Enter a stream address starting with rtsp:// or http://")
    return source.strip(), None


def _require(camera_id: str) -> dict[str, Any]:
    row = db.get_camera(camera_id)
    if row is None:
        raise HTTPException(404, "Camera not found")
    return row


@router.get("", response_model=list[Camera])
def list_cameras() -> list[dict[str, Any]]:
    counts = db.review_counts()
    return [camera_out(r, counts) for r in db.list_cameras()]


@router.post("", response_model=Camera, status_code=status.HTTP_201_CREATED)
def create_camera(body: CameraCreate) -> dict[str, Any]:
    if len(db.list_cameras()) >= config.MAX_CAMERAS:
        raise HTTPException(409, f"All {config.MAX_CAMERAS} camera slots are in use")
    camera_id = body.id or f"cam-{uuid.uuid4().hex[:4]}"
    if db.get_camera(camera_id):
        raise HTTPException(409, f"A camera with id {camera_id} already exists")
    source, video_id = _resolve_source(body.source_type, body.source, body.library_video_id)
    db.insert_camera({
        "id": camera_id, "name": body.name.strip(), "source_type": body.source_type,
        "source": source, "library_video_id": video_id, "learn_seconds": config.LEARN_SECONDS,
    })
    row = _require(camera_id)
    manager.start(row)
    bus.publish({"type": "cameras.changed"})
    return camera_out(row)


@router.get("/{camera_id}", response_model=Camera)
def get_camera(camera_id: str) -> dict[str, Any]:
    return camera_out(_require(camera_id))


@router.patch("/{camera_id}", response_model=Camera)
def update_camera(camera_id: str, body: CameraUpdate) -> dict[str, Any]:
    row = _require(camera_id)
    changes = body.model_dump(exclude_unset=True)
    source_changed = any(k in changes for k in ("source_type", "source", "library_video_id"))
    if source_changed:
        source_type = changes.get("source_type", row["source_type"])
        video_id = changes.get("library_video_id") if "library_video_id" in changes else None
        source = changes.get("source") if "source" in changes else (None if video_id else row["source"])
        changes["source"], changes["library_video_id"] = _resolve_source(source_type, source, video_id)
        changes["source_type"] = source_type
    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()
    if changes.get("thresholds") is not None:
        if any(not 0.05 <= v <= 0.99 for v in changes["thresholds"].values()):
            raise HTTPException(422, "Thresholds must be between 0.05 and 0.99")
        changes["thresholds"] = {**row["thresholds"], **changes["thresholds"]}
    if changes.get("unsupervised") == "learning" or changes.get("learn_seconds") is not None:
        # Back on, or a new learning length: ready if enough footage was already learned.
        if (changes.get("unsupervised") or row["unsupervised"]) != "off":
            learned = _model_for(camera_id).seconds
            target = changes.get("learn_seconds") or row["learn_seconds"]
            changes["unsupervised"] = "ready" if learned >= target else "learning"
    db.update_camera(camera_id, {k: v for k, v in changes.items() if v is not None or k == "library_video_id"})
    row = _require(camera_id)
    if source_changed:
        manager.start(row)
        pipeline.reset_normality(camera_id)  # a new source is a new scene
        row = _require(camera_id)
    bus.publish({"type": "cameras.changed"})
    return camera_out(row)


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(camera_id: str) -> Response:
    _require(camera_id)
    manager.stop(camera_id)
    pipeline.forget(camera_id, delete_model=True)
    db.delete_camera(camera_id)
    bus.publish({"type": "cameras.changed"})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{camera_id}/restart", response_model=Camera)
def restart_camera(camera_id: str) -> dict[str, Any]:
    """Reconnect now (the Retry button on an offline tile)."""
    row = _require(camera_id)
    worker = manager.get(camera_id)
    if worker and worker.is_alive():
        worker.retry()
    else:
        manager.start(row)
    return camera_out(row)


@router.get("/{camera_id}/snapshot")
def snapshot(camera_id: str) -> Response:
    _require(camera_id)
    buf = manager.buffer(camera_id)
    frame = buf.latest() if buf else None
    if frame is None:
        raise HTTPException(503, "No frame yet")
    return Response(frame.jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


_overlay_cache: dict[str, tuple[int, bytes]] = {}
_overlay_lock = threading.Lock()


def _overlay_jpeg(camera_id: str, frame: Any) -> bytes:
    """The frame with the latest tracks, poses and detections drawn; shared by all viewers."""
    with _overlay_lock:
        cached = _overlay_cache.get(camera_id)
        if cached and cached[0] == frame.seq:
            return cached[1]
    st = pipeline.state(camera_id)
    if st is None:
        return frame.jpeg
    active = [a["key"] for a in pipeline.alerts.live(camera_id)] if pipeline.alerts else []
    img = overlay.draw(frame.image, st.objects, st.boxes, **overlay.alarm_marks(active, st))
    ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, config.JPEG_QUALITY])
    data = jpg.tobytes() if ok else frame.jpeg
    with _overlay_lock:
        _overlay_cache[camera_id] = (frame.seq, data)
    return data


@router.get("/{camera_id}/stream")
async def stream(camera_id: str, request: Request, overlay: bool = False) -> StreamingResponse:
    """MJPEG stream of the shared frame buffer, about STREAM_FPS frames per second.
    With overlay=1 the boxes, track ids and poses of the analysis are drawn in."""
    _require(camera_id)
    for _ in range(100):  # wait up to 10 s for the first frame
        worker = manager.get(camera_id)
        if worker and worker.buffer.latest() is not None:
            break
        if worker is None or worker.status == "offline":
            raise HTTPException(503, worker.error if worker and worker.error else "Camera is offline")
        await asyncio.sleep(0.1)
    else:
        raise HTTPException(503, "Camera did not deliver a frame in time")

    async def frames():
        last_seq = -1
        poll = 1.0 / (config.STREAM_FPS * 2)
        while not await request.is_disconnected():
            worker = manager.get(camera_id)  # may be replaced when the camera is edited
            if worker is None or worker.status == "offline":
                break
            frame = worker.buffer.latest()
            if frame is not None and frame.seq != last_seq:
                last_seq = frame.seq
                jpeg = await asyncio.to_thread(_overlay_jpeg, camera_id, frame) if overlay else frame.jpeg
                yield (
                    f"--{BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: {len(jpeg)}\r\n\r\n"
                ).encode() + jpeg + b"\r\n"
            await asyncio.sleep(poll)

    return StreamingResponse(
        frames(),
        media_type=f"multipart/x-mixed-replace; boundary={BOUNDARY}",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
    )


# --- scene normality -----------------------------------------------------------


def _model_for(camera_id: str) -> NormalityModel:
    st = pipeline.state(camera_id)
    return st.normality if st else (NormalityModel.load(camera_id) or NormalityModel(camera_id))


@router.get("/{camera_id}/normality")
def normality(camera_id: str) -> dict[str, Any]:
    """What the scene normality model has learned for this camera."""
    row = _require(camera_id)
    return {
        "state": row["unsupervised"],
        "learn_seconds": row["learn_seconds"],
        "reasons": REASON_LABELS,
        "job": _learn_jobs.get(camera_id),
        **_model_for(camera_id).summary(),
    }


@router.get("/{camera_id}/normality/heatmap")
def normality_heatmap(camera_id: str, cls: str | None = None) -> Response:
    """Where things (or one class) normally appear, drawn over the current frame."""
    _require(camera_id)
    buf = manager.buffer(camera_id)
    frame = buf.latest() if buf else None
    data = _model_for(camera_id).heatmap(cls, frame.image if frame else None)
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@router.post("/{camera_id}/normality/reset", response_model=Camera)
def normality_reset(camera_id: str) -> dict[str, Any]:
    """Forget everything learned and learn again from the live footage."""
    _require(camera_id)
    pipeline.reset_normality(camera_id)
    return camera_out(_require(camera_id))


_learn_jobs: dict[str, dict[str, Any]] = {}
_learn_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="learn")


def start_learning(camera_id: str, path: Path, title: str, kind: str = "clip") -> dict[str, Any]:
    """Learn from a video file in the background; progress goes out as "normality.job" events."""
    job = {"camera_id": camera_id, "title": title, "kind": kind, "progress": 0.0, "stage": "queued",
           "seconds_added": 0.0, "error": None}
    _learn_jobs[camera_id] = job

    def publish() -> None:
        bus.publish({"type": "normality.job", "job": dict(job)})

    def run() -> None:
        job["stage"] = "learning"
        publish()

        def progress(p: float) -> None:
            job["progress"] = round(p, 3)
            publish()

        try:
            job["seconds_added"] = round(learn_from_video(camera_id, path, progress), 1)
            job["stage"], job["progress"] = "done", 1.0
            row = db.get_camera(camera_id)
            if row and row["unsupervised"] == "learning" and _model_for(camera_id).seconds >= row["learn_seconds"]:
                db.update_camera(camera_id, {"unsupervised": "ready", "learning_progress": 1.0})
        except Exception as exc:
            log.exception("learning from %s failed", path)
            job["stage"], job["error"] = "error", str(exc)
        publish()
        bus.publish({"type": "cameras.changed"})

    publish()
    _learn_executor.submit(run)
    return job


@router.post("/{camera_id}/normality/learn", status_code=status.HTTP_202_ACCEPTED)
def normality_learn(camera_id: str, body: LearnRequest) -> dict[str, Any]:
    """Add a library clip of normal footage from this scene to the camera's normality model."""
    _require(camera_id)
    video = db.get_library_video(body.library_video_id)
    if video is None:
        raise HTTPException(404, "Video not found")
    running = _learn_jobs.get(camera_id)
    if running and running["stage"] in ("queued", "learning"):
        raise HTTPException(409, "This camera is already learning from a clip")
    return start_learning(camera_id, config.DATA_DIR / video["file_path"], video["title"])
