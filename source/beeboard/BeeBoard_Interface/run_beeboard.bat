@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Virtual environment not found. Run install_and_run.bat first.
  pause
  exit /b 1
)
start "BeeBoard v0.1" http://127.0.0.1:8877/
".venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8877
pause
