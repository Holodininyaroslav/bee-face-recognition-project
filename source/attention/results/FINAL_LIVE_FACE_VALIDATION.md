# Final live face-pipeline validation

Date: 2026-08-22  
Hive: `http://127.0.0.1:8890`  
GPU: NVIDIA GeForce RTX 4060  
CPU backend: `native-cpp-onnxruntime-cpu-yunet-sface-sequential`  
CUDA backend: `native-cpp-onnxruntime-cuda-yunet-sface`

## Identity smoke test

One reference image for each person was submitted to both backends. CPU and
CUDA both returned `Adi, Faraj, Slava`, all three results were accepted, and
neither response contained an error.

## Controlled batch tests

Both tests use the same fixed 50-image manifest. Inputs are not deduplicated.
The CPU backend processes physical attempts sequentially; the CUDA backend
uses dynamic batches.

| Test | CPU wall time | CUDA wall time | CUDA speedup | Label agreement | Errors |
|---|---:|---:|---:|---:|---:|
| 50 images x 1 = 50 physical attempts | 6730.2 ms | 3121.5 ms | 2.16x | 100% | 0 |
| 50 images x 10 = 500 physical attempts | 62080.4 ms | 12321.8 ms | 5.04x | 100% | 0 |

The 500-attempt response contains 50 per-image result records because each
record aggregates ten deliberately repeated executions of that image. The
response field `physical_attempt_count` is 500, and the benchmark rejects the
run unless it equals the requested count.

Raw data and immutable input hashes are in `final-live-batch50/` and
`final-live-batch500/`.
