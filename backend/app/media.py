"""Video helpers built on the ffmpeg binary shipped with imageio-ffmpeg."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import cv2
import imageio_ffmpeg

from . import config

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# Never pop up a console window for ffmpeg on Windows.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


class MediaError(RuntimeError):
    pass


def _run(args: list[str], timeout: float = 900) -> None:
    proc = subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=_NO_WINDOW,
    )
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-3:]
        raise MediaError("ffmpeg failed: " + " | ".join(tail))


def _scale_filter(max_width: int) -> str:
    # Cap the width and keep both sides even, as libx264 with yuv420p requires.
    return f"scale='trunc(min({max_width},iw)/2)*2':'trunc(ow/a/2)*2'"


def _h264_args() -> list[str]:
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", "-an"]


def to_h264(src: Path, dst: Path, crop: str | None = None, max_width: int = config.CLIP_MAX_WIDTH,
            trim: tuple[float, float] | None = None) -> None:
    """Convert any video OpenCV/ffmpeg can read into a browser friendly H.264 MP4.
    `trim` keeps (start, duration) seconds of it."""
    filters = ([crop] if crop else []) + [_scale_filter(max_width)]
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.mp4")
    cut = ["-ss", f"{trim[0]:g}", "-t", f"{trim[1]:g}"] if trim else []
    _run([*cut, "-i", str(src), "-vf", ",".join(filters), *_h264_args(), str(tmp)])
    tmp.replace(dst)


def frames_to_h264(pattern: str, dst: Path, fps: float, start_number: int = 1) -> None:
    """Encode an image sequence such as 'Train001/%03d.tif' into an MP4."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.mp4")
    _run([
        "-framerate", str(fps), "-start_number", str(start_number), "-i", pattern,
        "-vf", _scale_filter(config.CLIP_MAX_WIDTH), *_h264_args(), str(tmp),
    ])
    tmp.replace(dst)


def concat_h264(sources: list[Path], dst: Path, size: tuple[int, int], fps: float) -> None:
    """Join clips into one, scaling every part to the same size and frame rate."""
    w, h = size
    inputs: list[str] = []
    for p in sources:
        inputs += ["-i", str(p)]
    parts = "".join(
        f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,"
        f"setsar=1,fps={fps}[v{i}];"
        for i in range(len(sources))
    )
    joined = "".join(f"[v{i}]" for i in range(len(sources)))
    graph = f"{parts}{joined}concat=n={len(sources)}:v=1:a=0[out]"
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.mp4")
    _run([*inputs, "-filter_complex", graph, "-map", "[out]", *_h264_args(), str(tmp)])
    tmp.replace(dst)


def probe(path: Path) -> dict[str, Any]:
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            raise MediaError(f"Unreadable video: {path.name}")
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
        return {
            "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "fps": round(fps, 2) if fps else None,
            "duration_s": round(frames / fps, 2) if fps and frames else None,
        }
    finally:
        cap.release()


def thumbnail(video: Path, dst: Path, at_s: float | None = None) -> None:
    """Grab one frame (a third into the clip by default) as a JPEG."""
    cap = cv2.VideoCapture(str(video))
    try:
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        idx = int(at_s * fps) if at_s is not None else frames // 3
        cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, min(idx, frames - 1)))
        ok, frame = cap.read()
        if not ok:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = cap.read()
        if not ok:
            raise MediaError(f"No frames in {video.name}")
    finally:
        cap.release()
    h, w = frame.shape[:2]
    if w > config.THUMB_WIDTH:
        frame = cv2.resize(frame, (config.THUMB_WIDTH, int(h * config.THUMB_WIDTH / w)), interpolation=cv2.INTER_AREA)
    dst.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(dst), frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
