"""Draw what the pipeline sees on a frame: tracked boxes with ids, poses, model detections."""

from __future__ import annotations

from typing import Iterable

import cv2
import numpy as np

from .detectors.base import SCENERY, VEHICLES, Box, TrackedObject

# BGR versions of the design tokens.
INK = (246, 238, 231)
UNSUP = (242, 169, 90)  # blue, scene normality
SUP = (74, 176, 242)  # amber, supervised models
ALARM = (107, 107, 255)  # red, live anomaly
MUTED = (178, 157, 140)

SKELETON = [(5, 7), (7, 9), (6, 8), (8, 10), (5, 6), (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14),
            (14, 16), (0, 5), (0, 6)]


def _label(img: np.ndarray, text: str, x: int, y: int, color: tuple[int, int, int]) -> None:
    font, scale, thick = cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1
    (tw, th), base = cv2.getTextSize(text, font, scale, thick)
    y = max(th + 4, y)
    cv2.rectangle(img, (x, y - th - 5), (x + tw + 6, y + base - 2), color, -1)
    cv2.putText(img, text, (x + 3, y - 3), font, scale, (20, 14, 12), thick, cv2.LINE_AA)


def draw(
    image: np.ndarray,
    objects: Iterable[TrackedObject],
    boxes: Iterable[Box] = (),
    highlight: int | None = None,
    caption: str | None = None,
) -> np.ndarray:
    img = image.copy()
    h, w = img.shape[:2]
    for o in objects:
        hot = o.track_id == highlight
        if o.cls in SCENERY and not hot:
            continue
        x1, y1, x2, y2 = int(o.box[0] * w), int(o.box[1] * h), int(o.box[2] * w), int(o.box[3] * h)
        color = ALARM if hot else (INK if o.cls == "person" else UNSUP if o.cls in VEHICLES else MUTED)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2 if hot else 1, cv2.LINE_AA)
        _label(img, f"{o.cls} {o.track_id}", x1, y1, color)
        if o.keypoints is not None:
            kp = o.keypoints
            for a, b in SKELETON:
                if kp[a, 2] >= 0.3 and kp[b, 2] >= 0.3:
                    pa = (int(kp[a, 0] * w), int(kp[a, 1] * h))
                    pb = (int(kp[b, 0] * w), int(kp[b, 1] * h))
                    cv2.line(img, pa, pb, ALARM if hot else UNSUP, 2, cv2.LINE_AA)
    for b in boxes:
        x1, y1, x2, y2 = int(b.box[0] * w), int(b.box[1] * h), int(b.box[2] * w), int(b.box[3] * h)
        cv2.rectangle(img, (x1, y1), (x2, y2), SUP, 2, cv2.LINE_AA)
        _label(img, f"{b.label} {b.conf:.2f}", x1, y2 + 16, SUP)
    if caption:
        cv2.rectangle(img, (0, h - 30), (w, h), (26, 17, 10), -1)
        cv2.putText(img, caption[:110], (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, INK, 1, cv2.LINE_AA)
    return img
