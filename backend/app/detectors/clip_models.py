"""Clip classifiers: 16 frames in, one probability out.

fight:        X3D-M fine-tuned on RWF-2000 (visionlab-ai). 16 x 224 x 224 RGB,
              normalised with mean 0.45 and std 0.225. The PyTorchVideo head ends
              in a softmax; index 1 is "violent".
car_accident: 3D ResNet-18 crash detector (HaniaRuby), TorchScript. 16 x 112 x 112
              RGB in [0, 1]; the model applies the sigmoid itself.
"""

from __future__ import annotations

import cv2
import numpy as np
import torch

from .. import model_files
from .base import Detector, Window

CLIP_FRAMES = 16


def clip_tensor(frames: list[np.ndarray], size: int, mean: float = 0.0, std: float = 1.0) -> torch.Tensor:
    """BGR frames -> (3, T, size, size) float tensor. Frames are squashed, not cropped,
    so people at the edges of a wide surveillance view still count."""
    arr = np.stack([cv2.resize(f, (size, size), interpolation=cv2.INTER_AREA)[:, :, ::-1] for f in frames])
    t = torch.from_numpy(np.ascontiguousarray(arr)).float().div_(255.0)
    if mean or std != 1.0:
        t = (t - mean) / std
    return t.permute(3, 0, 1, 2)


def sample(frames: list[np.ndarray], n: int = CLIP_FRAMES) -> list[np.ndarray]:
    if len(frames) == n:
        return frames
    idx = np.linspace(0, len(frames) - 1, n).round().astype(int)
    return [frames[i] for i in idx]


class _ClipDetector(Detector):
    window_size = CLIP_FRAMES
    every_s = 1.6  # a new prediction every 8 analysis frames; windows overlap by half
    size = 224
    mean = 0.0
    std = 1.0
    use_amp = True  # float16 on the GPU

    def _model_probs(self, batch: torch.Tensor) -> torch.Tensor:
        raise NotImplementedError

    def score_batch(self, windows: list[Window]) -> list[dict[str, float]]:
        if not windows:
            return []
        batch = torch.stack([clip_tensor(sample(w.frames[-CLIP_FRAMES:]), self.size, self.mean, self.std)
                             for w in windows]).to(self.device)
        with torch.inference_mode(), torch.autocast("cuda", dtype=torch.float16, enabled=self.use_amp and self.device == "cuda"):
            probs = self._model_probs(batch).float().cpu().numpy()
        cls = self.classes[0]
        for w, p in zip(windows, probs):
            self.last_note[w.camera_id] = self.note(w, float(p))
        return [{cls: float(p)} for p in probs]

    def note(self, window: Window, p: float) -> str:
        return f"{self.name} {p:.2f}"

    def score(self, window: Window) -> dict[str, float]:
        return self.score_batch([window])[0]


class FightDetector(_ClipDetector):
    id = "fight-x3d"
    name = "X3D-M violence (RWF-2000)"
    classes = ("fight",)
    size = 224
    mean = 0.45
    std = 0.225

    def warmup(self) -> None:
        from pytorchvideo.models.x3d import create_x3d

        backbone = create_x3d(input_clip_length=CLIP_FRAMES, input_crop_size=224, depth_factor=2.2,
                              model_num_class=400)
        backbone.blocks[5].proj = torch.nn.Sequential(torch.nn.Dropout(0.3), torch.nn.Linear(2048, 2))
        wrapper = torch.nn.Module()
        wrapper.backbone = backbone
        # weights_only keeps the pickle from running code; the checkpoint also stores
        # numpy scalars from its training history.
        safe = [np._core.multiarray.scalar, np.dtype, type(np.dtype(np.float64))]
        with torch.serialization.safe_globals(safe):
            ckpt = torch.load(model_files.path(self.id), map_location="cpu", weights_only=True)
        wrapper.load_state_dict(ckpt["model"])
        self.model = backbone.eval().to(self.device)
        self._model_probs(torch.zeros(1, 3, CLIP_FRAMES, 224, 224, device=self.device))
        self.loaded = True

    def wants(self, window: Window) -> bool:
        """Two or more people close together: centres within 1.5 body heights."""
        if len(window.frames) < CLIP_FRAMES:
            return False
        people = window.people
        for i, a in enumerate(people):
            for b in people[i + 1:]:
                (ax, ay), (bx, by) = a.center, b.center
                h = (a.height + b.height) / 2
                # Image x and y are fractions of different lengths; 16:9 frames make x 1.78 times longer.
                if np.hypot((ax - bx) * 1.78, ay - by) < 1.5 * h:
                    return True
        return False

    def _model_probs(self, batch: torch.Tensor) -> torch.Tensor:
        out = self.model(batch)
        return out[:, 1]

    def note(self, window: Window, p: float) -> str:
        return f"Fight model {p:.2f}, {len(window.people)} people in view, at least two close together"


class CrashDetector(_ClipDetector):
    id = "crash-r3d18"
    name = "3D ResNet-18 crash detector"
    classes = ("car_accident",)
    size = 112
    use_amp = False  # TorchScript graph, keep it in float32
    VEHICLE_MEMORY_S = 3.0  # keep running a little after the last vehicle was seen

    def warmup(self) -> None:
        self.model = torch.jit.load(str(model_files.path(self.id)), map_location=self.device).eval()
        self._model_probs(torch.zeros(1, 3, CLIP_FRAMES, 112, 112, device=self.device))
        self.loaded = True

    def wants(self, window: Window) -> bool:
        if len(window.frames) < CLIP_FRAMES:
            return False
        now = window.timestamps[-1]
        if window.vehicles:
            window.state["vehicle_seen"] = now
        return now - window.state.get("vehicle_seen", -1e9) <= self.VEHICLE_MEMORY_S

    def _model_probs(self, batch: torch.Tensor) -> torch.Tensor:
        return self.model(batch).reshape(-1)

    def note(self, window: Window, p: float) -> str:
        n = len(window.vehicles)
        return f"Crash model {p:.2f}, {n} {'vehicle' if n == 1 else 'vehicles'} in view"
