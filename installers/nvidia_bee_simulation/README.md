# NVIDIA CUDA Bee Simulation

This folder is an additive NVIDIA implementation of the local bee game. The
existing AMD/OpenCL and CPU paths in the repository are not replaced.

Included:

- the local 2D bee game and linked Ursina 3D scene;
- the in-game mini-map and three face statues (Faraj, Slava, Adi);
- the bee model, statue models, and face reference images;
- a CUDA-only local face matcher implemented with PyTorch;
- launch scripts that keep the NVIDIA path separate from the existing game.

## Requirements

- Windows 10/11
- NVIDIA driver with a working CUDA runtime
- Python 3.12
- a CUDA-enabled PyTorch build, installed from the official PyTorch selector
- the packages listed in `Bee_3D_Standalone/requirements.txt`

Install the Python packages in the same environment that will start the game.
The matcher checks `torch.cuda.is_available()` and stops with a clear error when
the selected Python environment has only a CPU build of PyTorch.

## Run

Start `Start NVIDIA Bee Simulation.bat`. The game opens the 3D bee space with
the mini-map. Select a difficulty, then use the existing face-scan controls.
The local result is written to:

```text
Bee_3D_Standalone/local_face_ai/identity_output/latest_identity_result.json
```

The result backend is reported as `nvidia-cuda-pytorch` and includes the CUDA
device name. The face crop detector uses the bundled OpenCV Haar cascade; the
embedding and matching work is performed on the NVIDIA GPU.

## Scope

This is a local Windows implementation. It does not change the public web
demo, the existing AMD/OpenCL detector, or the original local game package.
