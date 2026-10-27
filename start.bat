@echo off
rem Starts the backend and the frontend in two windows, then opens the dashboard.
setlocal
cd /d "%~dp0"

if not exist "backend\.venv\python.exe" (
  echo The backend environment is missing: backend\.venv\python.exe
  echo See "How to run" in CLAUDE.md to create it.
  pause
  exit /b 1
)

if not exist "data\models\yolo11s.pt" (
  echo Downloading the detection models, this happens only once...
  pushd backend
  ".venv\python.exe" scripts\download_models.py
  popd
)

if not exist "frontend\node_modules" (
  echo Installing frontend packages, this happens only once...
  pushd frontend
  call npm install
  popd
)

start "Backend (port 8000)" /D "%~dp0backend" cmd /k ".venv\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
start "Frontend (port 5180)" /D "%~dp0frontend" cmd /k "npm run dev"

echo Waiting for the backend and the frontend to answer...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "foreach ($u in 'http://127.0.0.1:8000/api/health','http://localhost:5180') { for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Seconds 1 } } }"

start "" "http://localhost:5180"
endlocal
