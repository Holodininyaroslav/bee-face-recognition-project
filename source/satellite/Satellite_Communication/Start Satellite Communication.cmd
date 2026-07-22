@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "Satellite Communication Server" py -3 -m http.server 8765 --bind 127.0.0.1
) else (
  start "Satellite Communication Server" python -m http.server 8765 --bind 127.0.0.1
)
timeout /t 2 >nul
start "" "http://127.0.0.1:8765/"
endlocal
