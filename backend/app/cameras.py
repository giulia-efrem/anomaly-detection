"""Camera readers.

One thread per camera opens the source (RTSP url, webcam index or video file),
downsizes frames to STREAM_WIDTH at about STREAM_FPS and pushes them into a
small FrameBuffer. The MJPEG endpoint and, from step 3, the anomaly detectors
read the same buffer. Video files loop forever so they behave like a live
camera (a virtual camera).
"""

from __future__ import annotations

import logging
import threading
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np

from . import config

log = logging.getLogger("veghe.cameras")

StatusCallback = Callable[[str, str], None]


@dataclass(frozen=True)
class Frame:
    seq: int
    timestamp: float  # time.time() when the frame was captured
    image: np.ndarray  # BGR, STREAM_WIDTH wide
    jpeg: bytes


class FrameBuffer:
    """Ring buffer of the most recent frames, shared by streaming and analysis."""

    def __init__(self, maxlen: int = config.FRAME_BUFFER_SIZE) -> None:
        self._frames: deque[Frame] = deque(maxlen=maxlen)
        # JPEGs only, long enough for the seconds before an alert in an incident clip.
        self._history: deque[tuple[float, bytes]] = deque(maxlen=int(config.STREAM_FPS * config.JPEG_HISTORY_SECONDS))
        self._cond = threading.Condition()
        self._seq = 0

    def push(self, image: np.ndarray, jpeg: bytes) -> Frame:
        with self._cond:
            self._seq += 1
            frame = Frame(self._seq, time.time(), image, jpeg)
            self._frames.append(frame)
            self._history.append((frame.timestamp, jpeg))
            self._cond.notify_all()
            return frame

    def jpegs_since(self, ts: float) -> list[tuple[float, bytes]]:
        """(timestamp, JPEG) of every stream frame after `ts` still in the history, oldest first."""
        with self._cond:
            return [item for item in self._history if item[0] > ts]

    def latest(self) -> Frame | None:
        with self._cond:
            return self._frames[-1] if self._frames else None

    def snapshot(self) -> list[Frame]:
        """All buffered frames, oldest first."""
        with self._cond:
            return list(self._frames)

    def wait_newer(self, seq: int, timeout: float = 1.0) -> Frame | None:
        """Block until a frame newer than `seq` exists (for analysis threads)."""
        with self._cond:
            self._cond.wait_for(lambda: self._seq > seq, timeout=timeout)
            return self._frames[-1] if self._frames and self._seq > seq else None

    def clear(self) -> None:
        with self._cond:
            self._frames.clear()
            self._history.clear()


def resolve_file_source(source: str) -> Path:
    """File sources may be absolute or relative to the data folder."""
    p = Path(source)
    return p if p.is_absolute() else (config.DATA_DIR / p)


class CameraWorker(threading.Thread):
    def __init__(self, camera_id: str, source_type: str, source: str, on_status: StatusCallback) -> None:
        super().__init__(name=f"camera-{camera_id}", daemon=True)
        self.camera_id = camera_id
        self.source_type = source_type
        self.source = source
        self.buffer = FrameBuffer()
        self.status = "connecting"
        self.error: str | None = None
        self._on_status = on_status
        self._stop_evt = threading.Event()
        self._retry_evt = threading.Event()

    # --- control -------------------------------------------------------------

    def stop(self) -> None:
        self._stop_evt.set()
        self._retry_evt.set()

    def retry(self) -> None:
        """Reconnect now instead of waiting for the next automatic attempt."""
        self._retry_evt.set()

    def _set_status(self, status: str, error: str | None = None) -> None:
        self.error = error
        if status != self.status:
            self.status = status
            self._on_status(self.camera_id, status)

    # --- reading -------------------------------------------------------------

    def _open(self) -> cv2.VideoCapture | None:
        if self.source_type == "file":
            path = resolve_file_source(self.source)
            if not path.is_file():
                self.error = f"File not found: {path}"
                return None
            cap = cv2.VideoCapture(str(path))
        elif self.source_type == "webcam":
            cap = cv2.VideoCapture(int(self.source), cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened():
            cap.release()
            self.error = "Could not open the source"
            return None
        return cap

    def _emit(self, frame: np.ndarray) -> None:
        h, w = frame.shape[:2]
        if w != config.STREAM_WIDTH:
            new_h = int(round(h * config.STREAM_WIDTH / w / 2)) * 2
            interp = cv2.INTER_AREA if w > config.STREAM_WIDTH else cv2.INTER_LINEAR
            frame = cv2.resize(frame, (config.STREAM_WIDTH, new_h), interpolation=interp)
        ok, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, config.JPEG_QUALITY])
        if ok:
            self.buffer.push(frame, jpeg.tobytes())
            if self.status != "live":
                self._set_status("live")

    def _pump(self, cap: cv2.VideoCapture) -> None:
        """Read until the source fails or the worker stops."""
        is_file = self.source_type == "file"
        src_fps = cap.get(cv2.CAP_PROP_FPS)
        frame_interval = 1.0 / src_fps if 1 <= src_fps <= 120 else 1.0 / 25
        emit_interval = 1.0 / config.STREAM_FPS
        next_due = time.monotonic()
        next_emit = 0.0
        failures = 0

        while not self._stop_evt.is_set():
            if not cap.grab():
                if is_file and failures < 2:
                    failures += 1
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # loop the file
                    continue
                return
            failures = 0

            now = time.monotonic()
            if is_file:
                # Play files at their own speed, like a real camera would deliver them.
                next_due += frame_interval
                if next_due - now > 0:
                    time.sleep(next_due - now)
                elif now - next_due > 1.0:
                    next_due = now  # fell far behind; resync instead of racing
                now = time.monotonic()

            if now >= next_emit:
                # Keep a steady average rate even when source frames don't divide evenly.
                next_emit = max(next_emit + emit_interval, now - emit_interval)
                ok, frame = cap.retrieve()
                if ok and frame is not None:
                    self._emit(frame)

    def run(self) -> None:
        while not self._stop_evt.is_set():
            self._set_status("connecting")
            cap = self._open()
            if cap is not None:
                try:
                    self._pump(cap)
                except Exception as exc:  # keep the thread alive on decoder errors
                    log.exception("camera %s crashed", self.camera_id)
                    self.error = str(exc)
                finally:
                    cap.release()
                if self._stop_evt.is_set():
                    break
                self.error = self.error or "Stream ended"
            self.buffer.clear()
            self._set_status("offline", self.error)
            log.info("camera %s offline: %s", self.camera_id, self.error)
            self._retry_evt.wait(config.RECONNECT_SECONDS)
            self._retry_evt.clear()


class CameraManager:
    def __init__(self, on_status: StatusCallback) -> None:
        self._workers: dict[str, CameraWorker] = {}
        self._lock = threading.Lock()
        self._on_status = on_status

    def start(self, camera: dict[str, Any]) -> None:
        self.stop(camera["id"])
        worker = CameraWorker(camera["id"], camera["source_type"], camera["source"], self._on_status)
        with self._lock:
            self._workers[camera["id"]] = worker
        worker.start()

    def stop(self, camera_id: str) -> None:
        """Stop a reader and wait until it has released its source (Windows locks open files)."""
        with self._lock:
            worker = self._workers.pop(camera_id, None)
        if worker:
            worker.stop()
            if worker is not threading.current_thread():
                worker.join(timeout=3)

    def stop_all(self) -> None:
        with self._lock:
            workers = list(self._workers.values())
            self._workers.clear()
        for w in workers:
            w.stop()
        for w in workers:
            w.join(timeout=2)

    def get(self, camera_id: str) -> CameraWorker | None:
        with self._lock:
            return self._workers.get(camera_id)

    def status(self, camera_id: str) -> str:
        w = self.get(camera_id)
        return w.status if w else "offline"

    def buffer(self, camera_id: str) -> FrameBuffer | None:
        """Shared frames for a camera; the step 3 detectors read from here."""
        w = self.get(camera_id)
        return w.buffer if w else None
