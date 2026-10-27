# Veghe

Web dashboard for video anomaly detection on multiple surveillance cameras,
built for a bachelor thesis. Two detector families feed it:

- **Supervised** ("Pretrained" in the UI): pretrained public models for fight,
  car accident, fire or explosion and shooting. The thesis model will join them as
  one more plugin.
- **Unsupervised** ("Scene normality"): learns per camera what is normal from normal
  footage only and flags anything rare, with a reason (unusual object, motion,
  posture, loitering, crowding).

Product name: **Veghe**. Public repository: https://github.com/giulia-efrem/anomaly-detection

## Status

- Step 1: Live page with mock data. Done.
- Step 2: backend, real video (MJPEG), Test videos page, API-driven frontend. Done.
- Step 3: pretrained detectors, scene normality, live pipeline, alerts, incidents with clips. Done.
- Next: the thesis model as a plugin, Compare models page.

## Machine

- Windows 11, NVIDIA GeForce RTX 4050 Laptop GPU, 6 GB VRAM (6141 MiB), driver 555.99 (CUDA 12.5).
- Python 3.12.15 in a project-local conda environment at `backend/.venv` (the system has
  no 3.11/3.12; created from the user's miniconda, nothing installed globally).
- PyTorch 2.14.1+cu126, Ultralytics 8.4, PyTorchVideo 0.1.5 (installed with `--no-deps`, then
  fvcore). Keep VRAM use under ~5 GB; all models together use about 1.2 GB.
- The GPU runs at about 12 W on the Balanced plan: with 8 cameras the pipeline analyses
  2 to 3.5 frames per second per camera instead of 5.

## How to run

- One click: `start.bat` in the project root opens the backend (port 8000) and the
  frontend (port 5180) in two windows, then opens http://localhost:5180.
- Backend by hand: `cd backend` then `.venv\python.exe -m uvicorn app.main:app --port 8000`.
- Frontend by hand: `cd frontend` then `npm run dev` (proxies `/api` and `/ws` to :8000).
- Models (after cloning): `cd backend` then `.venv\python.exe scripts\download_models.py`.
  Everything about them: `backend/models/MODELS.md`.
- Demo cameras: `cd backend` then `.venv\python.exe -m app.demo` (backend stopped). Downloads the
  test datasets if missing, joins clips into reels, replaces all cameras with 8 virtual cameras
  and teaches the three scene cameras their normal footage.
- Tests: `cd backend` then `.venv\python.exe -m pytest -q` (real uvicorn server, temp data folder,
  real models from `data/models` when present).
- Model check: `.venv\python.exe scripts\evaluate_clip_models.py fight fight-surv` (AUC, thresholds).
- Frontend checks: `npm run build`, `npm run lint` (oxlint).
- Screenshots: backend running, then in `frontend`:
  `npm run build` and `set PLAYWRIGHT_BROWSERS_PATH=0&& node scripts\screenshot.mjs <outDir>`.
  Playwright and its Chromium live in `frontend/node_modules`.
- Recreate the backend environment (only if `backend/.venv` is lost):
  `conda create -p backend\.venv -c conda-forge --override-channels python=3.12 pip`, then
  `backend\.venv\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126`,
  `backend\.venv\python.exe -m pip install --no-deps pytorchvideo==0.1.5` and
  `backend\.venv\python.exe -m pip install -r backend\requirements.txt`.
- Ultralytics settings live in `data/ultralytics` (`YOLO_CONFIG_DIR`, set in `app/config.py`).
  Scripts that import ultralytics must import `app.config` first.

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
                                              3. YOLO11n pose (every 2nd frame, people only)
                                              4. plugins, gated: threat (people, 2.5/s), fire (1/s)
                                                 └─ fight / crash windows → ClipWorker thread (16 frames)
                                              5. NormalityModel per camera: learn or score
                                              6. AlertEngine (app/alerts.py) → incidents, clips, WebSocket
```

- **Alert rule**: score above threshold for 2 s → incident; while the same camera and
  class keep crossing within 20 s they merge into it (`alarm_count` grows). A supervised
  and a scene alert on one camera at once share one incident raised by `both`.
  Thresholds per camera and class (`cameras.thresholds`, defaults in `config.DEFAULT_THRESHOLDS`).
- **Incident media**: thumbnail with detections drawn (`data/incidents/<id>.jpg`) and a 10 s
  H.264 clip, 5 s before and 5 s after the alert (`<id>.mp4`), encoded from the JPEG history.
- **Feedback**: Confirm, False alarm and "This is normal" are stored in the `feedback` table
  with the clip path. "This is normal" also teaches the clip to the camera's scene model.
- **Scene normality**: new cameras learn for `learn_seconds` (default 600) of live footage,
  skipping frames a pretrained model flags; or learn faster than real time from a library clip
  (`POST /api/cameras/{id}/normality/learn`). Saved to `data/normality/<camera>.npz/.json`.
- **Streaming**: MJPEG keeps one HTTP connection open per camera and browsers allow six per
  host, so the frontend loads each stream from its own host name
  `http://<camera-id>.localhost:8000/...`. See `streamSrc` in `frontend/src/api/client.ts`.
- **Live updates**: `/ws` WebSocket. Events: `hello`, `camera.status`, `cameras.changed`,
  `camera.live` (per camera about once a second: people, class scores, scene score and
  reason, learning progress, active alerts), `incident.created`, `incident.updated`,
  `normality.job`, `library.job`, `library.changed`. The frontend (`src/api/live.ts`)
  patches TanStack Query caches; `camera.live` lives in the `['live']` query key.
- **Test video library**: `backend/catalog.json` lists verified public datasets (link, size,
  license, citation, importer; per-clip credits for the Wikimedia Commons demo clips).
- **Storage**: SQLite at `data/veghe.db` (tables `cameras`, `incidents`, `feedback`,
  `library_videos`, `meta`). `db._migrate` upgrades a step 2 database on start.

## Folders

- `backend/app/` — `main.py`, `config.py`, `db.py`, `schemas.py`, `cameras.py`, `events.py`,
  `library.py`, `media.py`, `demo.py`, `model_files.py` (manifest and downloads),
  `pipeline.py`, `alerts.py`, `normality.py`, `overlay.py`, `detectors/` (plugin interface and
  the four pretrained plugins), `routes/` (cameras, incidents, library, models, system).
- `backend/models/` — `models.json` (pinned, hash-checked manifest) and `MODELS.md`.
- `backend/scripts/` — `download_models.py`, `evaluate_clip_models.py`.
- `backend/tests/` — end-to-end API tests, normality unit tests.
- `data/` (gitignored) — `veghe.db`, `models/`, `normality/`, `incidents/`, `downloads/`,
  `library/<dataset>/`, `uploads/`, `ultralytics/`.
- `frontend/src/api/` — fetch client, query hooks, WebSocket sync.
- `frontend/src/lib/` — `format.ts`, `classes.ts` (labels, colours, icons per class), `live.ts`.
- `frontend/src/ui/` — component kit.
- `frontend/src/components/` — TopBar, PipelineStatus, CameraGrid, CameraTile (overlay toggle,
  people count), FocusTile, CameraStream, AlarmTimeline, IncidentQueue, IncidentCard,
  ScoreMeter, CameraDialog, CameraSettingsDialog (thresholds, scene normality, heatmap),
  VideoDialog, `library/`.
- `frontend/src/pages/` — Live, Incidents, Test videos, Training (models and labels),
  Cameras, Compare models (placeholder).

## API

| Method and path | Purpose |
| --- | --- |
| `GET /api/health`, `GET /api/status` | Health; pipeline stages, fps, camera slots |
| `GET, POST /api/cameras`; `GET, PATCH, DELETE /api/cameras/{id}` | Camera CRUD (max 10); PATCH also takes `supervised`, `unsupervised`, `thresholds`, `learn_seconds` |
| `GET /api/cameras/{id}/stream?overlay=1` | MJPEG, ~12 fps, 960 px wide, optionally with boxes and poses |
| `GET /api/cameras/{id}/snapshot`, `POST /api/cameras/{id}/restart` | Latest JPEG; reconnect now |
| `GET /api/cameras/{id}/normality`, `GET .../normality/heatmap?cls=` | What the scene model learned; heatmap JPEG |
| `POST /api/cameras/{id}/normality/learn`, `POST .../normality/reset` | Learn from a library clip; forget and relearn |
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
  type: "fight" | "car_accident" | "fire_explosion" | "shooting"          // pretrained
      | "unusual_object" | "unusual_motion" | "unusual_posture"
      | "loitering" | "crowding"                                         // scene normality
      | "other",
  started_at, ended_at, alarm_count,
  raised_by: "supervised" | "unsupervised" | "both",
  scores: { supervised: number | null, unsupervised: number | null },
  thresholds: { supervised: number, unsupervised: number },
  caption: string | null,    // model note, or the scene reason text ("Car in a part of the image where cars were never seen")
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

The API's Incident adds `thumbnail_url`, `reason` (scene reason when that model
contributed) and `details` (class scores at alert time, clip length). The API's Camera
adds `source_type`, `source`, `library_video_id`, `status`, `position`, `thresholds`
(every class plus `unsupervised`) and `learn_seconds`. Supervised scores are the
score of the incident's class (for scene incidents: the most likely pretrained class).

## Design tokens

| Token | Value |
| --- | --- |
| page | `#0C141F` |
| header | `#0F1925` |
| panel | `#111B29` |
| card | `#16233A` |
| video | `#0A111A` |
| lines | `#1F2F44`, `#24354C` |
| text | `#E7EEF6` |
| text-secondary | `#C3CFDC` |
| muted | `#8C9DB2` |
| supervised (amber) | `#F2B04A` |
| unsupervised (blue) | `#5AA9F2` |
| live anomaly (red) | `#FF6B6B` |
| healthy (green) | `#4ED3A3` |

Class colours (timeline and icons, `frontend/src/lib/classes.ts`, validated with the
dataviz palette script on `#0D1622`): fight `#d95926`, car accident `#199e70`,
fire or explosion `#c98500`, gun or shooting `#d55181`, every scene normality reason
`#3987e5` (told apart by icon and label).

Fonts from Google Fonts: **Barlow** (UI, 14px base) and **Barlow Semi Condensed**
(numbers, chips, clock). Tabular numerals everywhere. Only weights 500 and 600.

Tokens live in `frontend/src/index.css` under `@theme` (Tailwind v4): `bg-page`, `bg-panel`,
`bg-card`, `bg-raised` (hover/selected), `bg-field` (inputs, tracks), `text-ink`, `text-ink-2`,
`text-muted`, `text-sup`, `text-unsup`, `bg-alarm`, `text-healthy`, `text-on-light`.

## Rules

- Red only for a live anomaly. Review counts use a neutral white pill. Class colours never use red.
- Filled dot = model active, hollow ring = not active yet.
- Sentence case, no all-caps labels.
- Icons: lucide-react only, no emoji.
- 8px spacing grid. Panels and cards radius 12, controls radius 8. Prefer surface contrast
  over borders.
- Every list has a loading skeleton, an empty state that says what to do next, and an error
  state with retry. Everything clickable has hover and focus states and works by keyboard.
- Only create or change files inside this project folder; never install anything globally.
- Public repository: never commit videos, datasets, model weights or `data/`. Dataset licenses
  forbid redistribution.
