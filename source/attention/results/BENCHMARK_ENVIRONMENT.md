# Benchmark environment

- Date: 2026-08-21
- CPU: Intel Core i9-14900K, 24 physical cores, 32 logical processors
- GPU: NVIDIA GeForce RTX 4060, 8188 MiB
- GPU compute capability: 8.9
- GPU multiprocessors: 24 SM
- NVIDIA driver: 610.62
- CUDA Toolkit / NVCC: 13.2.78
- OS: Windows x64
- Compiler: MSVC 19.44.35228 with NVCC host integration
- Attention dimensions: N=512, d=64
- Input seed: 2026
- Warm-up iterations: 5
- Measured iterations: 50
- Correctness tolerance: max absolute error <= 2e-4

The CPU reference is intentionally single-threaded and naive, as required by
the assignment. CPU score/output workspaces and CUDA device buffers are both
allocated once before warm-up. The measured CPU time contains only the nested
Attention loops. CUDA headline speedup uses a warmed end-to-end time that also
includes H2D input copies, kernels, synchronization and D2H output copy. CUDA
context creation and `cudaMalloc` are excluded. This is a conservative
steady-state comparison: repeated CPU allocation cannot inflate the speedup.
