from typing import Any

from fastapi import APIRouter, HTTPException

from .. import db
from ..events import bus
from ..schemas import Incident, IncidentPatch, IncidentStatus, RaisedBy

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=list[Incident])
def list_incidents(
    status: IncidentStatus | None = None,
    camera_id: str | None = None,
    raised_by: RaisedBy | None = None,
) -> list[dict[str, Any]]:
    return db.list_incidents(status=status, camera_id=camera_id, raised_by=raised_by)


@router.get("/{incident_id}", response_model=Incident)
def get_incident(incident_id: str) -> dict[str, Any]:
    incident = db.get_incident(incident_id)
    if incident is None:
        raise HTTPException(404, "Incident not found")
    return incident


@router.patch("/{incident_id}", response_model=Incident)
def patch_incident(incident_id: str, body: IncidentPatch) -> dict[str, Any]:
    if not db.set_incident_status(incident_id, body.status):
        raise HTTPException(404, "Incident not found")
    incident = db.get_incident(incident_id)
    bus.publish({"type": "incident.updated", "incident": incident})
    return incident  # type: ignore[return-value]
