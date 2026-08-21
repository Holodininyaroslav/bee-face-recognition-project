@echo off
setlocal EnableExtensions
set "VSLANG=1033"

for %%I in ("%~dp0.") do set "PROJECT_DIR=%%~fI"
set "BUILD_DIR=%PROJECT_DIR%\build-cuda"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VCVARS="

if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%I in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VCVARS=%%I\VC\Auxiliary\Build\vcvars64.bat"
)
if not defined VCVARS (
    echo ERROR: Visual Studio C++ Build Tools were not found.
    exit /b 1
)

call "%VCVARS%" >nul
if errorlevel 1 exit /b %errorlevel%

where nvcc >nul 2>nul
if errorlevel 1 (
    echo ERROR: NVIDIA CUDA Toolkit with NVCC was not found in PATH.
    exit /b 1
)

cmake -S "%PROJECT_DIR%" -B "%BUILD_DIR%" -G "NMake Makefiles" -DBUILD_CUDA=ON -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 exit /b %errorlevel%
cmake --build "%BUILD_DIR%"
if errorlevel 1 exit /b %errorlevel%

echo Build completed: %BUILD_DIR%\attention_cuda.exe
exit /b 0
