"""Scene normality model on synthetic tracks: learn a calm walkway, then score unusual situations."""

from __future__ import annotations

import time

import numpy as np
import pytest

from app.detectors.base import TrackedObject
from app.normality import NormalityModel

T0 = time.time()


def person(x: float, y: float, vx: float = 0.8, vy: float = 0.0, tid: int = 1, h: float = 0.2,
           age: float = 5.0, kp: np.ndarray | None = None, cls: str = "person") -> TrackedObject:
    """A box whose feet are at (x, y), all in frame fractions."""
    w = h * 0.4 * 9 / 16
    return TrackedObject(tid, cls, 0.9, (x - w / 2, y - h, x + w / 2, y), (vx, vy), age, kp)


def upright(obj: TrackedObject) -> np.ndarray:
    """17 COCO keypoints of a standing person inside the object's box."""
    x1, y1, x2, y2 = obj.box
    cx, h = (x1 + x2) / 2, y2 - y1
    rows = [0.05, 0.04, 0.04, 0.05, 0.05, 0.2, 0.2, 0.35, 0.35, 0.5, 0.5, 0.55, 0.55, 0.75, 0.75, 0.95, 0.95]
    side = [0, -0.1, 0.1, -0.15, 0.15, -0.25, 0.25, -0.3, 0.3, -0.3, 0.3, -0.15, 0.15, -0.15, 0.15, -0.15, 0.15]
    return np.array([[cx + s * (x2 - x1), y1 + r * h, 0.9] for r, s in zip(rows, side)], np.float32)


@pytest.fixture(scope="module")
def model() -> NormalityModel:
    """Five minutes of one or two people walking left to right along the bottom of the image."""
    rng = np.random.default_rng(1)
    m = NormalityModel("synthetic")
    for i in range(1500):
        objs = []
        for k in range(1 + i % 2):
            o = person(0.1 + 0.8 * ((i * 0.01 + k * 0.4) % 1), 0.8 + rng.normal(0, 0.03), vx=rng.normal(0.8, 0.1),
                       tid=k)
            o.keypoints = upright(o)
            objs.append(o)
        m.learn(objs, T0 + i * 0.2, 0.2)
    for _ in range(40):
        m.learn_dwell("person", float(rng.uniform(5, 15)))
    m.finalize()
    return m


def top(m: NormalityModel, objs: list[TrackedObject]):
    f = m.score(objs, T0)
    return f[0] if f else None


def test_normal_scene_is_quiet(model: NormalityModel) -> None:
    o = person(0.5, 0.8)
    o.keypoints = upright(o)
    f = top(model, [o])
    assert f is None or f.score < 0.6, f


def test_never_seen_class(model: NormalityModel) -> None:
    f = top(model, [person(0.5, 0.8, cls="car", h=0.15)])
    assert f.reason == "unusual_object" and f.score >= 0.9
    assert f.text == "Car on a camera where cars were never seen"


def test_known_class_in_new_place(model: NormalityModel) -> None:
    f = top(model, [person(0.5, 0.25)])
    assert f.reason == "unusual_object" and f.score >= 0.6
    assert "never seen" in f.text


def test_running_and_wrong_direction(model: NormalityModel) -> None:
    f = top(model, [person(0.5, 0.8, vx=3.5)])
    assert f.reason == "unusual_motion" and f.score >= 0.6 and "faster" in f.text
    f = top(model, [person(0.5, 0.8, vx=-0.8)])
    assert f.reason == "unusual_motion" and f.score >= 0.6 and "left" in f.text


def test_loitering_and_crowding(model: NormalityModel) -> None:
    f = top(model, [person(0.5, 0.8, vx=0.0, age=120)])
    assert f.reason == "loitering" and f.score >= 0.6
    crowd = [person(0.1 + 0.07 * k, 0.8, tid=k) for k in range(12)]
    for o in crowd:
        o.keypoints = upright(o)
    reasons = {f.reason for f in model.score(crowd, T0) if f.score >= 0.6}
    assert "crowding" in reasons


def test_unusual_posture(model: NormalityModel) -> None:
    lying = person(0.5, 0.8, h=0.08)
    lying.box = (0.4, 0.72, 0.6, 0.8)  # wide and low
    kp = upright(person(0.5, 0.8))
    kp[:, 0], kp[:, 1] = 0.4 + (kp[:, 1] - kp[:, 1].min()) / 1.5, 0.76  # rotated onto the ground
    lying.keypoints = kp
    f = next(f for f in model.score([lying], T0) if f.reason == "unusual_posture")
    assert f.score >= 0.6 and "lying" in f.text


def test_save_and_load_give_the_same_scores(model: NormalityModel, tmp_path) -> None:
    model.save(tmp_path)
    again = NormalityModel.load("synthetic", tmp_path)
    assert again is not None and again.frames == model.frames
    objs = [person(0.5, 0.25), person(0.5, 0.8, vx=3.5, tid=2)]
    assert [(f.reason, round(f.score, 4)) for f in again.score(objs, T0)] == \
        [(f.reason, round(f.score, 4)) for f in model.score(objs, T0)]
    assert again.heatmap("person", None)[:2] == b"\xff\xd8"
