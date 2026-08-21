@echo off
setlocal EnableExtensions

for %%I in ("%~dp0.") do set "PROJECT_DIR=%%~fI"
set "PYTHON=%USERPROFILE%\BeeFaceLocalSuite\AI_MIPS_Hive_Service\.venv\Scripts\python.exe"
set "IMAGES=%USERPROFILE%\BeeFaceLocalSuite\AI_MIPS_Hive_Service\Bgame_local\Bee_3D_Standalone\local_face_ai\references"
set "TOOL=%PROJECT_DIR%\tools\benchmark_face_pipeline.py"

if not exist "%PYTHON%" (
    echo ERROR: Installed Hive Python was not found: %PYTHON%
    exit /b 1
)
if not exist "%IMAGES%" (
    echo ERROR: Fixed reference images were not found: %IMAGES%
    exit /b 1
)

powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8890/api/detector-status' -TimeoutSec 5; if($r.Content -notmatch 'full CUDA resize'){exit 2} } catch { exit 1 }"
if errorlevel 1 (
    echo ERROR: Local Hive with the full CUDA pipeline is not ready on port 8890.
    exit /b 1
)

"%PYTHON%" "%TOOL%" --images "%IMAGES%" --count 50 --repeat-each 1 --runs 10 --warmup 1 --output-dir "%PROJECT_DIR%\results\face-pipeline"
if errorlevel 1 exit /b %errorlevel%

"%PYTHON%" "%TOOL%" --images "%IMAGES%" --count 50 --repeat-each 10 --runs 5 --warmup 1 --output-dir "%PROJECT_DIR%\results\face-pipeline-500"
if errorlevel 1 exit /b %errorlevel%

echo Controlled face benchmarks completed successfully.
exit /b 0
