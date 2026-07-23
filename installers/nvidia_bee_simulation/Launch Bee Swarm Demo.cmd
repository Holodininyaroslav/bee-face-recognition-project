@echo off
setlocal

set "BEE_FACE_DETECTORS_EXTERNAL="
set "AI_MIPS_HIVE_API=%~1"
if "%AI_MIPS_HIVE_API%"=="" set "AI_MIPS_HIVE_API=http://127.0.0.1:8876"
set "AI_MIPS_SELECTED_PROCESSOR=%~2"
if "%AI_MIPS_SELECTED_PROCESSOR%"=="" set "AI_MIPS_SELECTED_PROCESSOR=0"
set "AI_MIPS_SWARM_DEMO=1"

set "BGAME_ROOT=%~dp0"
set "URSINA_ROOT=%BGAME_ROOT%Bee_3D_Standalone"
set "PYTHON_EXE=%BGAME_ROOT%..\Nano-zionist\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

cd /d "%URSINA_ROOT%"
"%PYTHON_EXE%" "%URSINA_ROOT%\main.py"

echo.
echo Bee swarm demo exited. Press any key to close this window.
pause >nul
