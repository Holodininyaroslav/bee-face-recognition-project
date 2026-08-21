param(
    [string]$Configuration = "Release",
    [string]$OnnxRuntimeVersion = "1.28.0",
    [string]$CudnnBin = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$thirdParty = Join-Path $root "third_party"
$runtimeRoot = Join-Path $thirdParty "onnxruntime"
$build = Join-Path (Split-Path -Parent $root) "build\native_face_cuda"
New-Item -ItemType Directory -Force -Path $thirdParty | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot "build\native\include\onnxruntime_cxx_api.h"))) {
    $cpuPackage = Join-Path $thirdParty "onnxruntime.nupkg"
    $cpuUrl = "https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime/$OnnxRuntimeVersion/microsoft.ml.onnxruntime.$OnnxRuntimeVersion.nupkg"
    Invoke-WebRequest -UseBasicParsing -Uri $cpuUrl -OutFile $cpuPackage
    Expand-Archive -LiteralPath $cpuPackage -DestinationPath $runtimeRoot -Force
}

$nativeRuntime = Join-Path $runtimeRoot "runtimes\win-x64\native"
if (-not (Test-Path -LiteralPath (Join-Path $nativeRuntime "onnxruntime_providers_cuda.dll"))) {
    $gpuPackage = Join-Path $thirdParty "onnxruntime-gpu-windows.nupkg"
    $gpuRoot = Join-Path $thirdParty "onnxruntime-gpu-windows"
    $gpuUrl = "https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime.gpu.windows/$OnnxRuntimeVersion/microsoft.ml.onnxruntime.gpu.windows.$OnnxRuntimeVersion.nupkg"
    Invoke-WebRequest -UseBasicParsing -Uri $gpuUrl -OutFile $gpuPackage
    Expand-Archive -LiteralPath $gpuPackage -DestinationPath $gpuRoot -Force
    $provider = Get-ChildItem -LiteralPath $gpuRoot -Recurse -File -Filter "onnxruntime_providers_cuda.dll" | Select-Object -First 1
    if (-not $provider) { throw "The official GPU package did not contain onnxruntime_providers_cuda.dll" }
    Copy-Item -LiteralPath $provider.FullName -Destination $nativeRuntime -Force
}

cmake -S $root -B $build -A x64
if ($LASTEXITCODE -ne 0) { throw "CMake configure failed" }
cmake --build $build --config $Configuration --parallel
if ($LASTEXITCODE -ne 0) { throw "Native CPU/CUDA build failed" }

$cudaRoot = Join-Path $env:ProgramFiles "NVIDIA GPU Computing Toolkit\CUDA"
$cudaRuntime = if (Test-Path -LiteralPath $cudaRoot) {
    Get-ChildItem -LiteralPath $cudaRoot -Recurse -File -Filter "cudart64_*.dll" |
        Sort-Object FullName -Descending |
        Select-Object -First 1
}
if (-not $cudaRuntime) { throw "CUDA runtime DLL was not found under $cudaRoot" }
Copy-Item -LiteralPath $cudaRuntime.FullName -Destination (Join-Path $build $Configuration) -Force

$runtimeCandidates = @()
if ($CudnnBin) { $runtimeCandidates += $CudnnBin }
if ($env:VIRTUAL_ENV) { $runtimeCandidates += Join-Path $env:VIRTUAL_ENV "Lib\site-packages\torch\lib" }
$suiteTorch = Join-Path $env:USERPROFILE "BeeFaceLocalSuite\AI_MIPS_Hive_Service\.venv\Lib\site-packages\torch\lib"
$runtimeCandidates += $suiteTorch
$cudnnFolder = $runtimeCandidates | Where-Object {
    Test-Path -LiteralPath (Join-Path $_ "cudnn64_9.dll")
} | Select-Object -First 1
if (-not $cudnnFolder) {
    throw "Build succeeded, but cuDNN 9 was not found. Install NVIDIA cuDNN 9 and rerun with -CudnnBin PATH_TO_DLL_FOLDER."
}

Write-Host "Native binaries: $build\$Configuration"
Write-Host "CUDA runtime: $($cudaRuntime.FullName)"
Write-Host "cuDNN runtime: $cudnnFolder"
Write-Host "Benchmark: .\benchmark_native.ps1 -RuntimePaths '$cudnnFolder'"
