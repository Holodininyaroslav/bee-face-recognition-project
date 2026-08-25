# Installer

The installer ZIP files are attached to the repository release instead of being committed directly.

GitHub rejects ordinary git files above 100 MB, so the complete local runtime is published as a release asset.

- `bee_face_full_local_suite_installer.zip`  
  https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/bee_face_full_local_suite_installer.zip

This is the recommended package. Extract it and run `Install_Hive.bat`. It
installs the local AI MIPS Hive Service menu, backend routes, the native C++ CPU
baseline, the manual C++/CUDA SFace worker, BeeBoard 3D review, Bgame, physical
wing calibration, browser CAD/mechanic simulation, satellite/orbital mechanics,
blockchain/communication concept modules, and the required model assets.

Installation is per-user under `%LOCALAPPDATA%\BeeFaceLocalSuite`. The installer
validates its SHA-256 payload manifest and then verifies dependencies, both
recognition workers and `http://127.0.0.1:8890/`. `Repair_Hive.bat`,
`Verify_Hive.bat`, and `Uninstall_Hive.bat` are included in the same archive.

Individual component archives may still exist on the release as legacy recovery assets, but the normal install path is the full suite.

## NVIDIA/CUDA local game

`nvidia_bee_simulation/` is an additive source package for NVIDIA Windows
systems. It includes the local 2D/3D bee game, its mini-map and statue models,
plus a CUDA-only PyTorch face matcher. The existing AMD/OpenCL and CPU
packages are preserved.
