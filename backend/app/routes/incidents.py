from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .. import config, db
from ..events import bus
from ..schemas import Incident, IncidentPatch, IncidentStatus, IncidentType, RaisedBy
from .cameras import start_learning

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


def _require(incident_id: str) -> dict[str, Any]:
    incident = db.get_incident(incident_id)
    if incident is None:
        raise HTTPException(404, "Incident not found")
    return incident


def _clip_path(incident_id: str):
    return config.INCIDENTS_DIR / f"{incident_id}.mp4"


@router.get("", response_model=list[Incident])
def list_incidents(
    status: IncidentStatus | None = None,
    camera_id: str | None = None,
    raised_by: RaisedBy | None = None,
    type: IncidentType | None = None,
) -> list[dict[str, Any]]:
    return db.list_incidents(status=status, camera_id=camera_id, raised_by=raised_by, type=type)


@router.get("/{incident_id}", response_model=Incident)
def get_incident(incident_id: str) -> dict[str, Any]:
    return _require(incident_id)


@router.patch("/{incident_id}", response_model=Incident)
def patch_incident(incident_id: str, body: IncidentPatch) -> dict[str, Any]:
    """Review decision. Confirmed and false alarm are also stored as labels for retraining."""
    incident = _require(incident_id)
    db.set_incident_status(incident_id, body.status)
    if body.status != "needs_review" and body.status != incident["status"]:
        clip = _clip_path(incident_id)
        db.add_feedback(incident, body.status, clip.relative_to(config.DATA_DIR).as_posix() if clip.is_file() else None)
    incident = _require(incident_id)
    bus.publish({"type": "incident.updated", "incident": incident})
    return incident


@router.post("/{incident_id}/normal", response_model=Incident)
def mark_normal(incident_id: str) -> dict[str, Any]:
    """"This is normal": a false alarm whose clip is added to the camera's normality model."""
    incident = _require(incident_id)
    clip = _clip_path(incident_id)
    db.set_incident_status(incident_id, "false_alarm")
    db.add_feedback(incident, "normal", clip.relative_to(config.DATA_DIR).as_posix() if clip.is_file() else None)
    if clip.is_file() and db.get_camera(incident["camera_id"]):
        start_learning(incident["camera_id"], clip, f"Incident {incident_id}", kind="incident")
    incident = _require(incident_id)
    bus.publish({"type": "incident.updated", "incident": incident})
    return incident


@router.get("/{incident_id}/clip")
def clip(incident_id: str) -> FileResponse:
    _require(incident_id)
    path = _clip_path(incident_id)
    if not path.is_file():
        raise HTTPException(404, "The clip is still being recorded")
    return FileResponse(path, media_type="video/mp4")


@router.get("/{incident_id}/thumbnail")
def thumbnail(incident_id: str) -> FileResponse:
    _require(incident_id)
    path = config.INCIDENTS_DIR / f"{incident_id}.jpg"
    if not path.is_file():
        raise HTTPException(404, "No thumbnail")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "max-age=86400"})
