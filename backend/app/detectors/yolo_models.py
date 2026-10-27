"""Detectors built on YOLOv8 object detectors (Ultralytics).

fire_explosion: YOLOv8n trained on D-Fire (rabahdev), classes smoke and fire.
    Score = the most confident fire box (smoke counts at 0.85 of its confidence). Flames
    flicker and give off light: a "fire" box whose pixels do not change between frames,
    or with under a quarter of very bright pixels (a red bag, a lamp, an orange jacket),
    counts at half its confidence. On test footage real fire boxes had 32 to 76 % bright
    pixels; a red bag had 19 %.
    An explosion is a sudden large fire or smoke region together with a sudden
    jump in brightness or motion; it lifts the score.
shooting: YOLOv8n threat detector (Subh775), classes Gun, explosion, grenade, knife.
    A gun only counts when it is held by a person and is not the person's own box (the
    model sometimes boxes a whole person as "Gun"), and only after it was seen in several
    of the last frames; sudden movement of the people around it raises the score. The model's
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


def _flicker(a: np.ndarray, b: np.ndarray, box: tuple[float, float, float, float]) -> float:
    """Mean absolute grey-level change inside a box between two frames."""
    h, w = a.shape[:2]
    x1, y1 = int(box[0] * w), int(box[1] * h)
    x2, y2 = max(x1 + 1, int(box[2] * w)), max(y1 + 1, int(box[3] * h))
    ga = cv2.cvtColor(a[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(b[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
    return float(cv2.absdiff(ga, gb).mean()) if ga.size else 0.0


def _glow(img: np.ndarray, box: tuple[float, float, float, float]) -> float:
    """Share of very bright pixels (HSV value >= 220) inside a box."""
    h, w = img.shape[:2]
    x1, y1 = int(box[0] * w), int(box[1] * h)
    x2, y2 = max(x1 + 1, int(box[2] * w)), max(y1 + 1, int(box[3] * h))
    crop = img[y1:y2, x1:x2]
    if not crop.size:
        return 0.0
    return float((cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)[..., 2] >= 220).mean())


class FireDetector(Detector):
    id = "fire-yolov8n"
    name = "YOLOv8n fire and smoke (D-Fire)"
    classes = ("fire_explosion",)
    every_s = 1.0
    window_size = 1
    CONF = 0.25
    SMOKE_WEIGHT = 0.85
    MAX_AREA = 0.5
    STILL = 8.0  # mean grey-level change in a box below which it is not flickering
    GLOW = 0.25  # share of pixels with brightness >= 220 a real flame box has at least

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

    def _flame(self, w: Window, box: tuple[float, float, float, float]) -> bool:
        if _glow(w.image, box) < self.GLOW:
            return False
        return len(w.frames) < 2 or _flicker(w.frames[-2], w.frames[-1], box) >= self.STILL

    def _score_one(self, w: Window, result) -> dict[str, float]:
        # Boxes over half the image are nearly always haze, glare or a grey sky, not smoke.
        dets = [d for d in _boxes(result) if d[0] in ("fire", "smoke") and _area(d[2]) <= self.MAX_AREA]
        dets = [(n, c * 0.5 if n == "fire" and not self._flame(w, b) else c, b) for n, c, b in dets]
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


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / (_area(a) + _area(b) - inter + 1e-9)


def _held(obj_box: tuple[float, float, float, float], person: TrackedObject, margin: float = 0.3) -> bool:
    """A hand-held object: its centre lies in the person's box grown by `margin`, and it is not
    the person itself (the model sometimes boxes a whole person as "Gun")."""
    x1, y1, x2, y2 = person.box
    w, h = x2 - x1, y2 - y1
    cx, cy = (obj_box[0] + obj_box[2]) / 2, (obj_box[1] + obj_box[3]) / 2
    inside = x1 - margin * w <= cx <= x2 + margin * w and y1 - margin * h <= cy <= y2 + margin * h
    is_person = _iou(obj_box, person.box) >= 0.5 or (obj_box[3] - obj_box[1]) >= 0.9 * h
    return inside and not is_person


def _counts(box: tuple[float, float, float, float], people: list[TrackedObject]) -> bool:
    """Held by a person, or a close-up (at least 5 % of the image) where only a hand is in view."""
    if any(_held(box, p) for p in people):
        return True
    return _area(box) >= 0.05 and not any(_iou(box, p.box) >= 0.5 for p in people)


class ThreatDetector(Detector):
    id = "threat-yolov8n"
    name = "YOLOv8n threat detector"
    classes = ("shooting",)
    every_s = 0.6  # about 1.7 times a second while people are present
    window_size = 1
    CONF = 0.35
    HISTORY = 5  # runs, about 3 s
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
        dets = [d for d in dets if d[0] != "explosion" and _counts(d[2], people)]
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
