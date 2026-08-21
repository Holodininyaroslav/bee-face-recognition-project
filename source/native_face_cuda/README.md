# Native C++ CPU and CUDA Face Recognition

This directory contains the runtime used by the local Hive and the source code
needed to reproduce it. Python is only the HTTP/Ursina transport layer. Neural
network inference is performed by native C++ executables.

## Active runtime

- `identity_cpu.exe`: C++ ONNX Runtime CPU, one image at a time. This is the
  sequential baseline.
- `identity_cuda.exe`: C++ ONNX Runtime CUDA, one tensor batch for 1, 50 or 500
  requested images.
- YuNet detects a face and five landmarks.
- A native C++ similarity transform aligns every face to 112 x 112.
- SFace produces the identity embedding.
- `src/sface_cuda.cu` compares all query/reference embeddings with an explicit
  CUDA kernel and boundary checks.

The CUDA executable loads `CUDAExecutionProvider` directly. It does not import
Python, PyTorch, OpenCV Python or a Python ONNX Runtime session.

## Current bilingual summary

- [Russian native CPU/CUDA guide](docs/Face_Recognition_CUDA_Demo_Guide_RU.pdf)
- [Hebrew native CPU/CUDA guide](docs/Face_Recognition_CUDA_Demo_Guide_HE.pdf)

Both four-page guides describe the active C++/CUDA path, the exact CPU/GPU
boundary, the 1/50/500 workload semantics, the project-owned score kernel and
the verified native benchmark results. Regenerate them with
`tools/build_demo_guides.py` using the bundled ReportLab runtime.

## Auditable CUDA source

- `src/sface_cuda.cu`: active SFace cosine-score CUDA kernel.
- `src/deepid_cuda.cu`: complete fallback DeepID CUDA implementation with
  convolution, ReLU, max-pooling, dense, normalization and score kernels.
- `../latest_repo/source/attention/attention_cuda.cu`: course attention example
  with basic and tiled CUDA kernels and exact CPU/CUDA validation.

The fallback binaries are preserved as `identity_deepid_cpu.exe` and
`identity_deepid_cuda.exe`; they are not used by Hive by default.

## Build

Requirements: Visual Studio 2022, CMake, CUDA Toolkit 13.2 and the official
Microsoft ONNX Runtime package under `third_party/onnxruntime`. The CUDA worker
also requires cuDNN 9 and its CUDA 12 runtime libraries. `setup_windows.ps1`
verifies the DLL folder instead of silently relying on a machine-specific PATH.

```powershell
.\setup_windows.ps1 -CudnnBin "C:\path\to\cudnn\bin"
.\benchmark_native.ps1 -RuntimePaths "C:\path\to\cudnn\bin"
```

Dynamic-batch model copies are reproducibly created with:

```powershell
python tools\prepare_onnx_models.py --source-models PATH_TO_MODELS --output models
```

## Verified end-to-end results on this computer

Hardware: Intel Core i9-14900K and NVIDIA GeForce RTX 4060.

| Workload | CPU C++ sequential | CUDA C++ batch | Speedup | Correctness |
|---|---:|---:|---:|---:|
| 50 inferences | 6551.4 ms | 2840.1 ms | 2.31x | 50/50 |
| 500 inferences | 65304.2 ms | 9365.7 ms | 6.97x | 500/500 |

The 500-run test uses 50 captured frames with `repeat_each=10`. Every one of the
500 neural-network passes is executed; no duplicate inference is skipped or
replaced by a cached recognition result.

The previous working files are stored in
`../backups/20260821_before_native_cuda` for rollback. Setting
`AI_MIPS_NATIVE_FACE=0` disables the native route without deleting that backup.
