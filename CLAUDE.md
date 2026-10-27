# Video anomaly detection dashboard

Web dashboard for video anomaly detection on multiple surveillance cameras,
built for a bachelor thesis. No product name and no logo anywhere. Two detector
families feed it:

- **Supervised**: pretrained public models for fight, car_accident and
  fire_explosion. The thesis model will join them as one more plugin.
- **Unsupervised**: learns per camera what is normal from normal footage only and
  flags anything rare, with a reason (unusual object, motion, posture, loitering,
  crowding).

Public repository: https://github.com/giulia-efrem/anomaly-detection

## Status

- Step 1: Live page with mock data. Done.
- Step 2: backend, real video (MJPEG), Test videos page, API-driven frontend. Done.
- Step 3: pretrained detectors, unsupervised model, live pipeline, alerts, incidents with clips. Done.
- Design v1: operator-console redesign, three supervised classes. Done (tag `design-pro-v1`).
- Next: the thesis model as a plugin; Compare models page (behind `FEATURE_COMPARE`).

## Machine

- Windows 11, NVIDIA GeForce RTX 4050 Laptop GPU, 6 GB VRAM (6141 MiB), driver 555.99 (CUDA 12.5).
- Python 3.12.15 in a project-local conda environment at `backend/.venv` (the system has
  no 3.11/3.12; created from the user's miniconda, nothing installed globally).
- PyTorch 2.14.1+cu126, Ultralytics 8.4, PyTorchVideo 0.1.5 (installed with `--no-deps`, then
  fvcore). Keep VRAM use under ~5 GB; all models together use about 1.1 GB.
- The GPU stays at about 12 W on the Balanced plan: with 7 cameras the pipeline analyses
  about 4 to 5 frames per second per camera (1 to 1.5 while another program uses the GPU).
  Stage timings: `GET /api/status` → `pipeline.stage_ms`.

## How to run

- One click: `start.bat` in the project root opens the backend (port 8000) and the
  frontend (port 5180) in two windows, then opens http://localhost:5180.
- Backend by hand: `cd backend` then `.venv\python.exe -m uvicorn app.main:app --port 8000`.
- Frontend by hand: `cd frontend` then `npm run dev` (proxies `/api` and `/ws` to :8000).
- Models (after cloning): `cd backend` then `.venv\python.exe scripts\download_models.py`.
  Everything about them: `backend/models/MODELS.md`.
- Demo cameras: `cd backend` then `.venv\python.exe -m app.demo` (backend stopped). Downloads the
  test datasets if missing, joins clips into reels, replaces all cameras with 7 virtual cameras
  and teaches the three unsupervised demo cameras their normal footage.
- Tests: `cd backend` then `.venv\python.exe -m pytest -q` (real uvicorn server, temp data folder,
  real models from `data/models` when present).
- Model check: `.venv\python.exe scripts\evaluate_clip_models.py fight fight-surv` (AUC, thresholds).
- Frontend checks: `npm run build`, `npm run lint` (oxlint).
- Screenshots: backend running, then in `frontend`:
  `npm run build` and `set PLAYWRIGHT_BROWSERS_PATH=0&& node scripts\screenshot.mjs <outDir>`.
  Playwright and its Chromium live in `frontend/node_modules`.
- Feature flags (build time, `frontend/.env.local`): `VITE_FEATURE_COMPARE=true` shows the
  Compare models page. Off by default (`src/features.ts`).
- Recreate the backend environment (only if `backend/.venv` is lost):
  `conda create -p backend\.venv -c conda-forge --override-channels python=3.12 pip`, then
  `backend\.venv\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126`,
  `backend\.venv\python.exe -m pip install --no-deps pytorchvideo==0.1.5` and
  `backend\.venv\python.exe -m pip install -r backend\requirements.txt`.
- Ultralytics settings live in `data/ultralytics` (`YOLO_CONFIG_DIR`, set in `app/config.py`).
  Scripts that import ultralytics must import `app.config` first.
- Environment variables: `VAD_DATA_DIR`, `VAD_MODELS_DIR` (tests use them).

## Architecture

```
camera source ──> CameraWorker thread (one per camera, app/cameras.py)
 (RTSP / webcam /     │ every ~1/12 s: resize to 960 px wide, JPEG encode
  video file)         v
                 FrameBuffer: last 24 frames + 7 s of JPEGs (for incident clips)
                      │                              │
     GET /api/cameras/{id}/stream            Pipeline thread (app/pipeline.py), ~5 fps per camera
     (?overlay=1 draws the analysis)          1. YOLO11s detection, batched over cameras
                                              2. ByteTrack per camera: ids, speed, age, class
                                              3. YOLO11n pose (every 3rd frame, people only)
                                              4. plugins, gated: fire (1/s)
                                                 └─ fight / crash windows → ClipWorker thread (16 frames)
                                              5. NormalityModel per camera: learn or score
                                              6. AlertEngine (app/alerts.py) → incidents, clips, WebSocket
```

- **Alert rule**: score above threshold for 2 s → incident; while the same camera and
  class keep crossing within 20 s they merge into it (`alarm_count` grows). A supervised
  and an unsupervised alert on one camera at once share one incident raised by `both`.
  Thresholds per camera and class (`cameras.thresholds`, defaults in `config.DEFAULT_THRESHOLDS`).
- **Severity**: `critical` for fight, car_accident and fire_explosion; `warning` for
  unsupervised alerts. Returned by the API (`incident.severity`).
- **Incident media and detail**: thumbnail with detections drawn (`data/incidents/<id>.jpg`),
  a 10 s H.264 clip, 5 s before and 5 s after the alert (`<id>.mp4`), and in `details`:
  `series` (scores from 10 s before the alert while it lasts), `detections` (objects in view
  at the alert), `class_scores`, `reasons`.
- **Feedback**: Confirm, False alarm and "This is normal" are stored in the `feedback` table
  with the clip path. "This is normal" also teaches the clip to the camera's unsupervised model.
- **Unsupervised model**: new cameras learn for `learn_seconds` (default 600) of live footage,
  skipping frames a supervised model flags; or learn faster than real time from a library clip
  (`POST /api/cameras/{id}/normality/learn`). Saved to `data/normality/<camera>.npz/.json`.
- **Streaming**: MJPEG keeps one HTTP connection open per camera and browsers allow six per
  host, so the frontend loads each stream from its own host name
  `http://<camera-id>.localhost:8000/...`. See `streamSrc` in `frontend/src/api/client.ts`.
- **Live updates**: `/ws` WebSocket. Events: `hello`, `camera.status`, `cameras.changed`,
  `camera.live` (per camera about once a second: frame timestamp, people, class scores,
  unsupervised score and reason, learning progress, active alerts, fps), `incident.created`,
  `incident.updated`, `normality.job`, `library.job`, `library.changed`. The frontend
  (`src/api/live.ts`) patches TanStack Query caches; `camera.live` lives in the `['live']` key.
- **System status**: `GET /api/system` (cameras online, GPU load and VRAM from nvidia-smi,
  models loaded, open issues) drives the top bar health text and the bottom status bar.
- **Storage**: SQLite at `data/vad.db` (tables `cameras`, `incidents`, `feedback`,
  `library_videos`, `meta`). `db._migrate` upgrades older databases on start.

## Folders

- `backend/app/` — `main.py`, `config.py`, `db.py`, `schemas.py`, `cameras.py`, `events.py`,
  `library.py`, `media.py`, `demo.py`, `model_files.py` (manifest and downloads),
  `pipeline.py`, `alerts.py`, `normality.py`, `overlay.py`, `detectors/` (plugin interface and
  the three pretrained plugins), `routes/` (cameras, incidents, library, models, system).
- `backend/models/` — `models.json` (pinned, hash-checked manifest) and `MODELS.md`.
- `backend/scripts/` — `download_models.py`, `evaluate_clip_models.py`.
- `backend/tests/` — end-to-end API tests, unsupervised model tests.
- `data/` (gitignored) — `vad.db`, `models/`, `normality/`, `incidents/`, `downloads/`,
  `library/<dataset>/`, `uploads/`, `ultralytics/`.
- `frontend/src/api/` — fetch client, query hooks, WebSocket sync.
- `frontend/src/lib/` — `format.ts`, `classes.ts` (labels, severity), `live.ts`, `prefs.ts`
  (per-browser settings), `useNow.ts`.
- `frontend/src/ui/` — component kit: Button, Chip and Count, Panel, PanelHeader and PageBar,
  Field/Input/Select, Dialog, Drawer, Toast, Tabs, ToggleGroup and ToggleButton, States.
- `frontend/src/components/` — Layout (app shell), Sidebar, TopBar, StatusBar, VideoTile,
  CameraStream, AlarmQueue, IncidentDrawer, ScoreBar, ScoreChart, SeverityIcon, CameraDialog,
  CameraSettingsDialog (thresholds, unsupervised model, heatmap), VideoDialog, `library/`.
- `frontend/src/pages/` — Live, Incidents (TanStack Table), Cameras, Test videos, Training
  (models and labels), PlaceholderPages (Compare models behind the flag, not found).

## API

| Method and path | Purpose |
| --- | --- |
| `GET /api/health`, `GET /api/status` | Health; pipeline stages, fps, stage timings, camera slots |
| `GET /api/system` | Cameras online, GPU load and VRAM, models loaded, open issues |
| `GET, POST /api/cameras`; `GET, PATCH, DELETE /api/cameras/{id}` | Camera CRUD (max 10); PATCH also takes `supervised`, `unsupervised`, `thresholds`, `learn_seconds` |
| `GET /api/cameras/{id}/stream?overlay=1` | MJPEG, ~12 fps, 960 px wide, optionally with boxes and poses |
| `GET /api/cameras/{id}/snapshot`, `POST /api/cameras/{id}/restart` | Latest JPEG; reconnect now |
| `GET /api/cameras/{id}/normality`, `GET .../normality/heatmap?cls=` | What the unsupervised model learned; heatmap JPEG |
| `POST /api/cameras/{id}/normality/learn`, `POST .../normality/reset` | Learn from a library clip; reset learning |
| `GET /api/incidents` | List (filters: status, camera_id, raised_by, type) |
| `GET, PATCH /api/incidents/{id}`; `POST /api/incidents/{id}/normal` | One incident; set status (stores feedback); "This is normal" |
| `GET /api/incidents/{id}/clip`, `/thumbnail` | 10 s H.264 clip; JPEG with detections |
| `GET /api/models` | Every model: license, loaded, device, VRAM; GPU memory; feedback counts |
| `GET /api/library` | Clips (filters: dataset_id, anomaly_type) |
| `GET /api/library/catalog`, `GET /api/library/jobs` | Datasets with import state and credits; background jobs |
| `POST /api/library/download` | `{dataset_id}` or `{url, title?, anomaly_types?}` |
| `POST /api/library/upload` | Multipart `files[]`, optional `anomaly_types` |
| `GET /api/library/{id}`, `/video`, `/thumbnail`; `DELETE /api/library/{id}` | One clip; files; delete (409 while a camera uses it) |
| `WS /ws` | Live updates |

## Event contract

```ts
Incident {
  id, camera_id,
  type: "fight" | "car_accident" | "fire_explosion"                    // supervised
      | "unusual_object" | "unusual_motion" | "unusual_posture"
      | "loitering" | "crowding"                                      // unsupervised
      | "other",
  started_at, ended_at, alarm_count,
  raised_by: "supervised" | "unsupervised" | "both",
  scores: { supervised: number | null, unsupervised: number | null },
  thresholds: { supervised: number, unsupervised: number },
  caption: string | null,    // model note, or the unsupervised reason text
  clip_url: string | null,
  status: "needs_review" | "confirmed" | "false_alarm"
}

Camera {
  id, name, stream_url, people_count, to_review,
  supervised: "on" | "off",
  unsupervised: "collecting" | "learning" | "ready" | "off",
  learning_progress: number | null
}
```

The API's Incident adds `severity` ("critical" | "warning"), `thumbnail_url`, `reason` and
`details` (see Architecture). The API's Camera adds `source_type`, `source`,
`library_video_id`, `status`, `position`, `thresholds` (every class plus `unsupervised`) and
`learn_seconds`.

## Design system

Operator console, modelled on professional video management clients. Utilitarian, dense
and calm, for someone who watches it for 8 hours.

| Token (Tailwind) | Value | Use |
| --- | --- | --- |
| `page` | `#0B0E12` | page background |
| `panel` | `#12161C` | sidebar, bars, panels |
| `raised` | `#181D24` | hover, selected rows, controls |
| `field` | `#0E1217` | inputs, bar tracks |
| `video` | `#050608` | video wall |
| `line` | `#232A33` | every 1px border |
| `ink` | `#E6E9ED` | text |
| `ink-2` | `#A3ACB8` | secondary text |
| `muted` | `#6B7480` | muted text |
| `accent` | `#4C8DFF` | selection and focus only |
| `crit` | `#E5484D` | status: critical, alerting tile |
| `warn` | `#E2A336` | status: warning |
| `ok` | `#3DB37A` | status: ok |
| `sup` | `#C9A25B` | supervised, only in score bars and charts |
| `unsup` | `#6E9FD6` | unsupervised, only in score bars and charts |

- Fonts: **IBM Plex Sans** for UI, **IBM Plex Mono** for times, ids and numbers (Google Fonts).
  Sizes 12, 13, 14, 16 and 20 only. Weights 400, 500 and 600.
- Radius: panels 4 (`rounded`), controls 3 (`rounded-md`), badges and video 2 (`rounded-sm`).
  1px borders, no shadows.
- Icons: lucide-react only, 16px, stroke 1.5 (set globally for `svg.lucide`).
- Layout: sidebar 220px (collapsible to 56px, drawer on phones), top bar 48px (page title,
  health text, date and time), status bar 24px (cameras online, GPU, VRAM, models, backend).
- The browser tab title is the page name. No favicon.

## Rules

- No product name, no logo, no "AI" wording.
- No gradients, glows, pulsing, blur, glass, coloured shadows, emoji, illustrations or
  decorative icons. No pills, no cards inside cards, no uppercase letter-spaced labels.
- Status colours (red, amber, green) only for status, always with an icon or text. Severity:
  critical (octagon icon, red) for supervised classes, warning (triangle, amber) for unsupervised.
- The supervised and unsupervised colours only in score bars and charts.
- Copy is short and neutral, like an operator console: "No open alarms", "Camera offline",
  "Confirm", "False alarm". No exclamation marks, no marketing copy.
- Every number comes from backend data. When data is missing or stale, show "n/a".
- Every list has a loading state (static, no animation), an empty state that says what to do
  next, and an error state with Retry. Everything clickable has hover and focus states and
  works by keyboard.
- Only create or change files inside this project folder; never install anything globally.
- Public repository: never commit videos, datasets, model weights or `data/`. Dataset licenses
  forbid redistribution.
