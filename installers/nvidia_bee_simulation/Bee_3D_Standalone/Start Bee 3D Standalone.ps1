$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalPython = Join-Path $Root ".venv\Scripts\python.exe"
$SuitePython = Join-Path (Split-Path -Parent (Split-Path -Parent $Root)) ".venv\Scripts\python.exe"
$Main = Join-Path $Root "main.py"
$Requirements = Join-Path $Root "requirements.txt"

function Get-CompatiblePython {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        foreach ($version in @("3.12", "3.11", "3.10", "3.9")) {
            try {
                $candidate = & $pyLauncher.Source "-$version" -c "import sys; print(sys.executable)" 2>$null | Select-Object -First 1
            } catch {
                continue
            }
            if ($candidate -and (Test-Path -LiteralPath $candidate)) {
                return [string]$candidate
            }
        }
    }
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        $supported = & $pythonCommand.Source -c "import sys; print('yes' if (3, 9) <= sys.version_info[:2] <= (3, 12) else 'no')" 2>$null
        if ($supported -eq "yes") {
            return $pythonCommand.Source
        }
    }
    throw "Python 3.9-3.12 x64 is required. Python 3.13+ is not supported by this game environment."
}

$Existing = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine -like "*Bee_3D_Standalone*main.py*"
    } |
    Select-Object -First 1

if ($Existing) {
    exit 0
}

if (Test-Path -LiteralPath $SuitePython) {
    $Python = $SuitePython
} else {
    if (-not (Test-Path -LiteralPath $LocalPython)) {
        if (-not (Test-Path -LiteralPath $Requirements)) {
            throw "Bee dependency manifest was not found: $Requirements"
        }
        $BootstrapPython = Get-CompatiblePython
        Write-Host "Preparing the Bee Python environment with $BootstrapPython ..."
        & $BootstrapPython -m venv (Join-Path $Root ".venv")
        if ($LASTEXITCODE -ne 0) { throw "Could not create the Bee Python environment." }
        & $LocalPython -m pip install --disable-pip-version-check --upgrade pip
        if ($LASTEXITCODE -ne 0) { throw "Could not update pip in the Bee environment." }
        & $LocalPython -m pip install --disable-pip-version-check -r $Requirements
        if ($LASTEXITCODE -ne 0) { throw "Could not install the Bee dependencies." }
    }
    $Python = $LocalPython
}

& $Python -c "import cv2, numpy, ursina, panda3d; from ursina import color; assert hasattr(color, 'rgb32')"
if ($LASTEXITCODE -ne 0) {
    throw "The selected Bee Python environment is incompatible or incomplete."
}

Set-Location -LiteralPath $Root
$PythonWindowed = Join-Path (Split-Path -Parent $Python) "pythonw.exe"
if (Test-Path -LiteralPath $PythonWindowed) {
    $Python = $PythonWindowed
}
Start-Process -FilePath $Python -ArgumentList "`"$Main`"" -WorkingDirectory $Root
