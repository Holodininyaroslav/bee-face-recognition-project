param(
    [string]$BuildDirectory = "..\build\native_face_cuda\Release",
    [string]$References = ".\references",
    [string]$Inputs = ".\demo_inputs",
    [string]$Models = ".\models",
    [int[]]$BatchSizes = @(1, 50, 500),
    [string[]]$RuntimePaths = @()
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
function Resolve-FromRoot([string]$Path) {
    if ([IO.Path]::IsPathRooted($Path)) { return (Resolve-Path -LiteralPath $Path).Path }
    return (Resolve-Path -LiteralPath (Join-Path $root $Path)).Path
}

$build = Resolve-FromRoot $BuildDirectory
$references = Resolve-FromRoot $References
$inputs = Resolve-FromRoot $Inputs
$models = Resolve-FromRoot $Models
$runtimeCandidates = @($build) + $RuntimePaths
if ($env:VIRTUAL_ENV) {
    $runtimeCandidates += Join-Path $env:VIRTUAL_ENV "Lib\site-packages\torch\lib"
}
$suiteRoot = Join-Path $env:USERPROFILE "BeeFaceLocalSuite\AI_MIPS_Hive_Service"
$runtimeCandidates += Join-Path $suiteRoot ".venv\Lib\site-packages\onnxruntime\capi"
$runtimeCandidates += Join-Path $suiteRoot ".venv\Lib\site-packages\torch\lib"
$cudaRoot = Join-Path $env:ProgramFiles "NVIDIA GPU Computing Toolkit\CUDA"
if (Test-Path -LiteralPath $cudaRoot) {
    foreach ($version in Get-ChildItem -LiteralPath $cudaRoot -Directory) {
        $runtimeCandidates += Join-Path $version.FullName "bin"
        $runtimeCandidates += Join-Path $version.FullName "bin\x64"
    }
}
$runtimeCandidates = @($runtimeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -Unique)
if (-not ($runtimeCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ "cudnn64_9.dll") })) {
    throw "cuDNN 9 runtime not found. Pass its DLL folder with -RuntimePaths, or install NVIDIA cuDNN 9."
}
$env:PATH = ($runtimeCandidates -join [IO.Path]::PathSeparator) + [IO.Path]::PathSeparator + $env:PATH
$sourceImages = @(Get-ChildItem -LiteralPath $inputs -File | Sort-Object Name)
if (-not $sourceImages) { throw "No benchmark images found in $inputs" }

$resultDirectory = Join-Path $root "results"
New-Item -ItemType Directory -Path $resultDirectory -Force | Out-Null
$rows = @()

foreach ($backend in @("CPU", "CUDA")) {
    $executable = Join-Path $build ($(if ($backend -eq "CUDA") { "identity_cuda.exe" } else { "identity_cpu.exe" }))
    if (-not (Test-Path -LiteralPath $executable)) { throw "Missing executable: $executable" }
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $executable
    foreach ($argument in @("--serve-tsv", "--models", $models, "--references", $references, "--min-score", "0.42", "--min-margin", "0.12")) {
        $startInfo.ArgumentList.Add($argument)
    }
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($startInfo)
    try {
        $ready = $process.StandardOutput.ReadLine() | ConvertFrom-Json
        if (-not $ready.ready) { throw "$backend worker did not become ready" }
        foreach ($batchSize in $BatchSizes) {
            $selected = @(
                for ($index = 0; $index -lt $batchSize; ++$index) {
                    $sourceImages[$index % $sourceImages.Count]
                }
            )
            $request = "batch`t" + (($selected | ForEach-Object FullName) -join "|") + "`t"

            # Compile and allocate this exact graph shape before measuring it.
            $process.StandardInput.WriteLine($request)
            $process.StandardInput.Flush()
            $null = $process.StandardOutput.ReadLine() | ConvertFrom-Json -Depth 20

            $stopwatch = [Diagnostics.Stopwatch]::StartNew()
            $process.StandardInput.WriteLine($request)
            $process.StandardInput.Flush()
            $payload = $process.StandardOutput.ReadLine() | ConvertFrom-Json -Depth 20
            $stopwatch.Stop()
            if ([int]$payload.count -ne $batchSize) {
                throw "$backend batch $batchSize returned $($payload.count) results"
            }

            $correct = 0
            $accepted = 0
            for ($index = 0; $index -lt $batchSize; ++$index) {
                $expected = [IO.Path]::GetFileNameWithoutExtension($selected[$index].Name).Split('_')[0]
                $actual = [string]$payload.results[$index].identity
                if ([bool]$payload.results[$index].accepted) { ++$accepted }
                if ($actual -eq $expected) { ++$correct }
            }
            $totalMs = [double]$payload.total_ms
            $rows += [pscustomobject]@{
                backend = $backend
                native_backend = [string]$payload.backend
                batch = $batchSize
                accepted = $accepted
                correct = $correct
                errors = $batchSize - $correct
                recognition_ms = [math]::Round($totalMs, 4)
                images_per_second = [math]::Round($batchSize * 1000.0 / [math]::Max($totalMs, 0.0001), 2)
                initialization_ms = [math]::Round([double]$ready.initialization_ms, 4)
                process_wall_ms = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 4)
            }
        }
    } finally {
        if (-not $process.HasExited) {
            $process.StandardInput.WriteLine("quit")
            $process.StandardInput.Flush()
            $process.WaitForExit(10000) | Out-Null
        }
        if (-not $process.HasExited) { $process.Kill($true) }
        $process.Dispose()
    }
}

$csv = Join-Path $resultDirectory "native_face_cpu_cuda_results.csv"
$rows | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding utf8
$rows | Format-Table -AutoSize
Write-Host "CSV: $csv"
if (($rows | Where-Object errors -ne 0).Count -ne 0) {
    throw "At least one native recognition case failed its expected-label check"
}
