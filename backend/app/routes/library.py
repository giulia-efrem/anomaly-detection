import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse

from .. import config, db, library
from ..events import bus
from ..schemas import DownloadRequest, LibraryVideo

router = APIRouter(prefix="/api/library", tags=["library"])


def video_out(v: dict[str, Any], used: dict[str, list[str]]) -> dict[str, Any]:
    return {
        **{k: v[k] for k in (
            "id", "title", "dataset_id", "dataset_name", "anomaly_types", "origin", "original_name",
            "duration_s", "width", "height", "fps", "size_bytes", "created_at",
        )},
        "video_url": f"/api/library/{v['id']}/video",
        "thumbnail_url": f"/api/library/{v['id']}/thumbnail" if v.get("thumb_path") else None,
        "used_by": used.get(v["id"], []),
    }


def _usage() -> dict[str, list[str]]:
    used: dict[str, list[str]] = {}
    for cam in db.list_cameras():
        if cam["library_video_id"]:
            used.setdefault(cam["library_video_id"], []).append(cam["id"])
    return used


def _parse_types(raw: str | None) -> list[str]:
    allowed = set(library.catalog()["anomaly_types"])
    types = [t.strip() for t in (raw or "").split(",") if t.strip()]
    bad = [t for t in types if t not in allowed]
    if bad:
        raise HTTPException(422, f"Unknown anomaly type: {', '.join(bad)}")
    return types


@router.get("", response_model=list[LibraryVideo])
def list_library(dataset_id: str | None = None, anomaly_type: str | None = None) -> list[dict[str, Any]]:
    used = _usage()
    return [video_out(v, used) for v in db.list_library(dataset_id, anomaly_type)]


@router.get("/catalog")
def get_catalog() -> dict[str, Any]:
    cat = library.catalog()
    counts = db.library_counts()
    jobs = library.list_jobs()
    datasets = []
    for d in cat["datasets"]:
        job = next((j for j in jobs if j["dataset_id"] == d["id"]), None)
        datasets.append({
            **{k: v for k, v in d.items() if k not in ("download", "importer")},
            "clips_imported": counts.get(d["id"], 0),
            "job": job,
        })
    return {
        "verified_at": cat["verified_at"],
        "anomaly_types": cat["anomaly_types"],
        "datasets": datasets,
        "excluded": cat.get("excluded", []),
    }


@router.get("/jobs")
def get_jobs() -> list[dict[str, Any]]:
    return library.list_jobs()


@router.post("/download", status_code=status.HTTP_202_ACCEPTED)
def download(body: DownloadRequest) -> dict[str, Any]:
    if bool(body.dataset_id) == bool(body.url):
        raise HTTPException(422, "Send either dataset_id or url")
    if body.dataset_id:
        try:
            return library.start_dataset_download(body.dataset_id).public()
        except KeyError:
            raise HTTPException(404, "Unknown dataset") from None
    types = _parse_types(",".join(body.anomaly_types))
    try:
        return library.start_url_download(body.url or "", body.title, types).public()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
def upload(files: list[UploadFile] = File(...), anomaly_types: str | None = Form(None)) -> list[dict[str, Any]]:
    types = _parse_types(anomaly_types)
    jobs = []
    for f in files:
        name = Path(f.filename or "video").name
        if Path(name).suffix.lower() not in library.VIDEO_EXTS:
            raise HTTPException(422, f"{name} is not a supported video file")
        dst = config.UPLOADS_DIR / f"{uuid.uuid4().hex[:8]}{Path(name).suffix.lower()}"
        with dst.open("wb") as out:
            shutil.copyfileobj(f.file, out, length=1 << 20)
        jobs.append(library.start_upload_import(dst, name, types).public())
    return jobs


def _require(video_id: str) -> dict[str, Any]:
    v = db.get_library_video(video_id)
    if v is None:
        raise HTTPException(404, "Video not found")
    return v


@router.get("/{video_id}", response_model=LibraryVideo)
def get_video(video_id: str) -> dict[str, Any]:
    return video_out(_require(video_id), _usage())


@router.get("/{video_id}/video")
def video_file(video_id: str) -> FileResponse:
    path = config.DATA_DIR / _require(video_id)["file_path"]
    if not path.is_file():
        raise HTTPException(404, "Video file is missing")
    return FileResponse(path, media_type="video/mp4")


@router.get("/{video_id}/thumbnail")
def thumbnail_file(video_id: str) -> FileResponse:
    v = _require(video_id)
    path = config.DATA_DIR / (v["thumb_path"] or "")
    if not v["thumb_path"] or not path.is_file():
        raise HTTPException(404, "No thumbnail")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "max-age=86400"})


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_video(video_id: str) -> Response:
    v = _require(video_id)
    if used := _usage().get(video_id):
        raise HTTPException(409, f"Used by camera {', '.join(used)}. Remove or change the camera first.")
    library.delete_clip(v)
    bus.publish({"type": "library.changed"})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
