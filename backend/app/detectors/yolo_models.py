"""Detector built on a YOLOv8 object detector (Ultralytics).

fire_explosion: YOLOv8n trained on D-Fire (rabahdev), classes smoke and fire.
    Score = the most confident fire box (smoke counts at 0.85 of its confidence). Flames
    flicker and give off light: a "fire" box whose pixels do not change between frames,
    or with under a quarter of very bright pixels (a red bag, a lamp, an orange jacket),
    counts at half its confidence. On test footage real fire boxes had 32 to 76 % bright
    pixels; a red bag had 19 %.
    An explosion is a sudden large fire or smoke region together with a sudden
    jump in brightness or motion; it lifts the score.
"""

from __future__ import annotations

from collections import deque

import cv2
import numpy as np

from .. import model_files
from .base import Box, Detector, Window

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
