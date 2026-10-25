from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import config, db
from ..events import bus
from ..runtime import cameras as manager

router = APIRouter(tags=["system"])


@router.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/status")
def pipeline_status() -> dict[str, Any]:
    """What the pipeline bar on the Live page shows."""
    cams = db.list_cameras()
    live = sum(1 for c in cams if manager.status(c["id"]) == "live")
    return {
        "camera_slots": {"used": len(cams), "total": config.MAX_CAMERAS},
        "stages": [
            {"key": "streams", "label": "Streams", "active": live > 0, "detail": f"{live}/{len(cams)}"},
            # Detection stages arrive in step 3.
            {"key": "pose", "label": "Person and pose", "active": False, "detail": "not running"},
            {"key": "scoring", "label": "Anomaly scoring", "active": False, "detail": "not running"},
            {"key": "captions", "label": "Scene captions", "active": False, "detail": "not running"},
        ],
    }


@router.websocket("/ws")
async def websocket(ws: WebSocket) -> None:
    await bus.connect(ws)
    try:
        await ws.send_json({"type": "hello"})
        while True:
            await ws.receive_text()  # clients only listen; this detects disconnects
    except WebSocketDisconnect:
        pass
    finally:
        bus.disconnect(ws)
