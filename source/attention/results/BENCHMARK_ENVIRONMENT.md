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
the assignment. Its measured function body includes construction of the
temporary score and output vectors on every call. CUDA headline speedup uses a
warmed, reusable-device-buffer end-to-end time: H2D input copies, kernels,
synchronization and D2H output copy. CUDA context creation and `cudaMalloc`
occur once before warm-up and are excluded. The reported speedup therefore
describes steady-state repeated inference, not cold process startup.
