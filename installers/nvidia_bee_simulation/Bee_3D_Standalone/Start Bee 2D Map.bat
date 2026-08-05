@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$py = Join-Path $env:USERPROFILE 'BeeFaceLocalSuite\AI_MIPS_Hive_Service\.venv\Scripts\pythonw.exe'; if (!(Test-Path $py)) { $py = (Get-Command pythonw -ErrorAction SilentlyContinue).Source }; if (!$py) { $py = (Get-Command python -ErrorAction Stop).Source }; Start-Process -FilePath $py -ArgumentList ('\"' + (Join-Path $PWD 'bee_space_map.py') + '\"') -WorkingDirectory $PWD"
