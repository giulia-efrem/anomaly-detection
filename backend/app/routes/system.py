from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import config, db
from ..events import bus
from ..runtime import cameras as manager
from ..runtime import pipeline

router = APIRouter(tags=["system"])


@router.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/status")
def pipeline_status() -> dict[str, Any]:
    """What the pipeline bar on the Live page shows."""
    cams = db.list_cameras()
    live = sum(1 for c in cams if manager.status(c["id"]) == "live")
    summary = pipeline.summary()
    analysed = [f for cid, f in summary["fps"].items() if manager.status(cid) == "live"]
    plugins = summary["plugins"]
    ready = sum(1 for c in cams if c["unsupervised"] == "ready")
    learning = sum(1 for c in cams if c["unsupervised"] == "learning")
    if summary["error"]:
        det_detail = "models missing"
    elif not summary["ready"]:
        det_detail = "loading models"
    else:
        det_detail = f"{sum(analysed) / len(analysed):.1f} fps" if analysed else "idle"
    return {
        "camera_slots": {"used": len(cams), "total": config.MAX_CAMERAS},
        "stages": [
            {"key": "streams", "label": "Streams", "active": live > 0, "detail": f"{live}/{len(cams)}"},
            {"key": "tracking", "label": "Detection and tracking", "active": bool(analysed), "detail": det_detail},
            {"key": "supervised", "label": "Pretrained models", "active": bool(plugins) and bool(analysed),
             "detail": f"{len(plugins)} loaded" if summary["ready"] else "loading"},
            {"key": "normality", "label": "Scene normality", "active": ready > 0,
             "detail": f"{ready} ready, {learning} learning" if cams else "no cameras"},
        ],
        "pipeline": summary,
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
