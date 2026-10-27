"""Alert rule and incidents.

A score must stay above its threshold for ALERT_SUSTAIN_SECONDS. Then an
incident is raised (or the open one extended): while the same camera and class
keep crossing the threshold within ALERT_COOLDOWN_SECONDS, they merge into that
incident instead of raising new ones. Supervised classes and the scene normality
score are tracked separately; when both fire on one camera at the same time they
share one incident raised by "both".

Every incident gets a thumbnail with the detections drawn, and a 10 second
H.264 clip (5 s before the alert, 5 s after) recorded from the stream history.
"""

from __future__ import annotations

import logging
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any

import cv2

from . import config, db, media, overlay
from .detectors import SUPERVISED_CLASSES
from .events import bus

if TYPE_CHECKING:
    from .pipeline import CameraState, Pipeline

log = logging.getLogger("veghe.alerts")

UNSUP = "unsupervised"
KEYS = SUPERVISED_CLASSES + (UNSUP,)


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts).isoformat(timespec="seconds")


@dataclass
class Episode:
    above_since: float | None = None
    last_above: float = 0.0
    incident_id: str | None = None
    counted_second: int = -1


@dataclass
class Open:
    """An incident that can still grow."""

    incident: dict[str, Any]
    keys: set[str] = field(default_factory=set)
    last_above: float = 0.0
    last_pushed: float = 0.0


class AlertEngine:
    def __init__(self, pipeline: Pipeline) -> None:
        self.pipeline = pipeline
        self.episodes: dict[tuple[str, str], Episode] = {}
        self.open: dict[str, Open] = {}  # incident id -> open incident
        self.lock = threading.Lock()

    @staticmethod
    def thresholds(cam: dict[str, Any]) -> dict[str, float]:
        return {**config.DEFAULT_THRESHOLDS, **{k: float(v) for k, v in (cam.get("thresholds") or {}).items()}}

    def live(self, camera_id: str) -> list[dict[str, Any]]:
        """Classes above threshold right now on this camera, for the Live page."""
        now = time.time()
        out = []
        with self.lock:
            for (cid, key), ep in self.episodes.items():
                if cid == camera_id and ep.above_since is not None and now - ep.last_above < 1.5:
                    out.append({"key": key, "incident_id": ep.incident_id,
                                "above_threshold_s": round(ep.last_above - ep.above_since, 1)})
        return out

    def update(self, cam: dict[str, Any], st: CameraState, frame: Any) -> None:
        ts = frame.timestamp
        thr = self.thresholds(cam)
        sup = self.pipeline.class_scores(st)
        values = {**sup, UNSUP: st.unsup_score}
        with self.lock:
            for key in KEYS:
                ep = self.episodes.setdefault((st.camera_id, key), Episode())
                if values[key] >= thr[key]:
                    if ep.above_since is None:
                        ep.above_since = ts
                    ep.last_above = ts
                    inc = self.open.get(ep.incident_id or "")
                    if inc is not None:
                        self._grow(inc, key, ep, cam, st, sup, thr, ts)
                    elif ts - ep.above_since >= config.ALERT_SUSTAIN_SECONDS:
                        self._raise(key, ep, cam, st, sup, thr, ts, frame)
                else:
                    ep.above_since = None
            for inc_id in [i for i, o in self.open.items()
                           if o.incident["camera_id"] == st.camera_id
                           and ts - o.last_above > config.ALERT_COOLDOWN_SECONDS]:
                self._close(inc_id)

    # --- incident lifecycle (called with self.lock held) ----------------------

    def _find_partner(self, camera_id: str, key: str) -> Open | None:
        """An open incident on the same camera from the other model family, to merge with."""
        family = UNSUP if key == UNSUP else "supervised"
        for o in self.open.values():
            if o.incident["camera_id"] != camera_id:
                continue
            fam = UNSUP if o.incident["raised_by"] == UNSUP else "supervised"
            if fam != family and o.incident["raised_by"] != "both":
                return o
        return None

    def _raise(self, key: str, ep: Episode, cam: dict, st: CameraState, sup: dict[str, float],
               thr: dict[str, float], ts: float, frame: Any) -> None:
        partner = self._find_partner(st.camera_id, key)
        if partner is not None:
            ep.incident_id = partner.incident["id"]
            ep.counted_second = int(ts)
            self._grow(partner, key, ep, cam, st, sup, thr, ts, merging=True)
            return
        finding = st.unsup_finding
        best_sup = max(SUPERVISED_CLASSES, key=lambda c: sup[c])
        if key == UNSUP:
            itype = finding.reason if finding else "other"
            caption = finding.text if finding else "Scene differs from what was learned"
            highlight = finding.track_id if finding else None
            sup_cls = best_sup
        else:
            itype, sup_cls, highlight = key, key, None
            caption = self.pipeline.class_note(st, key) or f"{key.replace('_', ' ').capitalize()} model above threshold"
        inc_id = f"inc-{time.strftime('%Y%m%d-%H%M%S', time.localtime(ts))}-{uuid.uuid4().hex[:4]}"
        incident = {
            "id": inc_id, "camera_id": st.camera_id, "type": itype,
            "started_at": iso(ep.above_since or ts), "ended_at": iso(ts), "alarm_count": 1,
            "raised_by": UNSUP if key == UNSUP else "supervised",
            "scores": {"supervised": round(sup[sup_cls], 3), "unsupervised": round(st.unsup_score, 3)},
            "thresholds": {"supervised": thr[sup_cls], "unsupervised": thr[UNSUP]},
            "caption": caption, "clip_url": None, "thumbnail_url": f"/api/incidents/{inc_id}/thumbnail",
            "reason": finding.reason if finding and st.unsup_score >= thr[UNSUP] else None,
            "details": {"class_scores": {c: round(v, 3) for c, v in sup.items()},
                        "alert_at": iso(ts), "keys": [key]},
            "status": "needs_review",
        }
        if key != UNSUP and finding and st.unsup_score >= thr[UNSUP]:
            incident["raised_by"] = "both"
            incident["caption"] = f"{caption}. Scene: {finding.text}"
        ep.incident_id = inc_id
        ep.counted_second = int(ts)
        self.open[inc_id] = Open(incident, {key}, ts, ts)
        self._thumbnail(inc_id, frame.image, st, highlight, incident["caption"])
        db.save_incident(incident)
        bus.publish({"type": "incident.created", "incident": db.get_incident(inc_id)})
        log.info("incident %s on %s: %s (%s)", inc_id, st.camera_id, itype, incident["raised_by"])
        threading.Thread(target=self._record_clip, args=(inc_id, st.camera_id, ts), daemon=True,
                         name=f"clip-{inc_id}").start()

    def _grow(self, o: Open, key: str, ep: Episode, cam: dict, st: CameraState, sup: dict[str, float],
              thr: dict[str, float], ts: float, merging: bool = False) -> None:
        inc = o.incident
        o.last_above = ts
        inc["ended_at"] = iso(ts)
        if int(ts) != ep.counted_second:
            ep.counted_second = int(ts)
            inc["alarm_count"] += 1
        if key not in o.keys:
            o.keys.add(key)
            inc["details"]["keys"] = sorted(o.keys)
        families = {UNSUP if k == UNSUP else "supervised" for k in o.keys}
        if len(families) == 2:
            inc["raised_by"] = "both"
        if key == UNSUP:
            inc["scores"]["unsupervised"] = round(max(inc["scores"]["unsupervised"] or 0, st.unsup_score), 3)
            f = st.unsup_finding
            if f and merging:
                inc["reason"] = f.reason
                inc["caption"] = f"{inc['caption']}. Scene: {f.text}"
            elif f and f.reason not in inc["details"].setdefault("reasons", [inc["reason"]]):
                # A new kind of rarity while the incident is open (a fall after an odd object): say so.
                inc["details"]["reasons"].append(f.reason)
                inc["caption"] = f"{inc['caption']}. Then: {f.text}"
                merging = True  # push the change right away"
        else:
            if inc["type"] not in SUPERVISED_CLASSES or sup[key] > (inc["scores"]["supervised"] or 0):
                if inc["type"] not in SUPERVISED_CLASSES:
                    # The supervised class names the event more precisely than the scene reason.
                    note = self.pipeline.class_note(st, key)
                    inc["caption"] = f"{note}. Scene: {inc['caption']}" if note else inc["caption"]
                    inc["type"] = key
                inc["scores"]["supervised"] = round(sup[key], 3)
                inc["thresholds"]["supervised"] = thr[key]
        if merging or ts - o.last_pushed >= 1.0:
            o.last_pushed = ts
            db.save_incident(inc)
            bus.publish({"type": "incident.updated", "incident": db.get_incident(inc["id"])})

    def _close(self, inc_id: str) -> None:
        o = self.open.pop(inc_id)
        for ep in self.episodes.values():
            if ep.incident_id == inc_id:
                ep.incident_id = None
        db.save_incident(o.incident)
        bus.publish({"type": "incident.updated", "incident": db.get_incident(inc_id)})

    # --- media ---------------------------------------------------------------

    def _thumbnail(self, inc_id: str, image: Any, st: CameraState, highlight: int | None, caption: str) -> None:
        try:
            img = overlay.draw(image, st.objects, st.boxes, highlight, caption)
            cv2.imwrite(str(config.INCIDENTS_DIR / f"{inc_id}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        except Exception:
            log.exception("thumbnail for %s failed", inc_id)

    def _record_clip(self, inc_id: str, camera_id: str, alert_ts: float) -> None:
        """Collect 5 s of stream before and after the alert and encode them to H.264."""
        try:
            buf = self.pipeline.cameras.buffer(camera_id)
            if buf is None:
                return
            frames = buf.jpegs_since(alert_ts - config.CLIP_PRE_SECONDS)
            time.sleep(config.CLIP_POST_SECONDS + 0.3)
            buf = self.pipeline.cameras.buffer(camera_id) or buf
            last = frames[-1][0] if frames else alert_ts - config.CLIP_PRE_SECONDS
            frames += [f for f in buf.jpegs_since(last) if f[0] <= alert_ts + config.CLIP_POST_SECONDS]
            if len(frames) < 4:
                log.warning("clip for %s: only %d frames", inc_id, len(frames))
                return
            duration = max(frames[-1][0] - frames[0][0], 0.5)
            fps = max(1.0, (len(frames) - 1) / duration)
            dst = config.INCIDENTS_DIR / f"{inc_id}.mp4"
            tmp = dst.with_suffix(".tmp.mp4")
            proc = subprocess.run(
                [media.FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg",
                 "-framerate", f"{fps:.3f}", "-i", "-", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart", "-an", str(tmp)],
                input=b"".join(j for _, j in frames), capture_output=True, timeout=120,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if proc.returncode != 0:
                log.error("clip for %s failed: %s", inc_id, proc.stderr.decode(errors="replace")[-300:])
                return
            tmp.replace(dst)
            with self.lock:
                o = self.open.get(inc_id)
                if o is not None:
                    o.incident["clip_url"] = f"/api/incidents/{inc_id}/clip"
                    o.incident["details"]["clip_seconds"] = round(duration, 1)
                    db.save_incident(o.incident)
                else:
                    inc = db.get_incident(inc_id)
                    if inc is None:
                        return
                    inc["clip_url"] = f"/api/incidents/{inc_id}/clip"
                    inc["details"]["clip_seconds"] = round(duration, 1)
                    db.save_incident(inc)
            bus.publish({"type": "incident.updated", "incident": db.get_incident(inc_id)})
        except Exception:
            log.exception("clip for %s failed", inc_id)
