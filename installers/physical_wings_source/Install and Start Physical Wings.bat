@echo off
setlocal
where wsl.exe >nul 2>nul
if errorlevel 1 (
  echo WSL is required for this FWMAV physical simulator package.
  echo Install Ubuntu from Microsoft Store, then run this installer again.
  pause
  exit /b 1
)
set "SRC=%~dp0flappy"
for /f "usebackq delims=" %%P in (`wsl.exe wslpath -a "%SRC%"`) do set "WSL_SRC=%%P"
wsl.exe -d Ubuntu -- bash -lc "set -e; mkdir -p ~/codex_flappy; rm -rf ~/codex_flappy/flappy; cp -a '%WSL_SRC%' ~/codex_flappy/flappy; cd ~/codex_flappy/flappy; python3 -m venv .venv || true; . .venv/bin/activate; python -m pip install --upgrade pip; python -m pip install gym numpy click PyOpenGL; chmod +x start_flappy_inspector.sh; ./start_flappy_inspector.sh"
start "" http://127.0.0.1:8099/?fresh=bee-shell-rotated
