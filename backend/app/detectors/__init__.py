"""Supervised detector plugins.

To add a model (for example the one trained in the thesis): subclass
detectors.base.Detector, list its weights in backend/models/models.json and add
the class to PLUGINS. The pipeline runs every loaded plugin, takes the highest
probability per class, and needs no other change.
"""

from __future__ import annotations

from .base import Box, Detector, TrackedObject, Window
from .clip_models import CrashDetector, FightDetector
from .yolo_models import FireDetector

PLUGINS: list[type[Detector]] = [FightDetector, CrashDetector, FireDetector]

SUPERVISED_CLASSES = ("fight", "car_accident", "fire_explosion")

__all__ = ["PLUGINS", "SUPERVISED_CLASSES", "Box", "Detector", "TrackedObject", "Window"]
