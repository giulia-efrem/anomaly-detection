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

DATA = Path(tempfile.mkdtemp(prefix="veghe-test-"))
os.environ["VEGHE_DATA_DIR"] = str(DATA)

import uvicorn  # noqa: E402

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
    assert [s["key"] for s in status["stages"]] == ["streams", "pose", "scoring", "captions"]


# --- incidents ----------------------------------------------------------------


def test_incidents_seeded_and_patch(client: httpx.Client) -> None:
    incidents = client.get("/api/incidents").json()
    assert {i["id"] for i in incidents} == {"inc-0141", "inc-0140", "inc-0139", "inc-0138"}
    first = incidents[0]
    assert set(first) == {
        "id", "camera_id", "type", "started_at", "ended_at", "alarm_count", "raised_by",
        "scores", "thresholds", "caption", "clip_url", "status",
    }
    assert first["id"] == "inc-0141"  # newest first

    r = client.patch("/api/incidents/inc-0138", json={"status": "confirmed"})
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    assert client.get("/api/incidents/inc-0138").json()["status"] == "confirmed"
    assert [i["id"] for i in client.get("/api/incidents", params={"status": "confirmed"}).json()] == ["inc-0138"]
    assert len(client.get("/api/incidents", params={"raised_by": "both"}).json()) == 2

    assert client.patch("/api/incidents/inc-0138", json={"status": "needs_review"}).status_code == 200
    assert client.patch("/api/incidents/inc-0138", json={"status": "maybe"}).status_code == 422
    assert client.patch("/api/incidents/nope", json={"status": "confirmed"}).status_code == 404
    assert client.get("/api/incidents/nope").status_code == 404


# --- cameras ------------------------------------------------------------------


def test_camera_crud_stream_and_snapshot(client: httpx.Client, base: str, sample_video: Path) -> None:
    r = client.post("/api/cameras", json={"name": "Test cam", "source_type": "file", "source": str(sample_video)})
    assert r.status_code == 201, r.text
    cam = r.json()
    assert cam["stream_url"] == f"/api/cameras/{cam['id']}/stream"
    assert cam["supervised"] == "off" and cam["unsupervised"] == "collecting"

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

    snap = client.get(f"/api/cameras/{cam['id']}/snapshot")
    assert snap.headers["content-type"] == "image/jpeg"
    img = cv2.imdecode(np.frombuffer(snap.content, np.uint8), cv2.IMREAD_COLOR)
    assert img.shape[1] == 960  # resized to the stream width

    r = client.patch(f"/api/cameras/{cam['id']}", json={"name": "Renamed"})
    assert r.status_code == 200 and r.json()["name"] == "Renamed"
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
    assert {"ur-fall", "fight-surv", "avenue", "ucsd"} <= ids
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
            data={"anomaly_types": "fall"},
        )
    assert r.status_code == 202, r.text
    job = _wait_job(client, r.json()[0]["id"])
    assert job["stage"] == "done", job
    videos = client.get("/api/library", params={"dataset_id": "my-videos"}).json()
    up = next(v for v in videos if v["origin"] == "upload")
    assert up["anomaly_types"] == ["fall"] and up["width"] == 320 and up["duration_s"]
    assert client.get("/api/library", params={"anomaly_type": "fall"}).json()

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
    assert client.delete(f"/api/library/{up['id']}").status_code == 409
    client.delete(f"/api/cameras/{cam_id}")
    assert client.delete(f"/api/library/{up['id']}").status_code == 204
    assert client.get(f"/api/library/{up['id']}").status_code == 404
    assert client.delete(f"/api/library/{linked['id']}").status_code == 204


# --- websocket ----------------------------------------------------------------


def test_websocket_pushes_updates(base: str, client: httpx.Client) -> None:
    from websockets.sync.client import connect

    with connect(base.replace("http", "ws") + "/ws", open_timeout=5) as ws:
        assert json.loads(ws.recv(timeout=5)) == {"type": "hello"}
        client.patch("/api/incidents/inc-0140", json={"status": "false_alarm"})
        deadline = time.time() + 5
        while time.time() < deadline:
            msg = json.loads(ws.recv(timeout=5))
            if msg["type"] == "incident.updated":
                assert msg["incident"]["id"] == "inc-0140" and msg["incident"]["status"] == "false_alarm"
                break
        else:
            raise AssertionError("no incident.updated event")
    client.patch("/api/incidents/inc-0140", json={"status": "needs_review"})
