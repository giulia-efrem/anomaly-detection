"""Detectors built on YOLOv8 object detectors (Ultralytics).

fire_explosion: YOLOv8n trained on D-Fire (rabahdev), classes smoke and fire.
    Score = the most confident fire box (smoke counts at 0.85 of its confidence).
    An explosion is a sudden large fire or smoke region together with a sudden
    jump in brightness or motion; it lifts the score.
shooting: YOLOv8n threat detector (Subh775), classes Gun, explosion, grenade, knife.
    A gun only counts when it is small next to a person (the model sometimes boxes
    a whole person as "Gun"), and only after it was seen in several of the last
    frames; sudden movement of the people around it raises the score. The model's
    "explosion" class is not used: on test footage it fired on quiet streets and
    missed real fireballs.
"""

from __future__ import annotations

from collections import deque

import cv2
import numpy as np

from .. import model_files
from .base import Box, Detector, TrackedObject, Window

IMGSZ = 640


def _load_yolo(model_id: str, device: str):
    from ultralytics import YOLO

    model = YOLO(str(model_files.path(model_id)), task="detect")
    model.predict(np.zeros((360, 640, 3), np.uint8), imgsz=IMGSZ, device=device, quantize=16 if device == "cuda" else None, verbose=False)
    return model


def _boxes(result) -> list[tuple[str, float, tuple[float, float, float, float]]]:
    """(class name, confidence, normalised xyxy) for every box in one Ultralytics result."""
    if result.boxes is None or len(result.boxes) == 0:
        return []
    names = result.names
    xyxyn = result.boxes.xyxyn.cpu().numpy()
    conf = result.boxes.conf.cpu().numpy()
    cls = result.boxes.cls.cpu().numpy().astype(int)
    return [(names[c], float(p), tuple(map(float, b))) for c, p, b in zip(cls, conf, xyxyn)]


def _area(b: tuple[float, float, float, float]) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _brightness(frame: np.ndarray) -> float:
    return float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean())


def _motion(a: np.ndarray, b: np.ndarray) -> float:
    """Mean absolute grey-level difference between two small frames, 0..255."""
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    return float(cv2.absdiff(ga, gb).mean())


class FireDetector(Detector):
    id = "fire-yolov8n"
    name = "YOLOv8n fire and smoke (D-Fire)"
    classes = ("fire_explosion",)
    every_s = 1.0
    window_size = 1
    CONF = 0.25
    SMOKE_WEIGHT = 0.85
    MAX_AREA = 0.5

    def warmup(self) -> None:
        self.model = _load_yolo(self.id, self.device)
        self.loaded = True

    def score_batch(self, windows: list[Window]) -> list[dict[str, float]]:
        if not windows:
            return []
        results = self.model.predict([w.image for w in windows], imgsz=IMGSZ, conf=self.CONF, device=self.device,
                                     quantize=16 if self.device == "cuda" else None, verbose=False)
        return [self._score_one(w, r) for w, r in zip(windows, results)]

    def score(self, window: Window) -> dict[str, float]:
        return self.score_batch([window])[0]

    def _score_one(self, w: Window, result) -> dict[str, float]:
        # Boxes over half the image are nearly always haze, glare or a grey sky, not smoke.
        dets = [d for d in _boxes(result) if d[0] in ("fire", "smoke") and _area(d[2]) <= self.MAX_AREA]
        self.last_boxes[w.camera_id] = [
            Box(name, conf, box, (40, 90, 255) if name == "fire" else (170, 170, 170)) for name, conf, box in dets
        ]
        fire = max((c for n, c, _ in dets if n == "fire"), default=0.0)
        smoke = max((c for n, c, _ in dets if n == "smoke"), default=0.0)
        base = max(fire, smoke * self.SMOKE_WEIGHT)
        area = min(1.0, sum(_area(b) for _, _, b in dets))

        # Fire/smoke area once per second, brightness and motion from the analysis frames.
        hist: deque = w.state.setdefault("area", deque(maxlen=6))
        prev_area = min(hist) if hist else 0.0
        hist.append(area)
        frames = w.frames
        jump_bright = jump_motion = 0.0
        if len(frames) >= 6:
            bright = [_brightness(f) for f in frames[-6:]]
            jump_bright = bright[-1] - float(np.median(bright[:-2]))
            motion = [_motion(frames[i - 1], frames[i]) for i in range(len(frames) - 5, len(frames))]
            jump_motion = motion[-1] - float(np.median(motion[:-1]))

        sudden_region = area >= 0.06 and area >= 3 * prev_area + 0.03
        sudden_light = jump_bright >= 25 or jump_motion >= 20
        if sudden_region and sudden_light:
            score = max(base, 0.6 + 0.4 * base)
            self.last_note[w.camera_id] = (
                f"Explosion: fire or smoke grew from {prev_area:.0%} to {area:.0%} of the image "
                f"and the scene {'brightened' if jump_bright >= 25 else 'moved'} suddenly"
            )
        elif base > 0:
            score = base
            what = "Fire" if fire * 1.0 >= smoke * self.SMOKE_WEIGHT else "Smoke"
            self.last_note[w.camera_id] = f"{what} detected, covering {area:.0%} of the image"
        else:
            score = 0.0
            self.last_note.pop(w.camera_id, None)
        return {"fire_explosion": float(score)}


def _held(obj_box: tuple[float, float, float, float], person: TrackedObject, margin: float = 0.3) -> bool:
    """A hand-held object: its centre lies in the person's box grown by `margin`, and it is
    much smaller than the person."""
    x1, y1, x2, y2 = person.box
    w, h = x2 - x1, y2 - y1
    cx, cy = (obj_box[0] + obj_box[2]) / 2, (obj_box[1] + obj_box[3]) / 2
    inside = x1 - margin * w <= cx <= x2 + margin * w and y1 - margin * h <= cy <= y2 + margin * h
    small = _area(obj_box) <= 0.3 * w * h and (obj_box[3] - obj_box[1]) <= 0.6 * h
    return inside and small


class ThreatDetector(Detector):
    id = "threat-yolov8n"
    name = "YOLOv8n threat detector"
    classes = ("shooting",)
    every_s = 0.4  # about 2.5 times a second while people are present
    window_size = 1
    CONF = 0.35
    HISTORY = 6  # runs, about 2.4 s
    MIN_HITS = 3  # "several frames" before a gun counts fully
    COLORS = {"Gun": (60, 60, 255), "knife": (60, 160, 255), "grenade": (60, 60, 255), "explosion": (40, 90, 255)}

    def warmup(self) -> None:
        self.model = _load_yolo(self.id, self.device)
        self.loaded = True

    def wants(self, window: Window) -> bool:
        return bool(window.people)

    def score_batch(self, windows: list[Window]) -> list[dict[str, float]]:
        if not windows:
            return []
        results = self.model.predict([w.image for w in windows], imgsz=IMGSZ, conf=self.CONF, device=self.device,
                                     quantize=16 if self.device == "cuda" else None, verbose=False)
        return [self._score_one(w, r) for w, r in zip(windows, results)]

    def score(self, window: Window) -> dict[str, float]:
        return self.score_batch([window])[0]

    def _score_one(self, w: Window, result) -> dict[str, float]:
        dets = _boxes(result)
        people = w.people
        dets = [d for d in dets if d[0] != "explosion" and any(_held(d[2], p) for p in people)]
        self.last_boxes[w.camera_id] = [Box(n.lower(), c, b, self.COLORS.get(n, (60, 60, 255))) for n, c, b in dets]
        best = max((c for n, c, _ in dets if n == "Gun"), default=0.0)

        hits: deque = w.state.setdefault("gun_hits", deque(maxlen=self.HISTORY))
        hits.append(best)
        seen = [h for h in hits if h > 0]
        persistence = min(1.0, len(seen) / self.MIN_HITS)
        gun_score = (float(np.mean(seen)) if seen else 0.0) * persistence

        # Sudden movement of the people around the gun: mean speed now vs. the last 2 s.
        speeds: deque = w.state.setdefault("people_speed", deque(maxlen=self.HISTORY))
        now_speed = float(np.mean([p.speed for p in people])) if people else 0.0
        baseline = float(np.median(speeds)) if speeds else now_speed
        speeds.append(now_speed)
        motion_boost = float(np.clip((now_speed - baseline) / (baseline + 0.3), 0.0, 1.0)) if seen else 0.0
        shooting = min(1.0, gun_score + 0.2 * motion_boost)

        if seen:
            self.last_note[w.camera_id] = (
                f"Gun next to a person in {len(seen)} of the last {len(hits)} frames"
                + (", people around it moved suddenly" if motion_boost > 0.3 else "")
            )
        else:
            self.last_note.pop(w.camera_id, None)
        return {"shooting": shooting}
