# Veghe

Web dashboard for video anomaly detection on multiple surveillance cameras,
built for a bachelor thesis. Two detector families feed it:

- **Unsupervised**: pose-based, learns only normal behaviour per camera. Implemented.
- **Supervised**: trained on labelled anomalies (fight, fall). Not built yet.

Product name: **Veghe**.

## Status

- Step 1: Live page with mock data. Done.
- Step 2: backend, real video (MJPEG), Test videos page, API-driven frontend. Done.
- Step 3: anomaly detection on the shared frame buffers (pose model, scoring, captions). Next.

## Machine

- Windows 11, NVIDIA GeForce RTX 4050 Laptop GPU, 6 GB VRAM (6141 MiB), driver 555.99 (CUDA 12.5).
- Python 3.12.15 in a project-local conda environment at `backend/.venv` (the system has
  no 3.11/3.12; created from the user's miniconda, nothing installed globally).
- PyTorch 2.14.1+cu126, `torch.cuda.is_available()` is True. Keep VRAM use under ~5 GB.

## How to run

- One click: `start.bat` in the project root opens the backend (port 8000) and the
  frontend (port 5180) in two windows, then opens http://localhost:5180.
- Backend by hand: `cd backend` then `.venv\python.exe -m uvicorn app.main:app --port 8000`.
- Frontend by hand: `cd frontend` then `npm run dev` (proxies `/api` and `/ws` to :8000).
- Demo cameras: `cd backend` then `.venv\python.exe -m app.demo` (backend stopped). Downloads
  UR Fall and the Surveillance Camera Fight Dataset if missing, joins same-scene clips into
  reels and replaces all cameras with 7 virtual cameras.
- Tests: `cd backend` then `.venv\python.exe -m pytest -q` (real uvicorn server, temp data folder).
- Frontend checks: `npm run build`, `npm run lint` (oxlint).
- Screenshots: backend running, then in `frontend`:
  `npm run build` and `set PLAYWRIGHT_BROWSERS_PATH=0&& node scripts\screenshot.mjs <outDir>`.
  Playwright and its Chromium live in `frontend/node_modules`.
- Recreate the backend environment (only if `backend/.venv` is lost):
  `conda create -p backend\.venv -c conda-forge --override-channels python=3.12 pip`, then
  `backend\.venv\python.exe -m pip install -r backend\requirements.txt` and
  `backend\.venv\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126`.

## Architecture

```
camera source ──> CameraWorker thread (one per camera, app/cameras.py)
 (RTSP / webcam /     │ grab at source speed (files are paced to their fps and loop forever)
  video file)         │ every ~1/12 s: resize to 960 px wide, JPEG encode
                      v
                 FrameBuffer (ring of the last 24 frames: BGR image + JPEG)
                      │                         │
     GET /api/cameras/{id}/stream          step 3 detectors read
     multipart/x-mixed-replace (MJPEG)     manager.buffer(id).snapshot() / wait_newer()
```

- **Streaming**: MJPEG keeps one HTTP connection open per camera and browsers allow six per
  host, so the frontend loads each stream from its own host name
  `http://<camera-id>.localhost:8000/...` (browsers resolve `*.localhost` to this machine),
  straight from the backend, not through the Vite proxy. See `streamSrc` in `frontend/src/api/client.ts`.
- **Live updates**: `/ws` WebSocket. Events: `hello`, `camera.status`, `cameras.changed`,
  `incident.updated`, `library.job`, `library.changed`. The frontend (`src/api/live.ts`) patches
  or invalidates TanStack Query caches; polling every 30 s is only a safety net.
- **Test video library**: `backend/catalog.json` lists verified public datasets (link, size,
  license, citation, importer). Downloads, uploads and links run as background jobs
  (`app/library.py`), report progress over the WebSocket, convert clips to H.264 MP4 with the
  imageio-ffmpeg binary and save a thumbnail. Clips live in the `library_videos` table.
- **Virtual camera**: a camera with `source_type: "file"` that loops a library clip.
- **Storage**: SQLite at `data/veghe.db` (tables `cameras`, `incidents`, `library_videos`, `meta`).
  The four step 1 example incidents are seeded once on first start (`app/seed.py`).

## Folders

- `backend/app/` — `main.py` (FastAPI app), `config.py` (paths, stream size and fps, slot limit),
  `db.py` (SQLite), `schemas.py` (API models), `cameras.py` (readers and frame buffers),
  `events.py` (WebSocket bus), `library.py` (catalog, jobs, importers), `media.py` (ffmpeg and
  OpenCV helpers), `demo.py` (demo cameras), `seed.py`, `routes/` (cameras, incidents, library, system).
- `backend/tests/` — end-to-end API tests.
- `data/` (gitignored) — `veghe.db`, `downloads/` (raw archives), `library/<dataset>/` (converted
  clips and thumbnails), `uploads/` (temporary).
- `frontend/src/api/` — fetch client, query hooks, WebSocket sync.
- `frontend/src/ui/` — component kit: Button, Chip and Pill, Panel and Card, Field/Input/Select,
  Dialog (native `<dialog>`), Toast, Tabs, ToggleGroup, Skeleton, EmptyState, ErrorState, ProgressBar.
- `frontend/src/components/` — TopBar, PipelineStatus, CameraGrid, CameraTile, FocusTile,
  CameraStream, AddCameraTile, AlarmTimeline, IncidentQueue, IncidentCard, ScoreMeter,
  CameraDialog, VideoDialog, `library/` (DatasetCard, ClipBrowser, AddVideo, JobProgress).
- `frontend/src/pages/` — Live, Incidents, Test videos, Compare models and Training
  (placeholders), Cameras. Routes in `src/router.tsx` (React Router).

## API

| Method and path | Purpose |
| --- | --- |
| `GET /api/health`, `GET /api/status` | Health; pipeline stages and camera slots |
| `GET, POST /api/cameras`; `GET, PATCH, DELETE /api/cameras/{id}` | Camera CRUD (max 10) |
| `GET /api/cameras/{id}/stream` | MJPEG, ~12 fps, 960 px wide |
| `GET /api/cameras/{id}/snapshot`, `POST /api/cameras/{id}/restart` | Latest JPEG; reconnect now |
| `GET /api/incidents`, `GET, PATCH /api/incidents/{id}` | List (filters: status, camera_id, raised_by); set status |
| `GET /api/library` | Clips (filters: dataset_id, anomaly_type) |
| `GET /api/library/catalog`, `GET /api/library/jobs` | Datasets with import state; background jobs |
| `POST /api/library/download` | `{dataset_id}` or `{url, title?, anomaly_types?}` |
| `POST /api/library/upload` | Multipart `files[]`, optional `anomaly_types` |
| `GET /api/library/{id}`, `/video`, `/thumbnail`; `DELETE /api/library/{id}` | One clip; files; delete (409 while a camera uses it) |
| `WS /ws` | Live updates |

## Event contract

```ts
Incident {
  id, camera_id,
  type: "fight" | "fall" | "unusual_posture" | "other",
  started_at, ended_at, alarm_count,
  raised_by: "supervised" | "unsupervised" | "both",
  scores: { supervised: number | null, unsupervised: number | null },
  thresholds: { supervised: number, unsupervised: number },
  caption: string | null, clip_url: string | null,
  status: "needs_review" | "confirmed" | "false_alarm"
}

Camera {
  id, name, stream_url, people_count, to_review,
  supervised: "on" | "off",
  unsupervised: "collecting" | "learning" | "ready" | "off",
  learning_progress: number | null
}
```

The API's Camera adds `source_type` ("rtsp" | "webcam" | "file"), `source`, `library_video_id`,
`status` ("connecting" | "live" | "offline") and `position`. Until step 3, `people_count` is 0,
`supervised` is "off" and `unsupervised` is "collecting".

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

Fonts from Google Fonts: **Barlow** (UI, 14px base) and **Barlow Semi Condensed**
(numbers, chips, clock). Tabular numerals everywhere. Only weights 500 and 600.

Tokens live in `frontend/src/index.css` under `@theme` (Tailwind v4): `bg-page`, `bg-panel`,
`bg-card`, `bg-raised` (hover/selected), `bg-field` (inputs, tracks), `text-ink`, `text-ink-2`,
`text-muted`, `text-sup`, `text-unsup`, `bg-alarm`, `text-healthy`, `text-on-light`.

## Rules

- Red only for a live anomaly. Review counts use a neutral white pill.
- Filled dot = model active, hollow ring = not active yet.
- Sentence case, no all-caps labels.
- Icons: lucide-react only, no emoji.
- 8px spacing grid. Panels and cards radius 12, controls radius 8. Prefer surface contrast
  over borders.
- Every list has a loading skeleton, an empty state that says what to do next, and an error
  state with retry. Everything clickable has hover and focus states and works by keyboard.
- Only create or change files inside this project folder; never install anything globally.
