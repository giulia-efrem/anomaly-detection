"""Process-wide singletons shared by the routes."""

from .cameras import CameraManager
from .events import bus
from .pipeline import Pipeline


def _on_camera_status(camera_id: str, status: str) -> None:
    bus.publish({"type": "camera.status", "camera_id": camera_id, "status": status})


cameras = CameraManager(on_status=_on_camera_status)
pipeline = Pipeline(cameras)
