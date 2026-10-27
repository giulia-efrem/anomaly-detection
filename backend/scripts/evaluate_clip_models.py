r"""Score labelled library clips with a clip detector and report AUC and thresholds.

Run from the backend folder, e.g.:
  .venv\python.exe scripts\evaluate_clip_models.py fight fight-surv
  .venv\python.exe scripts\evaluate_clip_models.py car_accident demo-crash
Each clip gives one window of 16 frames sampled evenly over its first `--seconds`.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402

from app import config, db  # noqa: E402
from app.detectors import Window  # noqa: E402
from app.detectors.clip_models import CrashDetector, FightDetector  # noqa: E402

DETECTORS = {"fight": FightDetector, "car_accident": CrashDetector}


def read_frames(path: Path, seconds: float, n: int = 16) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    last = min(total, int(seconds * fps)) - 1
    want = set(np.linspace(0, max(last, 0), n).round().astype(int).tolist())
    frames, i = [], 0
    while i <= last:
        ok, f = cap.read()
        if not ok:
            break
        if i in want:
            frames.append(cv2.resize(f, (320, int(320 * f.shape[0] / f.shape[1]))))
        i += 1
    cap.release()
    while frames and len(frames) < n:
        frames.append(frames[-1])
    return frames


def auc(pos: np.ndarray, neg: np.ndarray) -> float:
    s = np.concatenate([pos, neg])
    ranks = s.argsort().argsort() + 1
    return float((ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cls", choices=DETECTORS)
    ap.add_argument("dataset")
    ap.add_argument("--seconds", type=float, default=3.2)
    args = ap.parse_args()
    db.init()
    clips = [v for v in db.list_library(args.dataset) if v["origin"] != "reel"]
    det = DETECTORS[args.cls]("cuda" if torch.cuda.is_available() else "cpu")
    det.warmup()
    pos, neg = [], []
    t0 = time.time()
    for v in clips:
        frames = read_frames(config.DATA_DIR / v["file_path"], args.seconds)
        if len(frames) < 16:
            continue
        w = Window(v["id"], frames, [0.0] * 16, frames[-1], [])
        p = det.score(w)[args.cls]
        (pos if args.cls in v["anomaly_types"] else neg).append(p)
    pos_a, neg_a = np.array(pos), np.array(neg)
    print(f"{len(pos)} positive, {len(neg)} negative clips in {time.time() - t0:.0f} s")
    print(f"mean score positive {pos_a.mean():.3f}, negative {neg_a.mean():.3f}, AUC {auc(pos_a, neg_a):.3f}")
    for thr in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
        tpr, fpr = (pos_a >= thr).mean(), (neg_a >= thr).mean()
        print(f"  threshold {thr:.1f}: recall {tpr:.2f}, false positive rate {fpr:.2f}")


if __name__ == "__main__":
    main()
