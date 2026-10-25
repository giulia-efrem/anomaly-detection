import asyncio
import re
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse

from .. import config, db
from ..cameras import resolve_file_source
from ..events import bus
from ..runtime import cameras as manager
from ..schemas import Camera, CameraCreate, CameraUpdate

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

URL_RE = re.compile(r"^(rtsp|rtsps|http|https)://\S+$", re.IGNORECASE)
BOUNDARY = "frame"


def camera_out(row: dict[str, Any], counts: dict[str, int] | None = None) -> dict[str, Any]:
    counts = db.review_counts() if counts is None else counts
    return {
        "id": row["id"],
        "name": row["name"],
        "stream_url": f"/api/cameras/{row['id']}/stream",
        "people_count": 0,  # filled by the pose model in step 3
        "to_review": counts.get(row["id"], 0),
        "supervised": row["supervised"],
        "unsupervised": row["unsupervised"],
        "learning_progress": row["learning_progress"],
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
        "source": source, "library_video_id": video_id,
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
    db.update_camera(camera_id, {k: v for k, v in changes.items() if v is not None or k == "library_video_id"})
    row = _require(camera_id)
    if source_changed:
        manager.start(row)
    bus.publish({"type": "cameras.changed"})
    return camera_out(row)


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_camera(camera_id: str) -> Response:
    _require(camera_id)
    manager.stop(camera_id)
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


@router.get("/{camera_id}/stream")
async def stream(camera_id: str, request: Request) -> StreamingResponse:
    """MJPEG stream of the shared frame buffer, about STREAM_FPS frames per second."""
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
                yield (
                    f"--{BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: {len(frame.jpeg)}\r\n\r\n"
                ).encode() + frame.jpeg + b"\r\n"
            await asyncio.sleep(poll)

    return StreamingResponse(
        frames(),
        media_type=f"multipart/x-mixed-replace; boundary={BOUNDARY}",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
    )
