@echo off
cd /d "%~dp0"
set "BEE_SUITE_ROOT=%USERPROFILE%\BeeFaceLocalSuite\AI_MIPS_Hive_Service"
set "BEE_PYTHON=%BEE_SUITE_ROOT%\.venv\Scripts\python.exe"
if exist "%BEE_PYTHON%" (
  "%BEE_PYTHON%" "%~dp0Start Linked Bee Experience.py"
) else (
  py -3.12 "%~dp0Start Linked Bee Experience.py"
)
