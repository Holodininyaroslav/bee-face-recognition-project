Standalone 3D Bee Space

This is a separate copy of the 3D bee/statue simulation.
It does not connect to the web interface, Colab, AI MIPS Hive, or BeeBoard.

Run:
  Start Bee 3D Standalone.bat
  Start Bee 2D Map.bat

Start screen:
  Easy   - slow bee
  Normal - medium bee
  Hard   - fast bee

Speed is locked after difficulty selection.
The number keys do not change speed in this standalone version.

Camera:
  Third-person chase view is enabled by default.

Local face recognition:
  After difficulty selection the game runs a local NVIDIA CUDA/PyTorch face scan.
  Results are written to local_face_ai\identity_output\latest_identity_result.json.
  Press C, G, or R in the 3D window to run another local NVIDIA CUDA scan.

2D map:
  Start Bee 2D Map.bat opens a top-down X/Z map.
  Bee is yellow. Faraj is red, Slava is green, Adi is blue.
