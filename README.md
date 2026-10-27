# Veghe

Veghe is a web dashboard for video anomaly detection on up to ten surveillance
cameras, built for a bachelor thesis. Each camera is watched by two kinds of
detectors:

- **Supervised** detectors that know specific incident classes from labelled
  footage.
- **Unsupervised** detectors that learn what is normal for each camera from
  normal footage only and flag anything rare.

The dashboard shows the live streams, raises incidents, lets an operator
confirm or dismiss them, and includes a library of public test videos that can
be played as virtual cameras.

## Requirements

- Windows 10 or 11 with an NVIDIA GPU (developed on an RTX 4050 Laptop, 6 GB).
- Python 3.12 (a conda environment inside `backend/.venv`).
- Node.js 20 or newer.

## Run

Double-click `start.bat` in the project root. It opens the backend (port 8000)
and the frontend (port 5180) in two windows and then opens
http://localhost:5180 in the browser. The first run installs the frontend
packages.

The backend environment is not part of the repository. Create it once:

```bat
conda create -p backend\.venv -c conda-forge --override-channels python=3.12 pip
backend\.venv\python.exe -m pip install -r backend\requirements.txt
backend\.venv\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
```

By hand:

```bat
cd backend
.venv\python.exe -m uvicorn app.main:app --port 8000

cd frontend
npm run dev
```

Demo cameras (backend stopped): `cd backend` then `.venv\python.exe -m app.demo`.
It downloads public test datasets, joins clips into reels and creates virtual
cameras.

Tests: `cd backend` then `.venv\python.exe -m pytest -q`. Frontend checks:
`npm run build` and `npm run lint` in `frontend`.

## Folder structure

```
backend/
  app/            FastAPI app: cameras, frame buffers, SQLite, WebSocket, test video library
  app/routes/     HTTP routes (cameras, incidents, library, system)
  catalog.json    Public test datasets with links, sizes, licenses and citations
  tests/          End-to-end API tests
frontend/
  src/api/        Fetch client, query hooks, WebSocket sync
  src/ui/         Component kit
  src/components/ Dashboard components
  src/pages/      Live, Incidents, Test videos, Cameras, Training
data/             Created at run time, never committed: database, downloads, clips, models
start.bat         One-click start
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

Pretrained models: none yet. They are added in the next step and documented in
`backend/models/MODELS.md`.

Main libraries: FastAPI (MIT), OpenCV (Apache 2.0), PyTorch (BSD-3-Clause),
ffmpeg via imageio-ffmpeg (LGPL/GPL binary), React (MIT), TanStack Query (MIT),
Tailwind CSS (MIT), lucide-react (ISC).
