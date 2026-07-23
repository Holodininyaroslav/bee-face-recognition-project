@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$py = 'C:\Users\79090\Desktop\Bee simulator  with AI MIPS\Nano-zionist\.venv\Scripts\pythonw.exe'; if (!(Test-Path $py)) { $py = (Get-Command pythonw -ErrorAction SilentlyContinue).Source }; if (!$py) { $py = (Get-Command python -ErrorAction Stop).Source }; Start-Process -FilePath $py -ArgumentList ('\"' + (Join-Path $PWD 'bee_space_map.py') + '\"') -WorkingDirectory $PWD"
