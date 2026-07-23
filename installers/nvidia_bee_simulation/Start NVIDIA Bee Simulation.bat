@echo off
cd /d "%~dp0"
set "AI_MIPS_NVIDIA_CUDA=1"
py -3.12 "%~dp0Bee_3D_Standalone\main.py"
