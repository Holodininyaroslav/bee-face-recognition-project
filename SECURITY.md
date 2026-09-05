# Security and installer update — September 2026

Use these applications only on localhost, without administrator privileges or public port forwarding. A security update reduces known risks; it cannot guarantee that a computer is immune to compromise.

## Changes

* BeeBoard and the packaged Flappy inspector validate Host/Origin and require a session token for JSON POST. Launching programs is no longer permitted through GET. The frontend obtains the token automatically; scripts must first GET `/api/security-token` and pass `X-Local-CSRF`.
* Requests have body/concurrency limits. BeeBoard validates incoming images and bounds the capture queue. These controls do not make arbitrary scientific jobs resource-safe.
* noVNC is loopback-only and refuses to start without an owner-only VNC password file. Create it interactively using `x11vnc -storepasswd ~/.vnc/flappy.pass`, then `chmod 600 ~/.vnc/flappy.pass`; no password is embedded in this repository. Remote access, if needed, must use an authenticated encrypted channel configured separately.
* Flappy policies must be numeric `.npz` arrays with validated shapes and `allow_pickle=False`. Old `.pkl` policies and their automatic conversion are deliberately disabled. Re-export numeric weights from a trusted training environment; never unpickle a downloaded policy.
* The native CUDA SFace loader rejects oversized/inconsistent tensor metadata and invalid layer shapes before use. A host-only parser harness tests corrupt files with sanitizers. Full CUDA inference on all hardware has NOT been certified by this update.
* Updated minimum runtime pins include PyTorch 2.14.0, Pillow 12.3.0, Starlette 1.6.0 and Uvicorn 0.52.4. ONNX Runtime downloads are checked against versioned SHA-512 metadata. Existing cached binaries are not retroactively authenticated; use a fresh build directory for a clean install.
* Model-viewer is vendored instead of fetched dynamically. Check `vendor-integrity.json`, `source/native_face_cuda/nuget-integrity.json`, and `installers/SHA256SUMS.json` for provenance/checksums. Checksums are not code signatures.

Both changed ZIP installers are rebuilt from reviewed source, with old capture/status data excluded. Previously downloaded ZIPs remain old copies: replace them and reinstall. A new dependency pin may require environment migration; GPU/CUDA/cuDNN compatibility still needs verification on the target NVIDIA computer. Do not disable the security controls to work around a failed upgrade.

## Tests and maintenance

`python -m pytest tests/security/test_local_api.py` tests the real ASGI application and numeric policy loader without starting the hardware services. Install the BeeBoard requirements plus pytest, httpx and numpy in an isolated environment. `python tools/rebuild_security_installers.py` rebuilds the two reviewed installer archives.

This review is not a full audit of all dependencies, native inference engines, drivers, git history, account settings or every companion service. Do not expose companion MIPS/AI services directly; the BeeBoard boundary cannot protect an independently exposed service. Report security issues privately to the repository owner, without posting secrets or exploit payloads in public issues.
