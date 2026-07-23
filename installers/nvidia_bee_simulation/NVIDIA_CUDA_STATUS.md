# NVIDIA CUDA status contract

The NVIDIA matcher is deliberately explicit:

- `backend`: `nvidia-cuda-pytorch`
- `device`: the selected CUDA device, for example `cuda:0`
- `cuda_name`: the NVIDIA device name returned by PyTorch

If CUDA is unavailable, the matcher returns an error and does not silently
fall back to CPU. This keeps the NVIDIA implementation distinguishable from
the repository's existing CPU and AMD/OpenCL paths.
