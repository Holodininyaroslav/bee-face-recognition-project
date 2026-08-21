# Assignment compliance

This directory implements the exact required formula:

`Attention(Q,K,V) = softmax((Q*K^T)/sqrt(d))*V`

## Required CUDA implementation

- `attention_cuda.cu` is CUDA C++, compiled by NVCC.
- Basic `Q*K^T`, scaling, row softmax and `P*V` are separate kernels.
- Basic matrix kernels use a two-dimensional grid and one thread per output.
- Every kernel that can exceed a logical dimension has boundary checks.
- Stable softmax subtracts the row maximum and uses shared-memory reductions.
- Host/device memory uses `cudaMalloc`, `cudaMemcpy` and `cudaFree`.
- The optimized path uses 16x16 shared-memory tiles and fused scaling.

## Verification and performance

- The CPU reference is a separate naive C++ implementation.
- CPU, CUDA basic and CUDA optimized process the same deterministic Q/K/V.
- Both CUDA results are compared element by element with the CPU result.
- A failed tolerance check returns exit code 2.
- `kernel_ms` is measured with CUDA Events.
- `end_to_end_ms` includes H2D copies, kernels, synchronization and D2H output.
- `speedup_vs_cpu` uses end-to-end CUDA time for the fair headline comparison.
- `verify_cuda_assignment.bat` builds and runs the required `N=512`, `d=64` case.

The face-recognition simulation is an additional real-world CUDA demonstration.
It is not used as a substitute for this mandatory Attention implementation.
