"""Draw what the pipeline sees on a frame: thin white boxes for tracked objects and model
detections, and a red box with a red label on whatever caused an active alarm."""

from __future__ import annotations

from typing import Iterable

import cv2
import numpy as np

from .detectors.base import SCENERY, Box, TrackedObject

# BGR versions of the design tokens.
WHITE = (245, 238, 232)
DIM = (170, 160, 150)  # pose lines, track ids
ALARM = (95, 90, 255)  # #FF5A5F, only for what raised an alarm
LABEL_TEXT = (255, 255, 255)

SKELETON = [(5, 7), (7, 9), (6, 8), (8, 10), (5, 6), (5, 11), (6, 12), (11, 12), (11, 13), (13, 15), (12, 14),
            (14, 16), (0, 5), (0, 6)]


def _alarm_label(img: np.ndarray, text: str, x: int, y: int) -> None:
    """Small solid red label ending at height y."""
    font, scale, thick = cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1
    (tw, th), _ = cv2.getTextSize(text, font, scale, thick)
    y = max(th + 6, y)
    cv2.rectangle(img, (x, y - th - 6), (x + tw + 8, y), ALARM, -1)
    cv2.putText(img, text, (x + 4, y - 4), font, scale, LABEL_TEXT, thick, cv2.LINE_AA)


REASON_SHORT = {
    "unusual_object": "Unusual object", "unusual_motion": "Unusual motion", "unusual_posture": "Unusual posture",
    "loitering": "Loitering", "crowding": "Crowding",
}


def alarm_marks(active_keys: Iterable[str], st) -> dict:
    """Keyword arguments for draw(): which object caused an active alarm, and its label.
    Fire is marked on its own boxes; fight and crash classify the whole clip, so they have no box."""
    keys = set(active_keys)
    f = st.unsup_finding
    if "fire_explosion" in keys and st.boxes:
        score = max((v for k, v in st.sup_scores.items() if k.endswith(":fire_explosion")), default=0.0)
        return {"alarm_boxes": True, "alarm_label": f"Fire {score:.2f}"}
    if "unsupervised" in keys and f is not None and f.track_id is not None:
        return {"highlight": f.track_id, "alarm_label": f"{REASON_SHORT.get(f.reason, f.reason)} {st.unsup_score:.2f}"}
    return {}


def _box(img: np.ndarray, box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    h, w = img.shape[:2]
    return int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)


def draw(
    image: np.ndarray,
    objects: Iterable[TrackedObject],
    boxes: Iterable[Box] = (),
    highlight: int | None = None,
    caption: str | None = None,
    alarm_label: str | None = None,
    alarm_boxes: bool = False,
) -> np.ndarray:
    """`highlight` is the track that caused an alarm (labelled with `alarm_label`);
    `alarm_boxes` marks the model detections themselves as the cause (fire, smoke)."""
    img = image.copy()
    h, w = img.shape[:2]
    for o in objects:
        hot = o.track_id == highlight
        if o.cls in SCENERY and not hot:
            continue
        x1, y1, x2, y2 = _box(img, o.box)
        if o.keypoints is not None:
            kp = o.keypoints
            for a, b in SKELETON:
                if kp[a, 2] >= 0.3 and kp[b, 2] >= 0.3:
                    pa = (int(kp[a, 0] * w), int(kp[a, 1] * h))
                    pb = (int(kp[b, 0] * w), int(kp[b, 1] * h))
                    cv2.line(img, pa, pb, ALARM if hot else DIM, 1, cv2.LINE_AA)
        if hot:
            cv2.rectangle(img, (x1, y1), (x2, y2), ALARM, 2, cv2.LINE_AA)
            _alarm_label(img, alarm_label or o.cls, x1, y1 - 2)
        else:
            cv2.rectangle(img, (x1, y1), (x2, y2), WHITE, 1, cv2.LINE_AA)
            cv2.putText(img, str(o.track_id), (x1 + 2, y1 + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.38, DIM, 1, cv2.LINE_AA)
    for b in boxes:
        x1, y1, x2, y2 = _box(img, b.box)
        if alarm_boxes:
            cv2.rectangle(img, (x1, y1), (x2, y2), ALARM, 2, cv2.LINE_AA)
            _alarm_label(img, alarm_label or f"{b.label} {b.conf:.2f}", x1, y1 - 2)
        else:
            cv2.rectangle(img, (x1, y1), (x2, y2), WHITE, 1, cv2.LINE_AA)
    if caption:
        cv2.rectangle(img, (0, h - 28), (w, h), (32, 21, 13), -1)
        cv2.putText(img, caption[:110], (10, h - 9), cv2.FONT_HERSHEY_SIMPLEX, 0.5, WHITE, 1, cv2.LINE_AA)
    return img
