@echo off
cd /d "%~dp0"
set "AI_MIPS_NVIDIA_CUDA=1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Bee_3D_Standalone\Start Bee 3D Standalone.ps1"
