"""The plugin interface every supervised detector implements.

A detector names the incident classes it can raise, loads its weights in
warmup(), and maps a Window (the recent frames of one camera plus what the
tracker sees right now) to {class: probability}. The thesis model can be
added later as one more plugin, next to or instead of the pretrained ones.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import numpy as np

VEHICLES = frozenset({"car", "truck", "bus", "motorcycle"})
# Furniture and fittings: part of the scene, not events. Not drawn on overlays and never an
# "unusual object" (a chair pushed to another desk is not a security event).
SCENERY = frozenset({"chair", "dining table", "couch", "bed", "potted plant", "tv", "bench", "toilet", "sink",
                     "refrigerator", "oven", "microwave", "clock", "vase", "book", "laptop", "keyboard", "mouse",
                     "remote", "traffic light", "fire hydrant", "stop sign", "parking meter"})


@dataclass
class TrackedObject:
    track_id: int
    cls: str  # COCO class name
    conf: float
    box: tuple[float, float, float, float]  # x1, y1, x2, y2 as fractions of the frame
    velocity: tuple[float, float] = (0.0, 0.0)  # box heights per second, image axes
    age_s: float = 0.0  # seconds since the track started
    keypoints: np.ndarray | None = None  # (17, 3) x, y in frame fractions, confidence

    @property
    def center(self) -> tuple[float, float]:
        return (self.box[0] + self.box[2]) / 2, (self.box[1] + self.box[3]) / 2

    @property
    def height(self) -> float:
        return max(self.box[3] - self.box[1], 1e-6)

    @property
    def size(self) -> float:
        """Longer box side in frame heights (16:9 frames), so a person lying down still counts as large."""
        return max(self.height, (self.box[2] - self.box[0]) * 16 / 9)

    @property
    def speed(self) -> float:
        return float(np.hypot(*self.velocity))


@dataclass
class Box:
    """A detection a plugin wants drawn on the overlay and the incident thumbnail."""

    label: str
    conf: float
    box: tuple[float, float, float, float]  # fractions of the frame
    color: tuple[int, int, int]  # BGR


@dataclass
class Window:
    camera_id: str
    frames: list[np.ndarray]  # small BGR frames at the analysis rate (~5 fps), oldest first
    timestamps: list[float]
    image: np.ndarray  # the newest frame at stream size, BGR
    objects: list[TrackedObject]
    state: dict[str, Any] = field(default_factory=dict)  # per camera and detector, kept between calls

    @property
    def people(self) -> list[TrackedObject]:
        return [o for o in self.objects if o.cls == "person"]

    @property
    def vehicles(self) -> list[TrackedObject]:
        return [o for o in self.objects if o.cls in VEHICLES]


class Detector(ABC):
    id: str  # matches backend/models/models.json
    name: str
    classes: tuple[str, ...]
    family = "pretrained"  # "pretrained" now; "thesis" for the model trained in this project
    window_size = 1  # frames needed from the window
    every_s = 0.0  # minimum seconds between runs on one camera (0 = every analysis frame)

    def __init__(self, device: str) -> None:
        self.device = device
        self.loaded = False
        self.error: str | None = None
        self.last_boxes: dict[str, list[Box]] = {}  # camera id -> boxes from the last run
        self.last_note: dict[str, str] = {}  # camera id -> short explanation of the last score

    @abstractmethod
    def warmup(self) -> None:
        """Load weights and run one dummy batch so the first real call is fast."""

    def wants(self, window: Window) -> bool:
        """Whether running this model on the window makes sense (cheap gate)."""
        return len(window.frames) >= self.window_size

    @abstractmethod
    def score(self, window: Window) -> dict[str, float]:
        """{class: probability} for one camera."""

    def score_batch(self, windows: list[Window]) -> list[dict[str, float]]:
        """Several cameras at once. Override to batch on the GPU."""
        return [self.score(w) for w in windows]

    def info(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "classes": list(self.classes), "family": self.family,
                "loaded": self.loaded, "error": self.error}
