$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $here ".venv\Scripts\python.exe"
$app = Join-Path $here "desktop_app.py"
Set-Location $here
& $python $app
