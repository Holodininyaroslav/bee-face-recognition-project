# Installer

The installer ZIP files are attached to the repository release instead of being committed directly.

GitHub rejects ordinary git files above 100 MB, so the complete local runtime is published as a release asset.

- `bee_face_full_local_suite_installer.zip`  
  https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/bee_face_full_local_suite_installer.zip

This is the recommended package. It installs the local AI MIPS Hive Service menu, backend routes, BeeBoard 3D review, Bgame, physical wing calibration, browser CAD/mechanic simulation, satellite/orbital mechanics, blockchain/communication concept modules, and the model assets needed by the local browser menu.

Individual component archives may still exist on the release as legacy recovery assets, but the normal install path is the full suite.

## NVIDIA/CUDA local game

`nvidia_bee_simulation/` is an additive source package for NVIDIA Windows
systems. It includes the local 2D/3D bee game, its mini-map and statue models,
plus a CUDA-only PyTorch face matcher. The existing AMD/OpenCL and CPU
packages are preserved.
