"""First-run data: the four example incidents from the step 1 mock."""

from . import db

THRESHOLDS = {"supervised": 0.5, "unsupervised": 0.6}

EXAMPLE_INCIDENTS = [
    {
        "id": "inc-0141", "camera_id": "cam5", "type": "fight",
        "started_at": "2026-10-25T11:29:34", "ended_at": "2026-10-25T11:39:00",
        "alarm_count": 36, "raised_by": "both",
        "scores": {"supervised": 0.95, "unsupervised": 0.88},
        "caption": "A man in grey runs toward others while a dog lies on the floor.",
    },
    {
        "id": "inc-0140", "camera_id": "cam4", "type": "fall",
        "started_at": "2026-10-25T11:37:02", "ended_at": "2026-10-25T11:37:06",
        "alarm_count": 2, "raised_by": "both",
        "scores": {"supervised": 0.95, "unsupervised": 0.71},
        "caption": "Delivery person slips and falls with packages on the deck.",
    },
    {
        "id": "inc-0139", "camera_id": "cam2", "type": "fall",
        "started_at": "2026-10-25T11:35:22", "ended_at": "2026-10-25T11:35:46",
        "alarm_count": 2, "raised_by": "supervised",
        "scores": {"supervised": 0.90, "unsupervised": 0.44},
        "caption": "A person lies on the ground, then sits up.",
    },
    {
        "id": "inc-0138", "camera_id": "cam3", "type": "unusual_posture",
        "started_at": "2026-10-25T11:31:08", "ended_at": "2026-10-25T11:31:12",
        "alarm_count": 1, "raised_by": "unsupervised",
        "scores": {"supervised": 0.12, "unsupervised": 0.83},
        "caption": "Two people crouch low behind the counter for several seconds.",
    },
]


def seed_incidents() -> None:
    """Insert the example incidents once. Deleting them later keeps them deleted."""
    if db.get_meta("incidents_seeded"):
        return
    for inc in EXAMPLE_INCIDENTS:
        if db.get_incident(inc["id"]) is None:
            db.insert_incident({**inc, "thresholds": THRESHOLDS, "clip_url": None})
    db.set_meta("incidents_seeded", db.now_iso())
