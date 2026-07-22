# Honeybird Colab Bridge

This folder is the handoff point between the BeeBoard web UI and Google Colab.

The web UI writes screenshots into separate queues:

- `inbox/cpu/` for CPU inference
- `inbox/gpu/` for GPU inference

Each PNG has a matching JSON manifest. The manifest includes a locked `backend`
field. The CPU and GPU scripts validate that field before running, so CPU and
GPU captures cannot silently cross over.

## Colab CPU

Upload or mount this `colab_bridge` folder in Colab, then run:

```python
%cd /content/colab_bridge
!python colab_cpu_bee_statue.py
```

## Colab GPU

In Colab choose `Runtime -> Change runtime type -> GPU`, then run:

```python
%cd /content/colab_bridge
!python colab_gpu_bee_statue.py
```

Results are written to:

- `status/cpu/`
- `status/gpu/`

The latest result is also copied to `latest_result.json` inside the matching
backend status folder.
