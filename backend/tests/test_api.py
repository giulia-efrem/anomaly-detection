"""End-to-end tests for every endpoint against a real uvicorn server.

Uses a temporary data folder, so the real database and library are untouched.
Run from backend/:  .venv\\python.exe -m pytest -q
"""

from __future__ import annotations

import json
import os
import socket
import tempfile
import threading
import time
from pathlib import Path

import cv2
import httpx
import numpy as np
import pytest

DATA = Path(tempfile.mkdtemp(prefix="vad-test-"))
os.environ["VAD_DATA_DIR"] = str(DATA)
# Use the downloaded models when they exist, so the live pipeline runs during the tests too.
REAL_MODELS = Path(__file__).resolve().parents[2] / "data" / "models"
if REAL_MODELS.is_dir():
    os.environ["VAD_MODELS_DIR"] = str(REAL_MODELS)

import uvicorn  # noqa: E402

from app import config, db  # noqa: E402
from app.main import app  # noqa: E402


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _make_video(path: Path, frames: int = 50, size: tuple[int, int] = (320, 240)) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 25, size)
    for i in range(frames):
        img = np.full((size[1], size[0], 3), 40, np.uint8)
        cv2.circle(img, (10 + i * 5 % size[0], size[1] // 2), 20, (80, 200, 240), -1)
        out.write(img)
    out.release()
    return path


@pytest.fixture(scope="session")
def base() -> str:
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            if httpx.get(url + "/api/health").status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(0.1)
    yield url
    server.should_exit = True
    thread.join(timeout=5)


@pytest.fixture(scope="session")
def client(base: str) -> httpx.Client:
    with httpx.Client(base_url=base, timeout=30) as c:
        yield c


@pytest.fixture(scope="session")
def sample_video() -> Path:
    return _make_video(DATA / "samples" / "moving-dot.mp4")


def _wait_job(client: httpx.Client, job_id: str, timeout: float = 60) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = next(j for j in client.get("/api/library/jobs").json() if j["id"] == job_id)
        if job["stage"] in ("done", "error"):
            return job
        time.sleep(0.3)
    raise AssertionError(f"job {job_id} did not finish")


def _incident(inc_id: str, camera_id: str = "cam-x", type_: str = "fight", raised_by: str = "supervised",
              ended: str = "2026-10-27T10:00:00") -> dict:
    return {
        "id": inc_id, "camera_id": camera_id, "type": type_, "started_at": ended, "ended_at": ended,
        "alarm_count": 1, "raised_by": raised_by, "scores": {"supervised": 0.9, "unsupervised": 0.2},
        "thresholds": {"supervised": 0.6, "unsupervised": 0.6}, "caption": "test", "clip_url": None,
        "thumbnail_url": None, "reason": None, "details": {"keys": [type_]},
    }


@pytest.fixture(scope="session")
def incidents(base: str) -> list[str]:
    """Three incidents written straight to the database (the pipeline raises real ones)."""
    rows = [
        _incident("inc-t1", type_="fight", ended="2026-10-27T10:00:00"),
        _incident("inc-t2", type_="unusual_object", raised_by="unsupervised", ended="2026-10-27T10:05:00"),
        _incident("inc-t3", type_="car_accident", raised_by="both", ended="2026-10-27T10:10:00"),
    ]
    for r in rows:
        db.save_incident(r)
    return [r["id"] for r in rows]


def _wait_status(client: httpx.Client, camera_id: str, status: str, timeout: float = 15) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if client.get(f"/api/cameras/{camera_id}").json()["status"] == status:
            return
        time.sleep(0.2)
    raise AssertionError(f"camera {camera_id} never became {status}")


# --- system -------------------------------------------------------------------


def test_health_and_status(client: httpx.Client) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}
    status = client.get("/api/status").json()
    assert status["camera_slots"]["total"] == 10
    assert [s["key"] for s in status["stages"]] == ["streams", "tracking", "supervised", "normality"]


def test_models_listed_with_licenses(client: httpx.Client) -> None:
    data = client.get("/api/models").json()
    ids = {m["id"] for m in data["models"]}
    assert {"yolo11s", "yolo11n-pose", "fight-x3d", "crash-r3d18", "fire-yolov8n"} == ids
    for m in data["models"]:
        assert m["license"] and m["source_url"].startswith("https://")
    pretrained = {c for m in data["models"] if m["family"] == "pretrained" for c in m["classes"]}
    assert pretrained == {"fight", "car_accident", "fire_explosion"}


def test_system_status(client: httpx.Client) -> None:
    s = client.get("/api/system").json()
    assert set(s) == {"cameras", "gpu", "models", "analysis_fps", "issues"}
    assert s["models"]["total"] == 5 and isinstance(s["issues"], list)
    assert s["cameras"]["online"] <= s["cameras"]["total"]


# --- incidents ----------------------------------------------------------------


def test_incidents_list_patch_and_feedback(client: httpx.Client, incidents: list[str]) -> None:
    listed = client.get("/api/incidents").json()
    assert [i["id"] for i in listed][:3] == ["inc-t3", "inc-t2", "inc-t1"]  # newest first
    assert set(listed[0]) == {
        "id", "camera_id", "type", "started_at", "ended_at", "alarm_count", "raised_by", "scores", "thresholds",
        "caption", "clip_url", "status", "thumbnail_url", "reason", "details", "severity",
    }
    assert {i["id"]: i["severity"] for i in listed[:3]} == {"inc-t3": "critical", "inc-t2": "warning", "inc-t1": "critical"}
    assert [i["id"] for i in client.get("/api/incidents", params={"type": "car_accident"}).json()] == ["inc-t3"]
    assert [i["id"] for i in client.get("/api/incidents", params={"raised_by": "unsupervised"}).json()] == ["inc-t2"]
    assert client.get("/api/incidents", params={"type": "fall"}).status_code == 422  # removed class
    assert client.get("/api/incidents", params={"type": "shooting"}).status_code == 422  # removed class

    r = client.patch("/api/incidents/inc-t1", json={"status": "confirmed"})
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    assert [i["id"] for i in client.get("/api/incidents", params={"status": "confirmed"}).json()] == ["inc-t1"]
    assert db.feedback_counts().get("confirmed") == 1  # stored as a label for retraining

    r = client.post("/api/incidents/inc-t2/normal")
    assert r.status_code == 200 and r.json()["status"] == "false_alarm"
    assert db.feedback_counts().get("normal") == 1
    assert client.get("/api/models").json()["feedback"]["normal"] == 1

    assert client.patch("/api/incidents/inc-t1", json={"status": "needs_review"}).status_code == 200
    assert client.patch("/api/incidents/inc-t1", json={"status": "maybe"}).status_code == 422
    assert client.patch("/api/incidents/nope", json={"status": "confirmed"}).status_code == 404
    assert client.get("/api/incidents/nope").status_code == 404
    assert client.get("/api/incidents/inc-t1/clip").status_code == 404  # no clip recorded
    assert client.get("/api/incidents/inc-t1/thumbnail").status_code == 404


# --- cameras ------------------------------------------------------------------


def test_camera_crud_stream_and_snapshot(client: httpx.Client, base: str, sample_video: Path) -> None:
    r = client.post("/api/cameras", json={"name": "Test cam", "source_type": "file", "source": str(sample_video)})
    assert r.status_code == 201, r.text
    cam = r.json()
    assert cam["stream_url"] == f"/api/cameras/{cam['id']}/stream"
    assert cam["supervised"] == "on" and cam["unsupervised"] == "learning"
    assert cam["thresholds"] == config.DEFAULT_THRESHOLDS and cam["learn_seconds"] == config.LEARN_SECONDS

    _wait_status(client, cam["id"], "live")

    # MJPEG: read a few parts, then hang up.
    with httpx.stream("GET", f"{base}/api/cameras/{cam['id']}/stream", timeout=10) as s:
        assert s.headers["content-type"].startswith("multipart/x-mixed-replace")
        data = b""
        for chunk in s.iter_bytes():
            data += chunk
            if data.count(b"--frame") >= 3:
                break
    assert data.count(b"\xff\xd8") >= 2  # JPEG start markers

    # The same stream with the analysis drawn in.
    with httpx.stream("GET", f"{base}/api/cameras/{cam['id']}/stream", params={"overlay": 1}, timeout=10) as s:
        data = b""
        for chunk in s.iter_bytes():
            data += chunk
            if data.count(b"--frame") >= 2:
                break
    assert b"\xff\xd8" in data

    snap = client.get(f"/api/cameras/{cam['id']}/snapshot")
    assert snap.headers["content-type"] == "image/jpeg"
    img = cv2.imdecode(np.frombuffer(snap.content, np.uint8), cv2.IMREAD_COLOR)
    assert img.shape[1] == 960  # resized to the stream width

    r = client.patch(f"/api/cameras/{cam['id']}", json={"name": "Renamed"})
    assert r.status_code == 200 and r.json()["name"] == "Renamed"

    # Detection settings
    r = client.patch(f"/api/cameras/{cam['id']}", json={"thresholds": {"fight": 0.7}, "supervised": "off"})
    assert r.status_code == 200
    assert r.json()["thresholds"]["fight"] == 0.7
    assert "shooting" not in r.json()["thresholds"]
    assert client.patch(f"/api/cameras/{cam['id']}", json={"thresholds": {"shooting": 0.5}}).status_code == 422
    assert r.json()["supervised"] == "off"
    assert client.patch(f"/api/cameras/{cam['id']}", json={"thresholds": {"fight": 1.5}}).status_code == 422
    assert client.patch(f"/api/cameras/{cam['id']}", json={"thresholds": {"fall": 0.5}}).status_code == 422
    assert client.patch(f"/api/cameras/{cam['id']}", json={"unsupervised": "off"}).json()["unsupervised"] == "off"
    r = client.patch(f"/api/cameras/{cam['id']}", json={"unsupervised": "learning", "learn_seconds": 60})
    assert r.json()["unsupervised"] == "learning" and r.json()["learn_seconds"] == 60

    # Scene normality: summary, heatmap, reset
    n = client.get(f"/api/cameras/{cam['id']}/normality").json()
    assert n["state"] == "learning" and n["grid"] == [16, 9] and "unusual_object" in n["reasons"]
    heat = client.get(f"/api/cameras/{cam['id']}/normality/heatmap", params={"cls": "person"})
    assert heat.headers["content-type"] == "image/jpeg"
    assert client.post(f"/api/cameras/{cam['id']}/normality/reset").json()["learning_progress"] == 0
    assert any(c["id"] == cam["id"] for c in client.get("/api/cameras").json())
    assert client.post(f"/api/cameras/{cam['id']}/restart").status_code == 200

    assert client.delete(f"/api/cameras/{cam['id']}").status_code == 204
    assert client.get(f"/api/cameras/{cam['id']}").status_code == 404
    assert client.delete(f"/api/cameras/{cam['id']}").status_code == 404


def test_camera_validation(client: httpx.Client) -> None:
    bad = [
        {"name": "x", "source_type": "file", "source": "C:/does/not/exist.mp4"},
        {"name": "x", "source_type": "file"},
        {"name": "x", "source_type": "webcam", "source": "front"},
        {"name": "x", "source_type": "rtsp", "source": "not a url"},
        {"name": "x", "source_type": "file", "library_video_id": "missing"},
        {"name": "", "source_type": "webcam", "source": "0"},
        {"name": "x", "source_type": "ftp", "source": "ftp://x"},
    ]
    for body in bad:
        assert client.post("/api/cameras", json=body).status_code == 422, body


def test_unreachable_rtsp_goes_offline(client: httpx.Client, base: str) -> None:
    cam = client.post(
        "/api/cameras", json={"name": "Dead", "source_type": "rtsp", "source": "rtsp://127.0.0.1:9/none"}
    ).json()
    _wait_status(client, cam["id"], "offline", timeout=40)
    assert httpx.get(f"{base}/api/cameras/{cam['id']}/stream", timeout=15).status_code == 503
    assert client.get(f"/api/cameras/{cam['id']}/snapshot").status_code == 503
    client.delete(f"/api/cameras/{cam['id']}")


def test_camera_slot_limit(client: httpx.Client, sample_video: Path) -> None:
    made = []
    try:
        while len(client.get("/api/cameras").json()) < 10:
            r = client.post("/api/cameras", json={"name": "Fill", "source_type": "file", "source": str(sample_video)})
            assert r.status_code == 201
            made.append(r.json()["id"])
        r = client.post("/api/cameras", json={"name": "One too many", "source_type": "file", "source": str(sample_video)})
        assert r.status_code == 409
    finally:
        for cid in made:
            client.delete(f"/api/cameras/{cid}")


# --- library ------------------------------------------------------------------


def test_catalog_and_jobs(client: httpx.Client) -> None:
    cat = client.get("/api/library/catalog").json()
    ids = {d["id"] for d in cat["datasets"]}
    assert {"ur-fall", "fight-surv", "avenue", "ucsd", "demo-clips"} <= ids
    assert "shooting" not in cat["anomaly_types"]
    assert "fall" not in cat["anomaly_types"]
    demo = next(d for d in cat["datasets"] if d["id"] == "demo-clips")
    assert len(demo["credits"]) == demo["clip_count"] and all(c["author"] and c["license"] for c in demo["credits"])
    for d in cat["datasets"]:
        assert d["size_bytes"] < 2_000_000_000 and d["license"] and d["source_url"].startswith("http")
        assert "download" not in d
    assert isinstance(client.get("/api/library/jobs").json(), list)
    assert client.post("/api/library/download", json={"dataset_id": "nope"}).status_code == 404
    assert client.post("/api/library/download", json={}).status_code == 422
    assert client.post("/api/library/download", json={"dataset_id": "ur-fall", "url": "http://x"}).status_code == 422
    assert client.post("/api/library/download", json={"url": "ftp://example.org/a.mp4"}).status_code == 422


def test_upload_url_download_use_and_delete(client: httpx.Client, base: str, sample_video: Path) -> None:
    # Upload
    with sample_video.open("rb") as f:
        r = client.post(
            "/api/library/upload",
            files={"files": ("moving dot.mp4", f, "video/mp4")},
            data={"anomaly_types": "unusual_posture"},
        )
    assert r.status_code == 202, r.text
    job = _wait_job(client, r.json()[0]["id"])
    assert job["stage"] == "done", job
    videos = client.get("/api/library", params={"dataset_id": "my-videos"}).json()
    up = next(v for v in videos if v["origin"] == "upload")
    assert up["anomaly_types"] == ["unusual_posture"] and up["width"] == 320 and up["duration_s"]
    assert client.get("/api/library", params={"anomaly_type": "unusual_posture"}).json()
    with sample_video.open("rb") as f:
        r = client.post("/api/library/upload", files={"files": ("a.mp4", f, "video/mp4")}, data={"anomaly_types": "fall"})
    assert r.status_code == 422  # "fall" is no longer a class

    # The converted file is H.264, playable and range-requestable.
    head = client.get(up["video_url"], headers={"Range": "bytes=0-99"})
    assert head.status_code == 206 and len(head.content) == 100
    assert client.get(up["thumbnail_url"]).headers["content-type"] == "image/jpeg"
    cap = cv2.VideoCapture(str(DATA / "library" / "my-videos" / f"{up['id']}.mp4"))
    assert int(cap.get(cv2.CAP_PROP_FOURCC)).to_bytes(4, "little") in (b"avc1", b"h264", b"H264")
    cap.release()

    # Direct video URL (served by this same backend, so no internet needed)
    r = client.post("/api/library/download", json={"url": base + up["video_url"], "title": "From link"})
    assert r.status_code == 202
    job = _wait_job(client, r.json()["id"])
    assert job["stage"] == "done", job
    linked = next(v for v in client.get("/api/library").json() if v["title"] == "From link")
    assert linked["origin"] == "url" and linked["anomaly_types"] == ["normal"]

    # Bad upload type
    r = client.post("/api/library/upload", files={"files": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 422

    # Use as camera, then deleting the clip is refused until the camera is gone.
    cam = client.post("/api/cameras", json={"name": "From library", "source_type": "file", "library_video_id": up["id"]})
    assert cam.status_code == 201
    cam_id = cam.json()["id"]
    assert client.get(f"/api/library/{up['id']}").json()["used_by"] == [cam_id]

    # Teach the camera's scene model a normal clip (needs the downloaded models).
    if REAL_MODELS.is_dir():
        r = client.post(f"/api/cameras/{cam_id}/normality/learn", json={"library_video_id": up["id"]})
        assert r.status_code == 202, r.text
        deadline = time.time() + 120
        while time.time() < deadline:
            job = client.get(f"/api/cameras/{cam_id}/normality").json()["job"]
            if job["stage"] in ("done", "error"):
                break
            time.sleep(0.5)
        assert job["stage"] == "done", job
        assert job["seconds_added"] > 1
    assert client.delete(f"/api/library/{up['id']}").status_code == 409
    client.delete(f"/api/cameras/{cam_id}")
    assert client.delete(f"/api/library/{up['id']}").status_code == 204
    assert client.get(f"/api/library/{up['id']}").status_code == 404
    assert client.delete(f"/api/library/{linked['id']}").status_code == 204


# --- websocket ----------------------------------------------------------------


def test_websocket_pushes_updates(base: str, client: httpx.Client, incidents: list[str]) -> None:
    from websockets.sync.client import connect

    with connect(base.replace("http", "ws") + "/ws", open_timeout=5) as ws:
        assert json.loads(ws.recv(timeout=5)) == {"type": "hello"}
        client.patch("/api/incidents/inc-t3", json={"status": "false_alarm"})
        deadline = time.time() + 5
        while time.time() < deadline:
            msg = json.loads(ws.recv(timeout=5))
            if msg["type"] == "incident.updated":
                assert msg["incident"]["id"] == "inc-t3" and msg["incident"]["status"] == "false_alarm"
                break
        else:
            raise AssertionError("no incident.updated event")
    client.patch("/api/incidents/inc-t3", json={"status": "needs_review"})
