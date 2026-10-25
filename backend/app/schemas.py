"""API models. Camera and Incident follow the event contract in CLAUDE.md."""

from typing import Literal

from pydantic import BaseModel, Field

IncidentType = Literal["fight", "fall", "unusual_posture", "other"]
RaisedBy = Literal["supervised", "unsupervised", "both"]
IncidentStatus = Literal["needs_review", "confirmed", "false_alarm"]
SourceType = Literal["rtsp", "webcam", "file"]
StreamStatus = Literal["connecting", "live", "offline"]


class MethodScores(BaseModel):
    supervised: float | None
    unsupervised: float | None


class MethodThresholds(BaseModel):
    supervised: float
    unsupervised: float


class Incident(BaseModel):
    id: str
    camera_id: str
    type: IncidentType
    started_at: str
    ended_at: str
    alarm_count: int
    raised_by: RaisedBy
    scores: MethodScores
    thresholds: MethodThresholds
    caption: str | None
    clip_url: str | None
    status: IncidentStatus


class IncidentPatch(BaseModel):
    status: IncidentStatus


class Camera(BaseModel):
    # Event contract
    id: str
    name: str
    stream_url: str
    people_count: int
    to_review: int
    supervised: Literal["on", "off"]
    unsupervised: Literal["collecting", "learning", "ready", "off"]
    learning_progress: float | None
    # Source and runtime state
    source_type: SourceType
    source: str
    library_video_id: str | None
    status: StreamStatus
    position: int


class CameraCreate(BaseModel):
    id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,30}$")
    name: str = Field(min_length=1, max_length=60)
    source_type: SourceType
    source: str | None = Field(default=None, max_length=1000)
    library_video_id: str | None = None


class CameraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    source_type: SourceType | None = None
    source: str | None = Field(default=None, max_length=1000)
    library_video_id: str | None = None
    position: int | None = None


class LibraryVideo(BaseModel):
    id: str
    title: str
    dataset_id: str | None
    dataset_name: str | None
    anomaly_types: list[str]
    origin: Literal["catalog", "upload", "url", "reel"]
    original_name: str | None
    duration_s: float | None
    width: int | None
    height: int | None
    fps: float | None
    size_bytes: int | None
    created_at: str
    video_url: str
    thumbnail_url: str | None
    used_by: list[str]


class DownloadRequest(BaseModel):
    """Either a catalog dataset id or a direct video URL."""

    dataset_id: str | None = None
    url: str | None = Field(default=None, max_length=2000)
    title: str | None = Field(default=None, max_length=120)
    anomaly_types: list[str] = []
