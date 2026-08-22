# Native C++ CPU and CUDA Face Recognition

This directory contains the runtime used by the local Hive and the source code
needed to reproduce it. Python is only the HTTP/Ursina transport layer. Neural
network inference is performed by native C++ executables.

## Active runtime

- `identity_cpu.exe`: C++ ONNX Runtime CPU, one image at a time. This is the
  sequential baseline.
- `identity_cuda.exe`: native C++/CUDA, one tensor batch for 1, 50 or 500
  requested images.
- YuNet detects a face and five landmarks.
- A native C++ similarity transform aligns every face to 112 x 112.
- `src/sface_manual_cuda.cu` performs the trained SFace forward pass with
  project-owned CUDA kernels: preprocessing, 27 convolutions, fused
  BatchNorm/PReLU, tiled pointwise matrix multiplication, the explicit
  `B x 50176` by `50176 x 128` projection and L2 normalization.
- `src/sface_cuda.cu` compares all query/reference embeddings with an explicit
  CUDA kernel and boundary checks.

The CUDA executable uses `CUDAExecutionProvider` for YuNet face detection, then
switches to the manual SFace CUDA implementation. The CUDA SFace route does not
call `Ort::Session::Run`. The executable does not import Python, PyTorch, OpenCV
Python or a Python ONNX Runtime session.

## Current bilingual summary

- [Russian native CPU/CUDA guide](docs/Face_Recognition_CUDA_Demo_Guide_RU.pdf)
- [Hebrew native CPU/CUDA guide](docs/Face_Recognition_CUDA_Demo_Guide_HE.pdf)

Both four-page guides describe the active C++/CUDA path, the exact CPU/GPU
boundary, the 1/50/500 workload semantics, the project-owned score kernel and
the verified native benchmark results. Regenerate them with
`tools/build_demo_guides.py` using the bundled ReportLab runtime.

## Auditable CUDA source

- `src/sface_manual_cuda.cu`: active manual SFace neural-network forward pass.
- `src/sface_cuda.cu`: active cosine-score CUDA kernel for finished embeddings.
- `tools/export_sface_manual_weights.py`: reproducibly exports the trained ONNX
  tensors to `models/sface_manual_weights.bin`; it does not execute inference.
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
python tools\export_sface_manual_weights.py models\sface_dynamic.onnx models\sface_manual_weights.bin
```

## Verified end-to-end results on this computer

Hardware: Intel Core i9-14900K and NVIDIA GeForce RTX 4060.

| Workload | CPU C++ sequential | CUDA C++ batch | Speedup | Correctness |
|---|---:|---:|---:|---:|
| 1 inference | 40.22 ms | 802.67 ms | 0.05x | 1/1 |
| 50 inferences | 1328.64 ms | 1052.77 ms | 1.26x | 50/50 |
| 500 inferences | 14350.40 ms | 3793.61 ms | 3.78x | 500/500 |

The 500-run test uses 50 captured frames with `repeat_each=10`. Every one of the
500 neural-network passes is executed; no duplicate inference is skipped or
replaced by a cached recognition result.

These figures were reproduced on 22 August 2026 with the manual SFace CUDA
forward pass. The educational kernels deliberately expose the matrix and
convolution work instead of delegating it to cuDNN or an inference library, so a
single image pays substantial launch overhead. Batches amortize that overhead:
the tested batch of 500 completed 3.78 times faster than the strictly sequential
CPU baseline while classifying all 500 inputs correctly.

The previous working files are stored in
`../backups/20260821_before_native_cuda` for rollback. Setting
`AI_MIPS_NATIVE_FACE=0` disables the native route without deleting that backup.
