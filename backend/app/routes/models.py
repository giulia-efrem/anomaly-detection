"""Every model the pipeline uses: file, license, load state, device and memory."""

import subprocess
import time
from typing import Any

from fastapi import APIRouter

from .. import db, model_files
from ..pipeline import models as loaded

router = APIRouter(prefix="/api/models", tags=["models"])


_gpu_cache: tuple[float, dict[str, Any] | None] = (0.0, None)


def gpu_memory() -> dict[str, Any] | None:
    """Whole-GPU load and memory as nvidia-smi reports them (all processes), cached for 2 s."""
    global _gpu_cache
    if time.monotonic() - _gpu_cache[0] < 2.0:
        return _gpu_cache[1]
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,utilization.gpu,memory.used,memory.total",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        ).stdout.strip().splitlines()[0]
        name, util, used, total = (x.strip() for x in out.split(","))
        info: dict[str, Any] | None = {"name": name, "util_pct": int(util), "used_mb": int(used),
                                       "total_mb": int(total)}
    except Exception:
        info = None
    _gpu_cache = (time.monotonic(), info)
    return info


@router.get("")
def list_models() -> dict[str, Any]:
    out = []
    for m in model_files.entries():
        st = loaded.status.get(m["id"], {})
        out.append({
            **{k: m[k] for k in ("id", "name", "role", "family", "classes", "license", "license_url",
                                 "source_url", "size_bytes")},
            "downloaded": model_files.is_present(m["id"]),
            "loaded": bool(st.get("loaded")),
            "device": st.get("device"),
            "vram_mb": st.get("vram_mb"),
            "error": st.get("error"),
        })
    return {
        "verified_at": model_files.manifest()["verified_at"],
        "ready": loaded.ready.is_set(),
        "device": loaded.device,
        "gpu": gpu_memory(),
        "models": out,
        "feedback": db.feedback_counts(),
    }
