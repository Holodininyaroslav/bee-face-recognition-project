# Physical Wings / FWMAV Simulator

This package contains the local FWMAV/bee-shell physical wing simulator used by the Bee Face Recognition Project.

Run `Install and Start Physical Wings.bat` on Windows. The script installs/copies the simulator into WSL Ubuntu under `~/codex_flappy/flappy`, creates a local Python environment when needed, starts `start_flappy_inspector.sh`, and opens `http://127.0.0.1:8099/?fresh=bee-shell-rotated`.

Security note: the simulator runs locally on 127.0.0.1. Do not expose it on 0.0.0.0.
