# Install BeeFace Hive on Another Windows Computer

Use the complete, versioned installer from the latest GitHub release:

https://github.com/Holodininyaroslav/bee-face-recognition-project/releases/latest/download/bee_face_full_local_suite_installer.zip

## Requirements

- Windows 10 or Windows 11, 64-bit.
- Internet access during the first installation.
- An NVIDIA GPU and current NVIDIA driver for the CUDA route.
- About 5 GB of free disk space for the package, installed files, and Python environment.

The CPU route works without an NVIDIA GPU. Python 3.12 is installed for the
current user through Windows Package Manager if Python 3.9-3.12 x64 is not
already available.

## Install

1. Download `bee_face_full_local_suite_installer.zip` from the link above.
2. Extract the complete archive to a normal writable folder.
3. Double-click `Install_Hive.bat`.
4. Keep the terminal open until every payload, dependency, CPU, CUDA, model, and
   Hive API check reports success.
5. Open `http://127.0.0.1:8890/` or use the `Start BeeFace Hive` desktop shortcut.

The default installation directory is:

```text
%LOCALAPPDATA%\BeeFaceLocalSuite
```

Administrator rights are not required. The installer creates an isolated
Python environment and does not depend on the source checkout after installation.

## What Is Verified

The installer checks the SHA-256 payload manifest before copying any file. It
then verifies:

- the Hive web application and local bridge;
- the Python dependency set;
- YuNet and SFace model files;
- native `identity_cpu.exe` recognition;
- native `identity_cuda.exe` recognition with backend marker
  `manual-cuda-sface`;
- the Hive home page and API at `127.0.0.1:8890`.

The CUDA worker uses ONNX Runtime CUDA for YuNet detection. The trained SFace
forward pass is executed by the project's explicit CUDA kernels in
`sface_manual_cuda.cu`; cosine matching is executed by `sface_cuda.cu`. Python
provides the Hive HTTP and simulation integration, not the SFace neural-network
forward pass.

## Maintenance

The extracted package contains:

- `Start_Hive.bat` to start or reopen the local Hive;
- `Verify_Hive.bat` to re-run file, dependency, CPU, CUDA, and API checks;
- `Repair_Hive.bat` to restore the payload and Python environment;
- `Uninstall_Hive.bat` to remove the per-user installation safely.

If the browser reports `ERR_CONNECTION_REFUSED`, run `Start_Hive.bat`. If that
does not restore the service, run `Verify_Hive.bat`, followed by
`Repair_Hive.bat` if a check fails.

## Source and Web Demonstration

- Repository: https://github.com/Holodininyaroslav/bee-face-recognition-project
- Seven-stage CUDA demonstration: https://holodininyaroslav.github.io/bee-face-recognition-project/
- Native CUDA source: `source/native_face_cuda/src/`

The release archive is the supported installation path. Individual legacy
component archives remain available only for recovery and historical use.
