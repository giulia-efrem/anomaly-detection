from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import config, db, model_files
from ..events import bus
from ..pipeline import models as loaded_models
from .models import gpu_memory
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


@router.get("/api/system")
def system() -> dict[str, Any]:
    """Status bar and health: cameras online, GPU load and memory, models loaded, open issues."""
    cams = db.list_cameras()
    offline = [c["name"] for c in cams if manager.status(c["id"]) == "offline"]
    online = sum(1 for c in cams if manager.status(c["id"]) == "live")
    entries = model_files.entries()
    loaded = sum(1 for m in entries if loaded_models.status.get(m["id"], {}).get("loaded"))
    failed = [m["name"] for m in entries if loaded_models.status.get(m["id"], {}).get("error")]
    summary = pipeline.summary()
    issues = [f"Camera offline: {n}" for n in offline]
    issues += [f"Model not loaded: {n}" for n in failed]
    if summary["error"]:
        issues.append(f"Analysis stopped: {summary['error']}")
    fps = [f for cid, f in summary["fps"].items() if manager.status(cid) == "live"]
    return {
        "cameras": {"online": online, "total": len(cams)},
        "gpu": gpu_memory(),
        "models": {"loaded": loaded, "total": len(entries), "ready": summary["ready"]},
        "analysis_fps": round(sum(fps) / len(fps), 1) if fps else None,
        "issues": issues,
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
