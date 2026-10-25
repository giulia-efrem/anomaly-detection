"""SQLite storage. One short-lived connection per call keeps it thread safe."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  dataset_id TEXT,
  dataset_name TEXT,
  anomaly_types TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL CHECK (origin IN ('catalog', 'upload', 'url', 'reel')),
  original_name TEXT,
  file_path TEXT NOT NULL,
  thumb_path TEXT,
  duration_s REAL,
  width INTEGER,
  height INTEGER,
  fps REAL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('rtsp', 'webcam', 'file')),
  source TEXT NOT NULL,
  library_video_id TEXT REFERENCES library_videos(id) ON DELETE SET NULL,
  supervised TEXT NOT NULL DEFAULT 'off' CHECK (supervised IN ('on', 'off')),
  unsupervised TEXT NOT NULL DEFAULT 'collecting'
    CHECK (unsupervised IN ('collecting', 'learning', 'ready', 'off')),
  learning_progress REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- No foreign key on camera_id: incident history outlives a removed camera.
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  camera_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fight', 'fall', 'unusual_posture', 'other')),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  alarm_count INTEGER NOT NULL DEFAULT 1,
  raised_by TEXT NOT NULL CHECK (raised_by IN ('supervised', 'unsupervised', 'both')),
  score_supervised REAL,
  score_unsupervised REAL,
  threshold_supervised REAL NOT NULL,
  threshold_unsupervised REAL NOT NULL,
  caption TEXT,
  clip_url TEXT,
  status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review', 'confirmed', 'false_alarm')),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS incidents_camera ON incidents(camera_id);
"""


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(config.DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init() -> None:
    config.ensure_dirs()
    with connect() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)


def get_meta(key: str) -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_meta(key: str, value: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


# --- cameras -----------------------------------------------------------------

CAMERA_COLUMNS = (
    "id", "name", "source_type", "source", "library_video_id",
    "supervised", "unsupervised", "learning_progress", "position", "created_at",
)


def list_cameras() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM cameras ORDER BY position, created_at").fetchall()
    return [dict(r) for r in rows]


def get_camera(camera_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM cameras WHERE id = ?", (camera_id,)).fetchone()
    return dict(row) if row else None


def insert_camera(values: dict[str, Any]) -> None:
    values = {"created_at": now_iso(), **values}
    cols = [c for c in CAMERA_COLUMNS if c in values]
    with connect() as conn:
        if "position" not in values:
            cols.append("position")
            values["position"] = conn.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM cameras"
            ).fetchone()[0]
        conn.execute(
            f"INSERT INTO cameras ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
            [values[c] for c in cols],
        )


def update_camera(camera_id: str, values: dict[str, Any]) -> None:
    cols = [c for c in values if c in CAMERA_COLUMNS and c != "id"]
    if not cols:
        return
    with connect() as conn:
        conn.execute(
            f"UPDATE cameras SET {', '.join(f'{c} = ?' for c in cols)} WHERE id = ?",
            [values[c] for c in cols] + [camera_id],
        )


def delete_camera(camera_id: str) -> bool:
    with connect() as conn:
        return conn.execute("DELETE FROM cameras WHERE id = ?", (camera_id,)).rowcount > 0


def review_counts() -> dict[str, int]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT camera_id, COUNT(*) AS n FROM incidents "
            "WHERE status = 'needs_review' GROUP BY camera_id"
        ).fetchall()
    return {r["camera_id"]: r["n"] for r in rows}


# --- incidents ---------------------------------------------------------------

def incident_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "camera_id": row["camera_id"],
        "type": row["type"],
        "started_at": row["started_at"],
        "ended_at": row["ended_at"],
        "alarm_count": row["alarm_count"],
        "raised_by": row["raised_by"],
        "scores": {"supervised": row["score_supervised"], "unsupervised": row["score_unsupervised"]},
        "thresholds": {
            "supervised": row["threshold_supervised"],
            "unsupervised": row["threshold_unsupervised"],
        },
        "caption": row["caption"],
        "clip_url": row["clip_url"],
        "status": row["status"],
    }


def list_incidents(
    status: str | None = None, camera_id: str | None = None, raised_by: str | None = None
) -> list[dict[str, Any]]:
    where, args = [], []
    for col, val in (("status", status), ("camera_id", camera_id), ("raised_by", raised_by)):
        if val:
            where.append(f"{col} = ?")
            args.append(val)
    sql = "SELECT * FROM incidents"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY ended_at DESC"
    with connect() as conn:
        return [incident_from_row(r) for r in conn.execute(sql, args).fetchall()]


def get_incident(incident_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    return incident_from_row(row) if row else None


def insert_incident(i: dict[str, Any]) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO incidents (id, camera_id, type, started_at, ended_at, alarm_count, raised_by, "
            "score_supervised, score_unsupervised, threshold_supervised, threshold_unsupervised, "
            "caption, clip_url, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                i["id"], i["camera_id"], i["type"], i["started_at"], i["ended_at"], i["alarm_count"],
                i["raised_by"], i["scores"]["supervised"], i["scores"]["unsupervised"],
                i["thresholds"]["supervised"], i["thresholds"]["unsupervised"],
                i.get("caption"), i.get("clip_url"), i.get("status", "needs_review"), now_iso(),
            ),
        )


def set_incident_status(incident_id: str, status: str) -> bool:
    with connect() as conn:
        cur = conn.execute(
            "UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?",
            (status, now_iso(), incident_id),
        )
        return cur.rowcount > 0


# --- library -----------------------------------------------------------------

LIBRARY_COLUMNS = (
    "id", "title", "dataset_id", "dataset_name", "anomaly_types", "origin", "original_name",
    "file_path", "thumb_path", "duration_s", "width", "height", "fps", "size_bytes", "created_at",
)


def library_from_row(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["anomaly_types"] = json.loads(d["anomaly_types"] or "[]")
    return d


def list_library(dataset_id: str | None = None, anomaly_type: str | None = None) -> list[dict[str, Any]]:
    sql, args = "SELECT * FROM library_videos", []
    where = []
    if dataset_id:
        where.append("dataset_id = ?")
        args.append(dataset_id)
    if anomaly_type:
        where.append("EXISTS (SELECT 1 FROM json_each(anomaly_types) WHERE value = ?)")
        args.append(anomaly_type)
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY dataset_id, title"
    with connect() as conn:
        return [library_from_row(r) for r in conn.execute(sql, args).fetchall()]


def get_library_video(video_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute("SELECT * FROM library_videos WHERE id = ?", (video_id,)).fetchone()
    return library_from_row(row) if row else None


def upsert_library_video(v: dict[str, Any]) -> None:
    v = {"created_at": now_iso(), **v, "anomaly_types": json.dumps(v.get("anomaly_types", []))}
    cols = [c for c in LIBRARY_COLUMNS if c in v]
    updates = ", ".join(f"{c} = excluded.{c}" for c in cols if c not in ("id", "created_at"))
    with connect() as conn:
        conn.execute(
            f"INSERT INTO library_videos ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)}) "
            f"ON CONFLICT(id) DO UPDATE SET {updates}",
            [v[c] for c in cols],
        )


def delete_library_video(video_id: str) -> bool:
    with connect() as conn:
        return conn.execute("DELETE FROM library_videos WHERE id = ?", (video_id,)).rowcount > 0


def library_counts() -> dict[str, int]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT dataset_id, COUNT(*) AS n FROM library_videos "
            "WHERE origin = 'catalog' GROUP BY dataset_id"
        ).fetchall()
    return {r["dataset_id"]: r["n"] for r in rows}
