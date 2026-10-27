# Video anomaly detection dashboard

A web dashboard for video anomaly detection on up to ten surveillance cameras,
built for a bachelor thesis. Each camera is watched by two kinds of detectors:

- **Supervised**: pretrained public models for three classes: fight, car
  accident, and fire or explosion. Each is a plugin with the same interface, so
  the thesis model can join or replace them.
- **Unsupervised**: per camera it learns from normal footage
  which objects appear where, how they move, how many people are usually there,
  how long they stay and which body poses are normal, then flags anything rare
  and says why ("Truck on a camera where trucks were never seen").

The interface follows professional video management clients: a video wall
with 1, 4, 9 or 16 cameras, an alarm queue, an incident table with a detail
drawer (clip, scores over time, detections), and a status bar with real system
figures. Supervised alarms are critical, unsupervised alarms are warnings.
Operators confirm, dismiss or mark alarms "This is normal"; the decisions are
kept as labels for retraining. A library of public test videos plays as virtual
cameras.

## Requirements

- Windows 10 or 11 with an NVIDIA GPU (developed on an RTX 4050 Laptop, 6 GB).
- Python 3.12 (a conda environment inside `backend/.venv`).
- Node.js 20 or newer.

## Run

Double-click `start.bat` in the project root. It opens the backend (port 8000)
and the frontend (port 5180) in two windows and then opens
http://localhost:5180 in the browser. The first run installs the frontend
packages.

The backend environment and the model weights are not part of the repository.
Create them once:

```bat
conda create -p backend\.venv -c conda-forge --override-channels python=3.12 pip
backend\.venv\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
backend\.venv\python.exe -m pip install --no-deps pytorchvideo==0.1.5
backend\.venv\python.exe -m pip install -r backend\requirements.txt
cd backend
.venv\python.exe scripts\download_models.py
```

The download script fetches five models (about 180 MB) into `data/models/` and
checks every file against the SHA-256 in `backend/models/models.json`.

By hand:

```bat
cd backend
.venv\python.exe -m uvicorn app.main:app --port 8000

cd frontend
npm run dev
```

Demo cameras (backend stopped): `cd backend` then `.venv\python.exe -m app.demo`.
It downloads the public test datasets (about 1.8 GB), joins clips into reels and
creates 7 virtual cameras: two fights, road collisions, fires and explosions, and
three scenes for the unsupervised model (an office with staged falls, a campus
avenue, a pedestrian walkway with bikes and a cart), which first learn from the
normal footage of the same scene.

Tests: `cd backend` then `.venv\python.exe -m pytest -q`. Frontend checks:
`npm run build` and `npm run lint` in `frontend`.

## Folder structure

```
backend/
  app/              FastAPI app: cameras, frame buffers, SQLite, WebSocket, test video library
  app/pipeline.py   Live analysis: detection, tracking, pose, plugins, scene normality
  app/alerts.py     Alert rule, incidents, clips and thumbnails
  app/normality.py  Unsupervised model (scene normality)
  app/detectors/    Plugin interface and the three pretrained detectors
  app/routes/       HTTP routes (cameras, incidents, library, models, system)
  models/           models.json (pinned model manifest) and MODELS.md
  scripts/          download_models.py, evaluate_clip_models.py
  catalog.json      Public test datasets with links, sizes, licenses and citations
  tests/            End-to-end API tests and unsupervised model tests
frontend/
  src/api/          Fetch client, query hooks, WebSocket sync
  src/ui/           Component kit
  src/components/   Dashboard components
  src/pages/        Live, Incidents, Cameras, Test videos, Training (models)
data/               Created at run time, never committed: database, downloads, clips, models
start.bat           One-click start
```

## Third-party data and models

Nothing in this repository contains dataset clips or model weights. They are
downloaded on demand into `data/`, which is excluded from version control,
because several dataset licenses do not allow redistribution.

Test video datasets (downloaded from the Test videos page; details in
`backend/catalog.json`):

| Dataset | License |
| --- | --- |
| UR Fall Detection Dataset | CC BY-NC-SA 4.0 |
| Surveillance Camera Fight Dataset | MIT |
| CUHK Avenue Dataset | Free for research, cite the paper |
| UCSD Anomaly Detection Dataset | Free for research, cite the paper |
| Demo clips (7 Wikimedia Commons videos) | Public domain, CC0, CC BY 3.0, CC BY-SA 4.0; author per clip in the app |

Models (details, inputs and our own measurements in `backend/models/MODELS.md`):

| Model | Used for | License |
| --- | --- | --- |
| [YOLO11s](https://docs.ultralytics.com/models/yolo11/) (COCO) with ByteTrack | Objects and tracking | AGPL-3.0 |
| [YOLO11n pose](https://docs.ultralytics.com/tasks/pose/) | Body poses | AGPL-3.0 |
| [X3D-M on RWF-2000](https://huggingface.co/visionlab-ai/school-violence-detection-models) | Fight | MIT |
| [3D ResNet-18 crash detector](https://huggingface.co/HaniaRuby/crash-detector-3dresnet) | Car accident | MIT |
| [YOLOv8n fire and smoke, D-Fire](https://huggingface.co/rabahdev/fire-smoke-yolov8n) | Fire or explosion | AGPL-3.0 |

Because Ultralytics and three of the models are AGPL-3.0, this project is meant to
stay open source.

Main libraries: FastAPI (MIT), OpenCV (Apache 2.0), PyTorch (BSD-3-Clause),
Ultralytics (AGPL-3.0), PyTorchVideo (Apache 2.0), ffmpeg via imageio-ffmpeg
(LGPL/GPL binary), React (MIT), TanStack Query (MIT), Tailwind CSS (MIT),
TanStack Table (MIT), lucide-react (ISC), IBM Plex fonts (SIL Open Font License).
