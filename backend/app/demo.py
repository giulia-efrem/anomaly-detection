r"""Build the demo setup: download the test datasets, join clips into reels, create 8 virtual cameras.

Run with the backend stopped:  .venv\python.exe -m app.demo
Existing cameras (and what they learned) are replaced. Library clips, incidents and downloads are kept.

Each pretrained class gets a camera (fight twice), and three cameras show the scene
normality model: they first learn from the normal training footage of the same scene
(Avenue and UCSD training videos, UR Fall everyday activities), faster than real time,
and then loop the test footage with the anomalies.
"""

from __future__ import annotations

import logging

from . import config, db, library, media
from .normality import NormalityModel

log = logging.getLogger("veghe.demo")

DATASETS = ["fight-surv", "veghe-demo", "ur-fall", "avenue", "ucsd"]


def _r(prefix: str, first: int, last: int, width: int = 3) -> list[str]:
    return [f"{prefix}-{i:0{width}d}" for i in range(first, last + 1)]


REELS = [
    {
        "camera_id": "cafeteria", "name": "Cafeteria", "dataset": "fight-surv", "key": "reel-cafeteria",
        "title": "Cafeteria: calm, then a fight",
        "clips": _r("nofight", 57, 60) + _r("fight", 26, 30),
    },
    {
        "camera_id": "street-corner", "name": "Street corner", "dataset": "fight-surv", "key": "reel-street",
        "title": "Street corner: calm, then a street fight",
        "clips": _r("nofight", 51, 52) + _r("fight", 115, 121),
    },
    {
        "camera_id": "roads", "name": "Road cameras", "dataset": "veghe-demo", "key": "reel-crashes",
        "title": "Road cameras: three collisions",
        "clips": ["crash-jilin", "crash-staten-island", "crash-dashcam"],
    },
    {
        "camera_id": "fire-watch", "name": "Fire watch", "dataset": "veghe-demo", "key": "reel-fire",
        "title": "Fire watch: bus fire, gas blast, balloon fireball, car fire",
        "clips": ["fire-bus", "explosion-gas-cylinder", "explosion-balloon", "fire-car-riot"],
    },
    {
        "camera_id": "armed", "name": "Shooting ranges and office", "dataset": "veghe-demo", "key": "reel-guns",
        "title": "Handguns: two shooting ranges, then an office robbery",
        "clips": ["gun-range-handheld", "gun-pistol-range", "gun-office-robbery"],
    },
    {
        "camera_id": "office", "name": "Office", "dataset": "ur-fall", "key": "reel-office",
        "title": "Office: twelve staged falls",
        "clips": _r("fall", 1, 12, 2),
        # The everyday-activity clips were filmed in other rooms, so the office learns from the
        # seconds before the fall in the other 18 fall clips (never shown on this camera).
        "learn": _r("fall", 13, 30, 2),
        "learn_fraction": 0.4,
    },
    {
        "camera_id": "avenue", "name": "Campus avenue", "dataset": "avenue", "key": "reel-avenue-test",
        "title": "Campus avenue: running, throwing, wrong direction",
        "clips": _r("testing", 1, 6, 2),
        "learn": _r("training", 1, 16, 2),
    },
    {
        "camera_id": "walkway", "name": "Pedestrian walkway", "dataset": "ucsd", "key": "reel-ped2-test",
        "title": "Pedestrian walkway: bikes, a skater and a cart",
        "clips": _r("ped2-test", 1, 12),
        "learn": _r("ped2-train", 1, 16),
    },
]


def ensure_dataset(dataset_id: str) -> None:
    ds = library.dataset(dataset_id)
    assert ds is not None
    if db.library_counts().get(dataset_id, 0) >= ds["clip_count"]:
        log.info("%s already imported", dataset_id)
        return
    log.info("downloading and importing %s", ds["name"])
    library.import_dataset(library.Job(id=f"demo-{dataset_id}", kind="dataset", label=ds["name"], dataset_id=dataset_id))


def _clips(dataset_id: str, keys: list[str]) -> list[dict]:
    ids = [f"{dataset_id}-{c}" for c in keys]
    clips = [db.get_library_video(c) for c in ids]
    missing = [c for c, v in zip(ids, clips) if v is None]
    if missing:
        raise RuntimeError(f"Missing clips: {missing}")
    return clips  # type: ignore[return-value]


def build_reel(reel: dict) -> str:
    ds = library.dataset(reel["dataset"])
    assert ds is not None
    video_id = f"{reel['dataset']}-{reel['key']}"
    video, thumb = library.library_paths(reel["dataset"], reel["key"])
    clips = _clips(reel["dataset"], reel["clips"])
    if not video.exists():
        first = clips[0]
        size = (first["width"], first["height"])
        if size[0] < 640:  # small sources (UCSD, UR Fall) are scaled up once here
            size = (640, int(round(640 * size[1] / size[0] / 2)) * 2)
        fps = first["fps"] or 25
        log.info("building %s from %d clips", reel["key"], len(clips))
        media.concat_h264([config.DATA_DIR / c["file_path"] for c in clips], video, size, fps)
    types = sorted({t for c in clips for t in c["anomaly_types"]})
    library.register_clip(
        video_id=video_id, title=reel["title"], dataset_id=ds["id"], dataset_name=ds["name"],
        anomaly_types=types, origin="reel", video=video, thumb=thumb,
        original_name=f"{len(clips)} clips joined",
    )
    return video_id


def learn(reel: dict) -> float:
    """Teach the camera the normal footage of its scene. Returns seconds learned."""
    from .pipeline import learn_from_video, models

    if not models.ready.is_set():
        models.load()
    total = 0.0
    fraction = reel.get("learn_fraction")
    for clip in _clips(reel["dataset"], reel["learn"]):
        limit = clip["duration_s"] * fraction if fraction and clip["duration_s"] else None
        total += learn_from_video(reel["camera_id"], config.DATA_DIR / clip["file_path"], max_seconds=limit)
    log.info("camera %s learned %.0f s of normal footage", reel["camera_id"], total)
    return total


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    db.init()
    for d in DATASETS:
        ensure_dataset(d)
    for cam in db.list_cameras():
        db.delete_camera(cam["id"])
        NormalityModel.delete(cam["id"])
    for position, reel in enumerate(REELS):
        video_id = build_reel(reel)
        video = db.get_library_video(video_id)
        assert video is not None
        values = {
            "id": reel["camera_id"], "name": reel["name"], "source_type": "file",
            "source": video["file_path"], "library_video_id": video_id, "position": position,
            "learn_seconds": config.LEARN_SECONDS,
        }
        if "learn" in reel:
            seconds = learn(reel)
            values.update(learn_seconds=round(seconds), unsupervised="ready", learning_progress=1.0)
        db.insert_camera(values)
        log.info("camera %s -> %s", reel["camera_id"], video["file_path"])
    db.set_meta("demo_built", db.now_iso())
    log.info("done: %d cameras", len(REELS))


if __name__ == "__main__":
    main()
