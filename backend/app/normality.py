"""Unsupervised scene normality: what is normal for one camera, learned from normal footage only.

The image is split into a 16 x 9 grid. While learning, every analysis frame adds
what the tracker sees to per-class statistics:

- presence: in how many frames each COCO class appeared in each cell
- motion: speed and direction histograms per class and cell
- counts: how many objects of each class are in view at once
- dwell: how long tracks of each class stay in view
- hour of day: how much footage was learned at each hour
- poses: a bank of normalised person keypoints (pose branch)

Scoring asks how rare the current situation is under those statistics and
always names a reason: unusual_object, unusual_motion, unusual_posture,
loitering or crowding, with a short text. Scores are in [0, 1]; 0.6 is the
default alert threshold.
"""

from __future__ import annotations

import json
import math
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from . import config
from .detectors.base import SCENERY, VEHICLES, TrackedObject

GRID_W, GRID_H = 16, 9
SPEED_EDGES = np.array([0.0, 0.15, 0.4, 0.8, 1.5, 3.0, np.inf])  # box heights per second
N_SPEED = len(SPEED_EDGES) - 1
N_DIR = 8
MOVING = 0.15  # below this an object counts as standing still
MAX_COUNT = 60
POSE_BANK = 4000
POSE_K = 5
MIN_TRACK_AGE = 1.0  # seconds a track must exist before it can raise anything
MIN_CONF = 0.45
DEFAULT_DWELL_LIMIT = 60.0

REASON_LABELS = {
    "unusual_object": "Unusual object",
    "unusual_motion": "Unusual motion",
    "unusual_posture": "Unusual posture",
    "loitering": "Loitering",
    "crowding": "Crowding",
}

PLURALS = {"person": "people", "bus": "buses", "knife": "knives", "skis": "skis", "scissors": "scissors",
           "sheep": "sheep", "wine glass": "wine glasses"}


def plural(cls: str) -> str:
    return PLURALS.get(cls, cls + "s")


def cell_of(obj: TrackedObject) -> tuple[int, int]:
    """Grid cell under the object's foot point (bottom centre), where it touches the ground."""
    x = (obj.box[0] + obj.box[2]) / 2
    y = obj.box[3]
    return min(GRID_H - 1, max(0, int(y * GRID_H))), min(GRID_W - 1, max(0, int(x * GRID_W)))


def _neighbourhood(arr: np.ndarray, gy: int, gx: int) -> np.ndarray:
    """Sum over the 3 x 3 cells around (gy, gx), centre counted fully and neighbours at half weight."""
    y0, y1 = max(0, gy - 1), min(GRID_H, gy + 2)
    x0, x1 = max(0, gx - 1), min(GRID_W, gx + 2)
    block = arr[y0:y1, x0:x1].reshape(-1, *arr.shape[2:]).sum(axis=0)
    return 0.5 * block + 0.5 * arr[gy, gx]


def _rarity(p: float, low: float, high: float) -> float:
    """Map a probability to [0, 1]: p >= 10^-low scores 0, p <= 10^-high scores 1."""
    r = -math.log10(max(p, 1e-12))
    return float(np.clip((r - low) / (high - low), 0.0, 1.0))


def _direction_bin(vx: float, vy: float) -> int:
    return int(((math.atan2(vy, vx) + math.pi) / (2 * math.pi)) * N_DIR) % N_DIR


DIRECTION_WORDS = ["left", "up and left", "up", "up and right", "right", "down and right", "down", "down and left"]


def pose_feature(obj: TrackedObject) -> np.ndarray | None:
    """Keypoints relative to the box centre, scaled by the longer box side, plus visibility and box shape."""
    kp = obj.keypoints
    if kp is None or obj.size < 0.08:  # small people give unreliable keypoints
        return None
    vis = kp[:, 2] >= 0.3
    if vis.sum() < 8:
        return None
    x1, y1, x2, y2 = obj.box
    w, h = (x2 - x1) * 16 / 9, (y2 - y1)  # back to a square pixel scale for 16:9 frames
    side = max(w, h, 1e-6)
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    xy = np.stack([(kp[:, 0] - cx) * 16 / 9 / side, (kp[:, 1] - cy) / side], axis=1)
    xy[~vis] = 0.0
    return np.concatenate([xy.ravel(), vis.astype(np.float32) * 0.25, [w / max(h, 1e-6) * 0.5]]).astype(np.float32)


def describe_pose(obj: TrackedObject) -> str:
    x1, y1, x2, y2 = obj.box
    aspect = (x2 - x1) * 16 / 9 / max(y2 - y1, 1e-6)
    kp = obj.keypoints
    if aspect > 1.3:
        return "lying or bent low"
    if kp is not None:
        nose, wrists = kp[0], kp[[9, 10]]
        if nose[2] > 0.3 and (wrists[:, 2] > 0.3).all() and (wrists[:, 1] < nose[1]).all():
            return "both arms raised"
        hips, ankles = kp[[11, 12]], kp[[15, 16]]
        if (hips[:, 2] > 0.3).all() and (ankles[:, 2] > 0.3).all():
            leg = ankles[:, 1].mean() - hips[:, 1].mean()
            if leg < 0.25 * (y2 - y1):
                return "crouching or sitting"
    return "a posture not seen while learning"


@dataclass
class Finding:
    reason: str
    score: float
    text: str
    track_id: int | None = None


class NormalityModel:
    """Statistics for one camera. Thread safe; learn() and score() may run on different threads."""

    def __init__(self, camera_id: str) -> None:
        self.camera_id = camera_id
        self.lock = threading.Lock()
        self.frames = 0
        self.seconds = 0.0
        self.presence: dict[str, np.ndarray] = {}  # cls -> (H, W) frames present per cell
        self.class_frames: dict[str, int] = {}  # cls -> frames with at least one
        self.speed: dict[str, np.ndarray] = {}  # cls -> (H, W, N_SPEED)
        self.direction: dict[str, np.ndarray] = {}  # cls -> (H, W, N_DIR), moving objects only
        self.counts: dict[str, np.ndarray] = {}  # cls -> (MAX_COUNT + 1,) histogram of objects per frame
        self.hour_counts = np.zeros((24, MAX_COUNT + 1), np.float32)  # people per frame by hour
        self.hours = np.zeros(24, np.float32)  # frames learned per hour
        self.dwell: dict[str, list[float]] = {}
        self.poses = np.zeros((0, 52), np.float32)
        self.pose_seen = 0
        self.pose_scale = 0.0  # 99th percentile of the bank's own kNN distances
        self.updated_at: str | None = None
        self._rng = np.random.default_rng(0)
        self._pose_dirty = False

    # --- learning ------------------------------------------------------------

    def learn(self, objects: list[TrackedObject], ts: float, dt: float) -> None:
        objs = [o for o in objects if o.conf >= MIN_CONF * 0.8]
        hour = time.localtime(ts).tm_hour
        with self.lock:
            self.frames += 1
            self.seconds += dt
            self.hours[hour] += 1
            per_class: dict[str, int] = {}
            seen_cells: dict[str, set[tuple[int, int]]] = {}
            for o in objs:
                per_class[o.cls] = per_class.get(o.cls, 0) + 1
                gy, gx = cell_of(o)
                seen_cells.setdefault(o.cls, set()).add((gy, gx))
                sp = self.speed.setdefault(o.cls, np.zeros((GRID_H, GRID_W, N_SPEED), np.float32))
                sp[gy, gx, np.searchsorted(SPEED_EDGES, o.speed, side="right") - 1] += 1
                if o.speed >= MOVING:
                    d = self.direction.setdefault(o.cls, np.zeros((GRID_H, GRID_W, N_DIR), np.float32))
                    d[gy, gx, _direction_bin(*o.velocity)] += 1
                if o.cls == "person" and o.keypoints is not None:
                    f = pose_feature(o)
                    if f is not None:
                        self._add_pose(f)
            for cls, cells in seen_cells.items():
                pres = self.presence.setdefault(cls, np.zeros((GRID_H, GRID_W), np.float32))
                for gy, gx in cells:
                    pres[gy, gx] += 1
                self.class_frames[cls] = self.class_frames.get(cls, 0) + 1
            for cls in set(per_class) | set(self.counts) | {"person"}:
                hist = self.counts.setdefault(cls, np.zeros(MAX_COUNT + 1, np.float32))
                hist[min(per_class.get(cls, 0), MAX_COUNT)] += 1
            self.hour_counts[hour, min(per_class.get("person", 0), MAX_COUNT)] += 1

    def learn_dwell(self, cls: str, seconds: float) -> None:
        with self.lock:
            lst = self.dwell.setdefault(cls, [])
            lst.append(float(seconds))
            if len(lst) > 2000:
                del lst[: len(lst) - 2000]

    def _add_pose(self, f: np.ndarray) -> None:
        # Reservoir sampling keeps a uniform sample of every pose seen.
        self.pose_seen += 1
        if len(self.poses) < POSE_BANK:
            self.poses = np.vstack([self.poses, f[None]])
        else:
            j = self._rng.integers(0, self.pose_seen)
            if j < POSE_BANK:
                self.poses[j] = f
        self._pose_dirty = True

    def finalize(self) -> None:
        """Recompute calibration after learning (pose distance scale)."""
        with self.lock:
            if len(self.poses) > POSE_K + 1:
                idx = self._rng.choice(len(self.poses), size=min(500, len(self.poses)), replace=False)
                d = self._knn(self.poses[idx], exclude=idx)
                self.pose_scale = float(np.percentile(d, 99))
            self._pose_dirty = False
            self.updated_at = time.strftime("%Y-%m-%dT%H:%M:%S")

    def _knn(self, q: np.ndarray, exclude: np.ndarray | None = None) -> np.ndarray:
        """Mean distance to the K nearest poses in the bank; `exclude` = bank rows of the queries themselves."""
        d2 = ((q[:, None, :] - self.poses[None, :, :]) ** 2).sum(-1)
        if exclude is not None:
            d2[np.arange(len(q)), exclude] = np.inf
        k = min(POSE_K, self.poses.shape[0] - 1)
        part = np.partition(d2, k - 1, axis=1)[:, :k]
        return np.sqrt(part).mean(axis=1)

    # --- scoring -------------------------------------------------------------

    def score(self, objects: list[TrackedObject], ts: float) -> list[Finding]:
        """Every finding above zero, highest first."""
        if self.frames < 50:
            return []
        findings: list[Finding] = []
        with self.lock:
            people = [o for o in objects if o.cls == "person"]
            for o in objects:
                if o.age_s < MIN_TRACK_AGE or o.conf < MIN_CONF:
                    continue
                for f in (self._object(o), self._motion(o), self._dwell(o)):
                    if f and f.score > 0:
                        findings.append(f)
                if o.cls == "person" and o.keypoints is not None:
                    f = self._posture(o)
                    if f and f.score > 0:
                        findings.append(f)
            f = self._crowding(len(people), ts)
            if f and f.score > 0:
                findings.append(f)
        findings.sort(key=lambda f: f.score, reverse=True)
        return findings

    def _object(self, o: TrackedObject) -> Finding | None:
        if o.cls in SCENERY:
            return None
        name = o.cls.capitalize()
        if self.class_frames.get(o.cls, 0) == 0:
            return Finding("unusual_object", 0.95, f"{name} on a camera where {plural(o.cls)} were never seen", o.track_id)
        gy, gx = cell_of(o)
        c = float(_neighbourhood(self.presence[o.cls], gy, gx))
        p = (c + 0.5) / (self.frames + 1)
        rmax = math.log10(2 * (self.frames + 1))
        s = 0.9 * _rarity(p, 1.5, rmax)
        if s <= 0:
            return None
        how = "never" if c < 0.5 else "rarely"
        return Finding("unusual_object", s, f"{name} in a part of the image where {plural(o.cls)} were {how} seen",
                       o.track_id)

    def _motion(self, o: TrackedObject) -> Finding | None:
        sp = self.speed.get(o.cls)
        if sp is None:
            return None
        gy, gx = cell_of(o)
        hist = _neighbourhood(sp, gy, gx)
        if hist.sum() < 30:
            hist = sp.sum(axis=(0, 1))
        if hist.sum() < 30:
            return None
        b = int(np.searchsorted(SPEED_EDGES, o.speed, side="right") - 1)
        p_speed = (hist[b] + 0.5) / (hist.sum() + 0.5 * N_SPEED)
        # Only unusually fast counts here; unusually slow is covered by loitering.
        s_speed = _rarity(p_speed, 1.3, 3.0) if b > int(np.argmax(hist)) else 0.0

        s_dir, p_dir = 0.0, 1.0
        dh = self.direction.get(o.cls)
        if dh is not None and o.speed >= 2 * MOVING:
            hd = _neighbourhood(dh, gy, gx)
            if hd.sum() >= 30:
                p_dir = (hd[_direction_bin(*o.velocity)] + 0.5) / (hd.sum() + 0.5 * N_DIR)
                s_dir = _rarity(p_dir, 1.3, 3.0)
        s = 0.95 * max(s_speed, s_dir)
        if s <= 0:
            return None
        name = o.cls.capitalize()
        if s_speed >= s_dir:
            typical = SPEED_EDGES[int(np.argmax(hist)) + 1]
            text = f"{name} moving much faster than usual here ({o.speed:.1f} body heights per second, usually under {typical:.1f})"
        else:
            text = f"{name} moving {DIRECTION_WORDS[_direction_bin(*o.velocity)]}, a direction rarely seen here"
        return Finding("unusual_motion", s, text, o.track_id)

    def _dwell(self, o: TrackedObject) -> Finding | None:
        if o.cls != "person" and o.cls not in VEHICLES:
            return None
        gy, gx = cell_of(o)
        pres = self.presence.get(o.cls)
        if pres is not None and pres[gy, gx] / self.frames >= 0.3:
            return None  # something that is always here, like a parked car
        times = self.dwell.get(o.cls, [])
        limit = max(30.0, 2 * float(np.percentile(times, 99))) if len(times) >= 20 else DEFAULT_DWELL_LIMIT
        if o.age_s < limit:
            return None
        s = float(np.clip(0.6 + 0.5 * (o.age_s / limit - 1), 0.0, 1.0))
        usual = f"usually under {_fmt_s(limit / 2)}" if len(times) >= 20 else f"the limit is {_fmt_s(limit)}"
        verb = "has stayed" if o.cls == "person" else "has been here"
        return Finding("loitering", s, f"{o.cls.capitalize()} {verb} for {_fmt_s(o.age_s)}, {usual}", o.track_id)

    def _crowding(self, n: int, ts: float) -> Finding | None:
        hist = self.counts.get("person")
        if hist is None or hist.sum() == 0 or n < 3:
            return None
        hour = time.localtime(ts).tm_hour
        # Per-hour statistics only once footage from at least six different hours was learned.
        if (self.hours >= 300).sum() >= 6 and self.hours[hour] >= 300:
            hist = self.hour_counts[hour]
        cdf = np.cumsum(hist) / hist.sum()
        p99 = int(np.searchsorted(cdf, 0.99))
        limit = max(p99 + 2, math.ceil(p99 * 1.5))
        if n < limit:
            return None
        s = float(np.clip(0.6 + 0.4 * (n - limit) / max(limit, 3), 0.0, 1.0))
        return Finding("crowding", s, f"{n} people in view, usually at most {p99}")

    def _posture(self, o: TrackedObject) -> Finding | None:
        if self.pose_scale <= 0 or len(self.poses) <= POSE_K:
            return None
        f = pose_feature(o)
        if f is None:
            return None
        d = float(self._knn(f[None])[0])
        s = float(np.clip(0.5 * d / max(self.pose_scale, 0.05), 0.0, 1.0))
        if s < 0.5:
            return None
        return Finding("unusual_posture", s, f"Person {describe_pose(o)}, unlike the poses learned for this camera", o.track_id)

    # --- persistence and summaries ------------------------------------------

    def save(self, folder: Path = config.NORMALITY_DIR) -> None:
        folder.mkdir(parents=True, exist_ok=True)
        with self.lock:
            arrays: dict[str, np.ndarray] = {"poses": self.poses, "hours": self.hours, "hour_counts": self.hour_counts}
            for name, d in (("presence", self.presence), ("speed", self.speed), ("direction", self.direction),
                            ("counts", self.counts)):
                for cls, arr in d.items():
                    arrays[f"{name}|{cls}"] = arr
            meta = {"camera_id": self.camera_id, "frames": self.frames, "seconds": self.seconds,
                    "class_frames": self.class_frames, "dwell": self.dwell, "pose_seen": self.pose_seen,
                    "pose_scale": self.pose_scale, "updated_at": self.updated_at, "grid": [GRID_W, GRID_H]}
        tmp = folder / f"{self.camera_id}.tmp.npz"
        np.savez_compressed(tmp, **arrays)
        tmp.replace(folder / f"{self.camera_id}.npz")
        (folder / f"{self.camera_id}.json").write_text(json.dumps(meta), encoding="utf-8")

    @classmethod
    def load(cls, camera_id: str, folder: Path = config.NORMALITY_DIR) -> NormalityModel | None:
        npz, js = folder / f"{camera_id}.npz", folder / f"{camera_id}.json"
        if not npz.is_file() or not js.is_file():
            return None
        m = cls(camera_id)
        meta = json.loads(js.read_text(encoding="utf-8"))
        with np.load(npz) as data:
            m.poses = data["poses"].astype(np.float32)
            m.hours = data["hours"]
            m.hour_counts = data["hour_counts"]
            for key in data.files:
                if "|" in key:
                    name, c = key.split("|", 1)
                    getattr(m, name)[c] = data[key]
        m.frames, m.seconds = meta["frames"], meta["seconds"]
        m.class_frames, m.dwell = meta["class_frames"], meta["dwell"]
        m.pose_seen, m.pose_scale, m.updated_at = meta["pose_seen"], meta["pose_scale"], meta["updated_at"]
        return m

    @staticmethod
    def delete(camera_id: str, folder: Path = config.NORMALITY_DIR) -> None:
        for ext in ("npz", "json"):
            (folder / f"{camera_id}.{ext}").unlink(missing_ok=True)

    def summary(self) -> dict[str, Any]:
        with self.lock:
            classes = sorted(self.class_frames.items(), key=lambda kv: kv[1], reverse=True)
            person = self.counts.get("person")
            p99 = None
            if person is not None and person.sum():
                p99 = int(np.searchsorted(np.cumsum(person) / person.sum(), 0.99))
            return {
                "frames": self.frames,
                "seconds": round(self.seconds, 1),
                "updated_at": self.updated_at,
                "grid": [GRID_W, GRID_H],
                "classes": [{"cls": c, "frames": n, "share": round(n / max(self.frames, 1), 4)} for c, n in classes],
                "people_p99": p99,
                "poses": int(len(self.poses)),
                "hours": [int(h) for h in np.flatnonzero(self.hours)],
            }

    def heatmap(self, cls: str | None, background: np.ndarray | None, width: int = 960) -> bytes:
        """JPEG: where `cls` (or any class) normally appears, over a frame of the camera."""
        with self.lock:
            if cls:
                grid = self.presence.get(cls, np.zeros((GRID_H, GRID_W), np.float32)).copy()
            else:
                grid = sum(self.presence.values(), np.zeros((GRID_H, GRID_W), np.float32))
        h = int(width * 9 / 16)
        if background is None:
            img = np.full((h, width, 3), 16, np.uint8)
        else:
            img = cv2.resize(background, (width, h))
        img = (img * 0.45).astype(np.uint8)
        if grid.max() > 0:
            norm = np.sqrt(grid / grid.max())  # square root keeps rare cells visible
            up = cv2.resize(norm, (width, h), interpolation=cv2.INTER_NEAREST)
            colored = cv2.applyColorMap((up * 255).astype(np.uint8), cv2.COLORMAP_TURBO)
            mask = (up > 0)[..., None]
            img = np.where(mask, cv2.addWeighted(img, 0.35, colored, 0.65, 0), img)
        for i in range(1, GRID_W):
            x = int(i * width / GRID_W)
            cv2.line(img, (x, 0), (x, h), (50, 60, 75), 1)
        for j in range(1, GRID_H):
            y = int(j * h / GRID_H)
            cv2.line(img, (0, y), (width, y), (50, 60, 75), 1)
        ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return jpg.tobytes()


def _fmt_s(s: float) -> str:
    s = int(round(s))
    return f"{s // 60} min {s % 60} s" if s >= 60 else f"{s} s"
