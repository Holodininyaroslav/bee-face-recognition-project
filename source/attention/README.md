# Scaled Dot-Product Attention - CUDA course submission

This directory is the self-contained submission for:

`Attention(Q,K,V) = softmax((Q*K^T)/sqrt(d))*V`

## One-command verification on Windows

Requirements: NVIDIA GPU, CUDA Toolkit/NVCC, CMake, and Visual Studio C++ tools.

```bat
verify_cuda_assignment.bat
```

The command builds the native C++/CUDA benchmark executable (which contains
the independent sequential CPU baseline and both CUDA paths), runs the required
`N=512`, `d=64` case, checks CUDA basic and optimized output against the
independent CPU reference, and writes `results/rtx4060-n512-d64.csv`.

## Files

- `attention_cpu.cpp`: independent naive CPU reference.
- `attention_cuda.cu`: mandatory basic and optimized CUDA implementations.
- `attention_opencl.cpp` and `attention.cl`: optional OpenCL comparison path.
- `include/`: declarations needed by the CPU/OpenCL executable.
- `CMakeLists.txt`: reproducible native and NVCC build.
- `build_cuda_windows.bat`: strict CUDA build; no silent CPU fallback.
- `verify_cuda_assignment.bat`: build, benchmark, correctness and CSV check.
- `REPORT_RU.md`: implementation, mapping, performance and bottleneck analysis.
- `ASSIGNMENT_COMPLIANCE.md`: concise requirement checklist.
- `tools/benchmark_face_pipeline.py`: supplementary controlled CPU/CUDA face test.

## Timing policy

- CPU time measures the naive sequential loops with score/output workspaces
  allocated once before warm-up.
- `kernel_ms` uses CUDA Events and measures only the CUDA kernels.
- `end_to_end_ms` includes Q/K/V host-to-device copies, all kernels,
  synchronization and output device-to-host copy.
- Headline speedup is `CPU compute / CUDA end_to_end_ms`; CUDA includes H2D/D2H,
  so repeated CPU allocation cannot inflate the result.
- Both paths use identical deterministic inputs, warm-up counts and measured
  iteration counts.

## Supplementary face-recognition benchmark

The course requirement is fulfilled by `attention_cuda.cu`. Face recognition
is an additional real application of GPU batching. With the local Hive running:

```bat
python tools\benchmark_face_pipeline.py ^
  --images "PATH_TO_FIXED_REFERENCE_IMAGES" ^
  --count 50 --repeat-each 1 --runs 10 --warmup 1 ^
  --output-dir results\face-pipeline
```

For 500 physical attempts, use `--count 50 --repeat-each 10`. The tool writes a
SHA-256 manifest, alternates CPU/CUDA order, verifies the requested attempt
count, records every run, and reports mean, median, P95, throughput and
position-by-position CPU/CUDA label agreement.
