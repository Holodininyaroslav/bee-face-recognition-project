# BeeBoard v0.1 Micro KiCad

This is the aggressive compact KiCad revision of BeeBoard v0.1.

- Board size: 20 mm x 12 mm.
- Stackup: 4 copper layers, 0.6 mm target PCB thickness.
- FPGA / future BeeSoC contains the AI MIPS, MatrixAccel, ReLU blocks, crypto,
  power control, motion control, LiFi controller, sensor interface and memory
  controller.
- External parts are kept only where physics forces them off-chip: power
  harvesting/storage, configuration Flash, IMU, optical LiFi devices, low-voltage
  actuator drivers, and flex/castellated edge pads.

The file is a compact layout draft for architecture and mechanical iteration.
It is not a fabrication-ready Gerber package yet.

See `BeeBoard_v0_1_Micro_Explanation_RU.md` for the Russian block/layer
explanation, and use `BeeBoard_v0_1_Micro.glb`,
`BeeBoard_v0_1_Micro_board_layers.step`, and
`BeeBoard_v0_1_Micro_Layered3D.scad` for 3D review.
