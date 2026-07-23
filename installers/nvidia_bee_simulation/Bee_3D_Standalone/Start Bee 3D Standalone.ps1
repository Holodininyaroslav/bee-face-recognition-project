$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalPython = Join-Path $Root ".venv\Scripts\python.exe"
$KnownUrsinaPython = "C:\Users\79090\Desktop\Bee simulator  with AI MIPS\Nano-zionist\.venv\Scripts\python.exe"
$Main = Join-Path $Root "main.py"

$Existing = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine -like "*Bee_3D_Standalone*main.py*"
    } |
    Select-Object -First 1

if ($Existing) {
    exit 0
}

if (Test-Path -LiteralPath $LocalPython) {
    $Python = $LocalPython
} elseif (Test-Path -LiteralPath $KnownUrsinaPython) {
    $Python = $KnownUrsinaPython
} else {
    $Python = (Get-Command python -ErrorAction Stop).Source
}

Set-Location -LiteralPath $Root
$PythonWindowed = Join-Path (Split-Path -Parent $Python) "pythonw.exe"
if (Test-Path -LiteralPath $PythonWindowed) {
    $Python = $PythonWindowed
}
Start-Process -FilePath $Python -ArgumentList "`"$Main`"" -WorkingDirectory $Root
