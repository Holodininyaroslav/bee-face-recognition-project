@echo off
setlocal
cd /d "%~dp0"
set "PY=python"
where python >nul 2>nul
if errorlevel 1 set "PY=py -3"
if not exist ".venv\Scripts\python.exe" (
  %PY% -m venv .venv
  if errorlevel 1 (
    echo Failed to create virtual environment. Install Python 3.12+ and try again.
    pause
    exit /b 1
  )
)
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
start "BeeBoard v0.1" http://127.0.0.1:8877/
".venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8877
pause
