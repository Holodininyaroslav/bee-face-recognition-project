@echo off
setlocal EnableExtensions

for %%I in ("%~dp0.") do set "PROJECT_DIR=%%~fI"
set "EXE=%PROJECT_DIR%\build-cuda\attention_cuda.exe"
set "CSV=%PROJECT_DIR%\results\rtx4060-n512-d64.csv"

call "%PROJECT_DIR%\build_cuda_windows.bat"
if errorlevel 1 exit /b %errorlevel%

if not exist "%PROJECT_DIR%\results" mkdir "%PROJECT_DIR%\results"
echo.
echo === REQUIRED CUDA CASE: N=512, d=64 ===
"%EXE%" --n 512 --d 64 --warmup 5 --iterations 50 --seed 2026 --variant all --csv "%CSV%"
if errorlevel 1 exit /b %errorlevel%

findstr /c:"CUDA,basic" /c:"CUDA,optimized" "%CSV%" >nul
if errorlevel 1 (
    echo ERROR: Required CUDA CSV rows were not generated.
    exit /b 2
)
findstr /c:",FAIL" "%CSV%" >nul
if not errorlevel 1 (
    echo ERROR: Numerical verification failed.
    exit /b 2
)

echo.
echo Verification PASS. Results: %CSV%
exit /b 0
