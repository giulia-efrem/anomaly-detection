"""Live analysis: one GPU thread that serves every camera.

About five times a second it takes the newest frame of each live camera and runs,
batched across cameras:

1. YOLO11s object detection, then ByteTrack per camera (track ids, speed, age)
2. YOLO11n pose for cameras with people in view (every other frame)
3. the supervised plugins, each only when it makes sense:
   fight when two or more people are close, crash when vehicles are present,
   threat detector when a person is present, fire once per second;
   clip models see a sliding window of the last 16 analysis frames
4. the camera's scene normality model, which learns or scores

The clip models (16-frame 3D CNNs, about 50 ms per camera on the laptop GPU) run
in a second thread, ClipWorker, so they never slow down detection and tracking.

The scores go to alerts.AlertEngine, which raises incidents, and to the
WebSocket ("camera.live", about once a second per camera).
"""

from __future__ import annotations

import logging
import threading
import time
from collections import Counter, deque
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import cv2
import numpy as np

from . import config, db, model_files
from .cameras import CameraManager
from .detectors import PLUGINS, SUPERVISED_CLASSES, Box, Detector, TrackedObject, Window
from .events import bus
from .normality import NormalityModel

log = logging.getLogger("veghe.pipeline")

ANALYSIS_FPS = 5.0
SMALL_WIDTH = 320  # frames kept for the clip models
DET_CONF = 0.25
POSE_EVERY = 2  # pose on every second analysis frame
POSE_MIN_HEIGHT = 0.08  # people smaller than this (fraction of frame height) get no keypoints
TRACK_FORGET_S = 3.0
LIVE_EVENT_S = 1.0

TRACKER_ARGS = SimpleNamespace(
    track_high_thresh=0.3, track_low_thresh=0.1, new_track_thresh=0.4,
    track_buffer=int(ANALYSIS_FPS * 3), match_thresh=0.8, fuse_score=True,
)


def gpu_device() -> str:
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


@dataclass
class TrackInfo:
    first_seen: float
    last_seen: float
    votes: Counter = field(default_factory=Counter)
    path: deque = field(default_factory=lambda: deque(maxlen=8))  # (t, foot x, foot y, height)


@dataclass
class CameraState:
    camera_id: str
    tracker: Any
    normality: NormalityModel
    frames: deque = field(default_factory=lambda: deque(maxlen=16))
    stamps: deque = field(default_factory=lambda: deque(maxlen=16))
    tracks: dict[int, TrackInfo] = field(default_factory=dict)
    last_seq: int = -1
    last_ts: float = 0.0
    det_state: dict[str, dict] = field(default_factory=dict)
    det_last_run: dict[str, float] = field(default_factory=dict)
    sup_scores: dict[str, float] = field(default_factory=dict)  # class -> probability, latest
    sup_stamp: dict[str, float] = field(default_factory=dict)
    sup_notes: dict[str, str] = field(default_factory=dict)
    unsup_score: float = 0.0
    unsup_finding: Any = None
    objects: list[TrackedObject] = field(default_factory=list)
    boxes: list[Box] = field(default_factory=list)
    image: np.ndarray | None = None
    image_ts: float = 0.0
    last_event: float = 0.0
    last_saved: float = field(default_factory=time.monotonic)
    ticks: int = 0
    clip_pending: dict[str, Window] = field(default_factory=dict)  # plugin id -> window waiting for ClipWorker

    @property
    def people_count(self) -> int:
        return sum(1 for o in self.objects if o.cls == "person")


def _letterbox_iou(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """IoU matrix between two sets of xyxy boxes."""
    if len(a) == 0 or len(b) == 0:
        return np.zeros((len(a), len(b)))
    x1 = np.maximum(a[:, None, 0], b[None, :, 0])
    y1 = np.maximum(a[:, None, 1], b[None, :, 1])
    x2 = np.minimum(a[:, None, 2], b[None, :, 2])
    y2 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area_a = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    area_b = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    return inter / (area_a[:, None] + area_b[None, :] - inter + 1e-9)


class Models:
    """The GPU models. Loaded once by the pipeline thread; also used by offline learning."""

    def __init__(self) -> None:
        self.device = "cpu"
        self.detector = None
        self.pose = None
        self.plugins: list[Detector] = []
        self.status: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()  # one GPU user at a time
        self.ready = threading.Event()

    def load(self) -> None:
        import torch
        from ultralytics import YOLO

        self.device = gpu_device()
        half = self.device == "cuda"

        def track_vram(model_id: str, fn) -> Any:
            before = torch.cuda.memory_allocated() if half else 0
            t0 = time.perf_counter()
            try:
                if not model_files.is_present(model_id):
                    raise FileNotFoundError("Weights missing: run scripts\\download_models.py")
                obj = fn()
                self.status[model_id] = {"loaded": True, "error": None}
            except Exception as exc:  # one broken model must not stop the others
                log.exception("could not load %s", model_id)
                self.status[model_id] = {"loaded": False, "error": str(exc)}
                return None
            vram = (torch.cuda.memory_allocated() - before) / 2**20 if half else 0.0
            self.status[model_id].update(device=self.device, vram_mb=round(vram, 1),
                                         load_s=round(time.perf_counter() - t0, 1))
            return obj

        def load_yolo(model_id: str):
            m = YOLO(str(model_files.path(model_id)))
            m.predict(np.zeros((540, 960, 3), np.uint8), imgsz=640, device=self.device, quantize=16 if half else None, verbose=False)
            return m

        self.detector = track_vram("yolo11s", lambda: load_yolo("yolo11s"))
        self.pose = track_vram("yolo11n-pose", lambda: load_yolo("yolo11n-pose"))
        for cls in PLUGINS:
            plugin = cls(self.device)

            def warm(p=plugin) -> Detector:
                p.warmup()
                return p

            if track_vram(plugin.id, warm) is not None:
                self.plugins.append(plugin)
            else:
                plugin.error = self.status[plugin.id]["error"]
        self.ready.set()
        log.info("models ready on %s: %s", self.device, ", ".join(p.id for p in self.plugins))


models = Models()


def detect(images: list[np.ndarray]) -> list[Any]:
    """COCO detection for a batch of frames (caller holds models.lock)."""
    return models.detector.predict(images, imgsz=640, conf=DET_CONF, device=models.device,
                                   quantize=16 if models.device == "cuda" else None, verbose=False)


def update_tracks(state: CameraState, result: Any, ts: float, image: np.ndarray, learning: bool) -> list[TrackedObject]:
    """ByteTrack step plus speed, age and majority class per track."""
    boxes = result.boxes.cpu().numpy()
    out = state.tracker.update(boxes, image) if len(boxes) else state.tracker.update(boxes[:0], image)
    names = result.names
    h, w = image.shape[:2]
    objects = []
    for x1, y1, x2, y2, tid, score, cls, _idx in out:
        tid = int(tid)
        info = state.tracks.get(tid)
        if info is None:
            info = state.tracks[tid] = TrackInfo(first_seen=ts, last_seen=ts)
        info.last_seen = ts
        info.votes[names[int(cls)]] += 1
        box = (float(x1 / w), float(y1 / h), float(x2 / w), float(y2 / h))
        height = max(box[3] - box[1], 1e-3)
        info.path.append((ts, (box[0] + box[2]) / 2, box[3], height))
        vx = vy = 0.0
        t0, fx0, fy0, h0 = info.path[0]
        if ts - t0 >= 0.4:
            hm = (h0 + height) / 2
            # x is scaled to y units (16:9 frame) so speed is in body heights per second either way.
            vx = ((box[0] + box[2]) / 2 - fx0) * (w / h) / hm / (ts - t0)
            vy = (box[3] - fy0) / hm / (ts - t0)
        objects.append(TrackedObject(tid, info.votes.most_common(1)[0][0], float(score), box,
                                     (vx, vy), ts - info.first_seen))
    for tid in [t for t, i in state.tracks.items() if ts - i.last_seen > TRACK_FORGET_S]:
        info = state.tracks.pop(tid)
        if learning:
            state.normality.learn_dwell(info.votes.most_common(1)[0][0], info.last_seen - info.first_seen)
    return objects


def attach_poses(objects_per_image: list[list[TrackedObject]], images: list[np.ndarray],
                 wanted: list[bool] | None = None) -> None:
    """Run the pose model and give each tracked person the keypoints of the best matching pose box."""
    todo = [i for i, objs in enumerate(objects_per_image)
            if (wanted is None or wanted[i]) and any(o.cls == "person" and o.height >= POSE_MIN_HEIGHT for o in objs)]
    if not todo or models.pose is None:
        return
    results = models.pose.predict([images[i] for i in todo], imgsz=640, conf=0.3, device=models.device,
                                  quantize=16 if models.device == "cuda" else None, verbose=False)
    for i, r in zip(todo, results):
        if r.keypoints is None or len(r.boxes) == 0:
            continue
        pboxes = r.boxes.xyxyn.cpu().numpy()
        kps = r.keypoints.data.cpu().numpy()  # (n, 17, 3) pixels
        hh, ww = images[i].shape[:2]
        kps[..., 0] /= ww
        kps[..., 1] /= hh
        people = [o for o in objects_per_image[i] if o.cls == "person"]
        if not people:
            continue
        iou = _letterbox_iou(np.array([p.box for p in people]), pboxes)
        for pi, person in enumerate(people):
            j = int(iou[pi].argmax())
            if iou[pi, j] >= 0.5:
                person.keypoints = kps[j]


def small(image: np.ndarray) -> np.ndarray:
    h, w = image.shape[:2]
    return cv2.resize(image, (SMALL_WIDTH, int(round(h * SMALL_WIDTH / w))), interpolation=cv2.INTER_AREA)


class Pipeline(threading.Thread):
    def __init__(self, cameras: CameraManager) -> None:
        super().__init__(name="pipeline", daemon=True)
        self.cameras = cameras
        self.states: dict[str, CameraState] = {}
        self._stop_evt = threading.Event()
        self._states_lock = threading.Lock()
        self.loop_ms = 0.0
        self.analysed_fps: dict[str, float] = {}
        self.alerts = None  # set in run() to avoid an import cycle
        self.error: str | None = None
        self.clip_worker = ClipWorker(self)

    def stop(self) -> None:
        self._stop_evt.set()
        self.clip_worker.stop()

    # --- camera bookkeeping --------------------------------------------------

    def state(self, camera_id: str) -> CameraState | None:
        with self._states_lock:
            return self.states.get(camera_id)

    def forget(self, camera_id: str, delete_model: bool = False) -> None:
        with self._states_lock:
            st = self.states.pop(camera_id, None)
        if st and not delete_model and st.normality.frames:
            st.normality.save()
        if delete_model:
            NormalityModel.delete(camera_id)

    def reset_normality(self, camera_id: str) -> None:
        """Forget what the camera learned and start learning again."""
        with self._states_lock:
            st = self.states.get(camera_id)
            if st:
                st.normality = NormalityModel(camera_id)
        NormalityModel.delete(camera_id)
        db.update_camera(camera_id, {"unsupervised": "learning", "learning_progress": 0.0})
        bus.publish({"type": "cameras.changed"})

    def _ensure_state(self, camera_id: str) -> CameraState:
        with self._states_lock:
            st = self.states.get(camera_id)
            if st is None:
                from ultralytics.trackers.byte_tracker import BYTETracker

                model = NormalityModel.load(camera_id) or NormalityModel(camera_id)
                st = self.states[camera_id] = CameraState(camera_id, BYTETracker(TRACKER_ARGS), model)
            return st

    # --- main loop -----------------------------------------------------------

    def run(self) -> None:
        from .alerts import AlertEngine

        self.alerts = AlertEngine(self)
        try:
            models.load()
        except Exception as exc:
            log.exception("model loading failed")
            self.error = str(exc)
            return
        if models.detector is None:
            self.error = "Object detector missing: run scripts\\download_models.py"
            log.error(self.error)
            return
        self.clip_worker.start()
        period = 1.0 / ANALYSIS_FPS
        while not self._stop_evt.is_set():
            t0 = time.monotonic()
            try:
                self._tick()
            except Exception:
                log.exception("pipeline tick failed")
                time.sleep(0.5)
            spent = time.monotonic() - t0
            self.loop_ms = 0.9 * self.loop_ms + 0.1 * spent * 1000
            self._stop_evt.wait(max(0.0, period - spent))
        for st in list(self.states.values()):
            if st.normality.frames:
                st.normality.save()

    def _tick(self) -> None:
        cams = {c["id"]: c for c in db.list_cameras()}
        for cid in [c for c in list(self.states) if c not in cams]:
            self.forget(cid)
        batch: list[tuple[dict, CameraState, Any]] = []
        for cid, cam in cams.items():
            buf = self.cameras.buffer(cid)
            frame = buf.latest() if buf else None
            if frame is None:
                continue
            st = self._ensure_state(cid)
            if frame.seq == st.last_seq:
                continue
            batch.append((cam, st, frame))
        if not batch:
            return

        images = [f.image for _, _, f in batch]
        with models.lock:
            results = detect(images)
            objects_per_image = []
            for (cam, st, frame), res in zip(batch, results):
                learning = cam["unsupervised"] == "learning"
                objects_per_image.append(update_tracks(st, res, frame.timestamp, frame.image, learning))
            # Pose only where scene normality uses it, and on every other frame.
            wanted = [cam["unsupervised"] != "off" and st.ticks % POSE_EVERY == 0 for cam, st, _ in batch]
            attach_poses(objects_per_image, images, wanted)
            windows = []
            for (cam, st, frame), objs in zip(batch, objects_per_image):
                dt = min(frame.timestamp - st.last_ts, 0.5) if st.last_ts else 1.0 / ANALYSIS_FPS
                if st.last_ts:
                    self.analysed_fps[st.camera_id] = 0.8 * self.analysed_fps.get(st.camera_id, ANALYSIS_FPS) + \
                        0.2 / max(frame.timestamp - st.last_ts, 1e-3)
                st.last_seq, st.last_ts = frame.seq, frame.timestamp
                st.ticks += 1
                st.frames.append(small(frame.image))
                st.stamps.append(frame.timestamp)
                st.objects, st.image, st.image_ts = objs, frame.image, frame.timestamp
                st.det_state.setdefault("_dt", {})["dt"] = dt
                windows.append(Window(st.camera_id, list(st.frames), list(st.stamps), frame.image, objs))
            self._run_plugins(batch, windows)

        for (cam, st, frame), objs in zip(batch, objects_per_image):
            self._normality(cam, st, objs, frame.timestamp, st.det_state["_dt"]["dt"])
            self.alerts.update(cam, st, frame)
            self._publish(cam, st)

    def _run_plugins(self, batch: list[tuple[dict, CameraState, Any]], windows: list[Window]) -> None:
        for plugin in models.plugins:
            todo = []
            for (cam, st, frame), w in zip(batch, windows):
                if cam["supervised"] != "on":
                    continue
                w.state = st.det_state.setdefault(plugin.id, {})
                due = frame.timestamp - st.det_last_run.get(plugin.id, 0.0) >= plugin.every_s - 0.05
                if not due:
                    continue
                if plugin.wants(w):
                    if plugin.window_size > 1:
                        st.clip_pending[plugin.id] = w  # heavy clip model: ClipWorker picks it up
                        st.det_last_run[plugin.id] = w.timestamps[-1]
                    else:
                        todo.append((st, w))
                else:
                    for c in plugin.classes:
                        st.sup_scores.pop(f"{plugin.id}:{c}", None)
                    plugin.last_boxes.pop(st.camera_id, None)
            if not todo:
                continue
            try:
                scores = plugin.score_batch([w for _, w in todo])
            except Exception:
                log.exception("%s failed", plugin.id)
                continue
            for (st, w), s in zip(todo, scores):
                st.det_last_run[plugin.id] = w.timestamps[-1]
                store_scores(plugin, st, w, s)
        for (_, st, frame) in batch:
            # Forget scores that were not refreshed (the gate closed or the camera stalled).
            for key in [k for k, t in list(st.sup_stamp.items()) if frame.timestamp - t > SCORE_TTL_S]:
                st.sup_scores.pop(key, None)
                st.sup_stamp.pop(key, None)
            st.boxes = [b for p in models.plugins for b in p.last_boxes.get(st.camera_id, [])]

    @staticmethod
    def class_scores(st: CameraState) -> dict[str, float]:
        """Highest probability per supervised class over all plugins."""
        out = {c: 0.0 for c in SUPERVISED_CLASSES}
        for key, v in st.sup_scores.items():
            c = key.split(":", 1)[1]
            out[c] = max(out.get(c, 0.0), v)
        return out

    @staticmethod
    def class_note(st: CameraState, cls: str) -> str | None:
        best, note = -1.0, None
        for key, v in st.sup_scores.items():
            if key.endswith(":" + cls) and v > best and key in st.sup_notes:
                best, note = v, st.sup_notes[key]
        return note

    def _normality(self, cam: dict, st: CameraState, objs: list[TrackedObject], ts: float, dt: float) -> None:
        mode = cam["unsupervised"]
        model = st.normality
        if mode == "off":
            st.unsup_score, st.unsup_finding = 0.0, None
            return
        if mode in ("learning", "collecting"):
            thresholds = self.alerts.thresholds(cam)
            # Never learn frames a supervised model flags: a fight must not become "normal".
            if any(v >= thresholds.get(c, 1.0) for c, v in self.class_scores(st).items()):
                return
            model.learn(objs, ts, dt)
            target = float(cam.get("learn_seconds") or config.LEARN_SECONDS)
            progress = min(1.0, model.seconds / target)
            if progress >= 1.0:
                model.finalize()
                model.save()
                db.update_camera(st.camera_id, {"unsupervised": "ready", "learning_progress": 1.0})
                bus.publish({"type": "cameras.changed"})
                log.info("camera %s finished learning (%.0f s)", st.camera_id, model.seconds)
            elif time.monotonic() - st.last_saved > 15:
                st.last_saved = time.monotonic()
                db.update_camera(st.camera_id, {"unsupervised": "learning", "learning_progress": round(progress, 3)})
                if model.frames % 10 == 0:
                    model.save()
            st.unsup_score, st.unsup_finding = 0.0, None
            return
        findings = model.score(objs, ts)
        st.unsup_finding = findings[0] if findings else None
        st.unsup_score = findings[0].score if findings else 0.0

    def _publish(self, cam: dict, st: CameraState) -> None:
        now = time.monotonic()
        if now - st.last_event < LIVE_EVENT_S:
            return
        st.last_event = now
        learn_target = float(cam.get("learn_seconds") or config.LEARN_SECONDS)
        f = st.unsup_finding
        bus.publish({
            "type": "camera.live",
            "camera_id": st.camera_id,
            "people_count": st.people_count,
            "scores": {k: round(v, 3) for k, v in self.class_scores(st).items()},
            "unsupervised": {"score": round(st.unsup_score, 3), "reason": f.reason if f else None,
                             "text": f.text if f else None},
            "learning_progress": round(min(1.0, st.normality.seconds / learn_target), 3)
            if cam["unsupervised"] == "learning" else None,
            "alerts": self.alerts.live(st.camera_id),
            "fps": round(self.analysed_fps.get(st.camera_id, 0.0), 1),
        })

    # --- status --------------------------------------------------------------

    def summary(self) -> dict[str, Any]:
        live = {cid: round(fps, 1) for cid, fps in self.analysed_fps.items() if cid in self.states}
        return {"ready": models.ready.is_set(), "error": self.error, "device": models.device,
                "loop_ms": round(self.loop_ms, 1), "clip_ms": round(self.clip_worker.busy_ms, 1), "fps": live,
                "plugins": [p.id for p in models.plugins]}


SCORE_TTL_S = 4.0  # a score not refreshed for this long is dropped


def store_scores(plugin: Detector, st: CameraState, w: Window, scores: dict[str, float]) -> None:
    for c, v in scores.items():
        st.sup_scores[f"{plugin.id}:{c}"] = v
        st.sup_stamp[f"{plugin.id}:{c}"] = w.timestamps[-1]
    note = plugin.last_note.get(st.camera_id)
    if note:
        for c in plugin.classes:
            st.sup_notes[f"{plugin.id}:{c}"] = note


class ClipWorker(threading.Thread):
    """Runs the 16-frame clip models on the windows the main loop queued, batched across cameras."""

    MAX_BATCH = 4

    def __init__(self, pipeline: Pipeline) -> None:
        super().__init__(name="clip-models", daemon=True)
        self.pipeline = pipeline
        self._stop_evt = threading.Event()
        self.busy_ms = 0.0

    def stop(self) -> None:
        self._stop_evt.set()

    def run(self) -> None:
        while not self._stop_evt.is_set():
            did = False
            for plugin in [p for p in models.plugins if p.window_size > 1]:
                with self.pipeline._states_lock:
                    states = list(self.pipeline.states.values())
                todo = []
                for st in states:
                    w = st.clip_pending.pop(plugin.id, None)
                    if w is not None:
                        todo.append((st, w))
                # Oldest windows first so every camera gets its turn.
                todo.sort(key=lambda sw: sw[1].timestamps[-1])
                for i in range(0, len(todo), self.MAX_BATCH):
                    part = todo[i:i + self.MAX_BATCH]
                    t0 = time.perf_counter()
                    try:
                        scores = plugin.score_batch([w for _, w in part])
                    except Exception:
                        log.exception("%s failed", plugin.id)
                        continue
                    spent = time.perf_counter() - t0
                    self.busy_ms = 0.8 * self.busy_ms + 0.2 * spent * 1000
                    for (st, w), s in zip(part, scores):
                        store_scores(plugin, st, w, s)
                    did = True
                    # Leave the GPU to detection and tracking for a moment between batches.
                    self._stop_evt.wait(0.5 * spent)
            if not did:
                self._stop_evt.wait(0.05)


def learn_from_video(camera_id: str, path: Path, progress=None, max_seconds: float | None = None) -> float:
    """Add a normal video to a camera's normality model, faster than real time. Returns seconds learned."""
    from ultralytics.trackers.byte_tracker import BYTETracker

    from .runtime import pipeline

    models.ready.wait(timeout=120)
    if models.detector is None:
        raise RuntimeError("The object detector is not loaded")
    st_live = pipeline.state(camera_id)
    model = st_live.normality if st_live else (NormalityModel.load(camera_id) or NormalityModel(camera_id))
    st = CameraState(camera_id, BYTETracker(TRACKER_ARGS), model)
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, round(fps / ANALYSIS_FPS))
    learned = 0.0
    idx = 0
    pending: list[tuple[float, np.ndarray]] = []
    base_ts = time.time()

    def flush() -> None:
        nonlocal learned
        if not pending:
            return
        imgs = [img for _, img in pending]
        with models.lock:
            results = detect(imgs)
            objs_list = [update_tracks(st, r, ts, img, True) for (ts, img), r in zip(pending, results)]
            attach_poses(objs_list, imgs)
        for (ts, _), objs in zip(pending, objs_list):
            model.learn(objs, ts, step / fps)
            learned += step / fps
        pending.clear()

    try:
        while True:
            ok = cap.grab()
            if not ok:
                break
            if idx % step == 0:
                ok, frame = cap.retrieve()
                if ok:
                    h, w = frame.shape[:2]
                    frame = cv2.resize(frame, (config.STREAM_WIDTH, int(round(h * config.STREAM_WIDTH / w / 2)) * 2))
                    pending.append((base_ts + idx / fps, frame))
                if len(pending) >= 8:
                    flush()
                    if progress and total:
                        progress(idx / total)
            idx += 1
            if max_seconds and learned >= max_seconds:
                break
        flush()
    finally:
        cap.release()
    for info in st.tracks.values():
        model.learn_dwell(info.votes.most_common(1)[0][0], info.last_seen - info.first_seen)
    model.finalize()
    model.save()
    return learned
