# Report: Scaled Dot-Product Attention on CPU and CUDA

## Objective

The project implements:

`Attention(Q,K,V) = softmax((Q*K^T)/sqrt(d))*V`

The required case uses `N=512`, `d=64`, and deterministic Q, K, V matrices
generated with seed 2026. Every implementation receives identical data.

## Sequential CPU baseline

`attention_cpu.cpp` evaluates both matrix products and row-wise softmax with
ordinary nested C++ loops. It does not use CUDA, OpenMP, or a GPU-produced
answer. It is deliberately single-threaded so it provides the naive sequential
baseline required by the assignment.

## Basic CUDA mapping

1. `qk_matmul_basic`: a two-dimensional grid assigns one thread to one element
   of `Q*K^T`.
2. `scale_scores`: one thread multiplies one score by `1/sqrt(d)`.
3. `row_softmax`: one 256-thread block handles one row. Shared-memory
   reductions find its maximum and the sum of `exp(x-max)`.
4. `attention_v_basic`: a two-dimensional grid assigns one thread to one
   output element of `P*V`.

Q, K, V, scores, and output use explicit `cudaMalloc` allocations. Input data
is copied with Host-to-Device `cudaMemcpy`; the final output is copied back with
Device-to-Host `cudaMemcpy`. Boundary checks protect partial final blocks.

## Optimized CUDA mapping

`qk_matmul_tiled_scaled` and `attention_v_tiled` use `16x16` thread blocks and
shared-memory tiles. Each loaded tile is reused by 16 multiply-add steps.
Scaling is fused into the QK result write, reducing one kernel launch and an
extra global-memory pass. `__syncthreads()` protects both tile-loading phases.

## Correctness and timing policy

- Five warm-up iterations are excluded.
- Fifty iterations are measured for each implementation.
- CUDA Events measure `kernel_ms`.
- `end_to_end_ms` includes H2D copies, all kernels, synchronization, and D2H.
- CPU time includes the temporary score/output vector construction performed
  by the naive reference on every call. CUDA device buffers are allocated once
  before warm-up, so the CUDA number represents a warmed reusable worker.
- Process startup, CUDA context creation, and first-use initialization are not
  included; the table is a steady-state throughput comparison.
- Every output is compared element by element with the CPU reference.
- The accepted tolerance is `max_abs_error <= 2e-4`; failure returns exit code 2.

Verified environment: Intel Core i9-14900K, NVIDIA GeForce RTX 4060 8 GB,
compute capability 8.9, 24 SMs, CUDA Toolkit/NVCC 13.2.

| Implementation | Kernel ms | End-to-end ms | Speedup vs CPU | Status |
|---|---:|---:|---:|---|
| CPU naive | - | 10.6346 | 1.00x | PASS |
| CUDA basic | 0.251794 | 0.350112 | 30.37x | PASS |
| CUDA optimized | 0.114701 | 0.211658 | 50.24x | PASS |

Both CUDA variants produced `max_abs_error=4.47035e-08`, so the measured
acceleration did not trade away numerical correctness.

## Bottlenecks and possible improvements

- Both matrix products perform `O(N^2*d)` work.
- The `N^2` score matrix creates substantial global-memory traffic.
- Softmax needs row reductions and synchronization.
- Kernel-launch and PCIe overhead reduce speedup for small N.
- Larger or specialized tiles require occupancy, register, and shared-memory
  analysis rather than assuming that a larger block is faster.

Face recognition is retained as a supplementary real CUDA batching example.
It does not replace the mandatory Attention implementation described above.
