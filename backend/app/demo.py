"""Build the demo setup: download two datasets, join clips into reels, create 7 virtual cameras.

Run with the backend stopped:  .venv\\python.exe -m app.demo
Existing cameras are replaced. Library clips, incidents and downloads are kept.
"""

from __future__ import annotations

import logging

from . import config, db, library, media

log = logging.getLogger("veghe.demo")

DATASETS = ["ur-fall", "fight-surv"]


def _r(prefix: str, first: int, last: int) -> list[str]:
    return [f"{prefix}-{i:03d}" if "fight" in prefix else f"{prefix}-{i:02d}" for i in range(first, last + 1)]


# Camera ids match the step 1 mock so the example incidents stay attached.
REELS = [
    {
        "camera_id": "cam5", "name": "Cafeteria", "dataset": "fight-surv", "key": "reel-cafeteria",
        "title": "Cafeteria: calm, then a fight",
        "clips": _r("nofight", 57, 60) + _r("fight", 26, 30),
    },
    {
        "camera_id": "cam1", "name": "Bus interior", "dataset": "fight-surv", "key": "reel-bus",
        "title": "Bus interior: calm, then a fight",
        "clips": _r("nofight", 39, 42) + _r("fight", 51, 55),
    },
    {
        "camera_id": "cam2", "name": "Office", "dataset": "ur-fall", "key": "reel-office",
        "title": "Office: twelve staged falls",
        "clips": _r("fall", 1, 12),  # same office and camera angle
    },
    {
        "camera_id": "cam3", "name": "Street corner", "dataset": "fight-surv", "key": "reel-street",
        "title": "Street corner: calm, then a street fight",
        "clips": _r("nofight", 51, 52) + _r("fight", 115, 121),
    },
    {
        "camera_id": "cam4", "name": "Building hallway", "dataset": "fight-surv", "key": "reel-hallway",
        "title": "Building hallway: normal foot traffic",
        "clips": _r("nofight", 69, 76),
    },
    {
        "camera_id": "cam-201-a", "name": "Plaza", "dataset": "fight-surv", "key": "reel-plaza",
        "title": "Plaza from above: normal foot traffic",
        "clips": _r("nofight", 77, 83),
    },
    {
        "camera_id": "cam-204-a", "name": "Parking street", "dataset": "fight-surv", "key": "reel-parking",
        "title": "Parking street: normal traffic",
        "clips": _r("nofight", 84, 87),
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


def build_reel(reel: dict) -> str:
    ds = library.dataset(reel["dataset"])
    assert ds is not None
    video_id = f"{reel['dataset']}-{reel['key']}"
    video, thumb = library.library_paths(reel["dataset"], reel["key"])
    clip_ids = [f"{reel['dataset']}-{c}" for c in reel["clips"]]
    clips = [db.get_library_video(c) for c in clip_ids]
    missing = [c for c, v in zip(clip_ids, clips) if v is None]
    if missing:
        raise RuntimeError(f"Missing clips for {reel['key']}: {missing}")
    if not video.exists():
        first = clips[0]
        size = (first["width"], first["height"])  # type: ignore[index]
        fps = first["fps"] or 25  # type: ignore[index]
        log.info("building %s from %d clips", reel["key"], len(clips))
        media.concat_h264([config.DATA_DIR / c["file_path"] for c in clips], video, size, fps)  # type: ignore[index]
    types = sorted({t for c in clips for t in c["anomaly_types"]})  # type: ignore[index]
    library.register_clip(
        video_id=video_id, title=reel["title"], dataset_id=ds["id"], dataset_name=ds["name"],
        anomaly_types=types, origin="reel", video=video, thumb=thumb,
        original_name=f"{len(clips)} clips joined",
    )
    return video_id


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    db.init()
    for d in DATASETS:
        ensure_dataset(d)
    for cam in db.list_cameras():
        db.delete_camera(cam["id"])
    for position, reel in enumerate(REELS):
        video_id = build_reel(reel)
        video = db.get_library_video(video_id)
        assert video is not None
        db.insert_camera({
            "id": reel["camera_id"], "name": reel["name"], "source_type": "file",
            "source": video["file_path"], "library_video_id": video_id, "position": position,
        })
        log.info("camera %s -> %s", reel["camera_id"], video["file_path"])
    db.set_meta("demo_built", db.now_iso())
    log.info("done: %d cameras", len(REELS))


if __name__ == "__main__":
    main()
