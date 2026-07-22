// BeeBoard v0.1 Micro layered 3D explanation model
// Units: mm

board_x = 20;
board_y = 12;

module slab(name, z, h, color_value) {
  color(color_value, 0.72)
    translate([0, 0, z])
      cube([board_x, board_y, h], center=false);
}

module block(name, x, y, z, sx, sy, sz, c) {
  color(c)
    translate([x - sx/2, y - sy/2, z])
      cube([sx, sy, sz], center=false);
}

// Stackup, exaggerated in Z for readability.
slab("F.Cu signal/components", 0.90, 0.08, [1.0, 0.55, 0.10]);
slab("FR4 top dielectric",     0.62, 0.28, [0.10, 0.55, 0.20]);
slab("In1.GND solid plane",    0.54, 0.06, [0.55, 0.55, 0.55]);
slab("FR4 prepreg",            0.30, 0.24, [0.10, 0.55, 0.20]);
slab("In2.PWR islands",        0.22, 0.06, [0.95, 0.18, 0.18]);
slab("FR4 bottom dielectric",  0.06, 0.16, [0.10, 0.55, 0.20]);
slab("B.Cu actuator/debug",    0.00, 0.06, [1.0, 0.55, 0.10]);

// Top components
block("U1 FPGA",        9.8, 6.0, 1.05, 7.0, 7.0, 0.85, [0.12, 0.32, 0.80]);
block("U2 Flash",       5.4, 3.6, 1.05, 2.1, 1.8, 0.55, [0.95, 0.45, 0.12]);
block("U3 IMU",         9.8, 1.6, 1.05, 2.4, 1.8, 0.45, [0.10, 0.65, 0.35]);
block("U4 Harvester",   2.8, 6.2, 1.05, 3.0, 3.0, 0.60, [0.85, 0.18, 0.18]);
block("U5 1V2",         5.3, 9.8, 1.05, 1.45, 1.2, 0.45, [0.85, 0.18, 0.18]);
block("U6 3V3",         7.2,10.0, 1.05, 1.45, 1.2, 0.45, [0.85, 0.18, 0.18]);
block("U7 LiFi RX",    16.4, 3.7, 1.05, 2.0, 1.5, 0.50, [0.10, 0.65, 0.35]);
block("U8 LiFi TX drv",16.2, 6.7, 1.05, 1.5, 1.1, 0.45, [0.90, 0.12, 0.35]);
block("D1 LED",        19.15,6.8, 1.05, 0.9, 0.9, 0.35, [1.0, 0.05, 0.05]);
block("D2 photodiode", 19.15,3.7, 1.05, 0.9, 0.9, 0.35, [0.05, 0.8, 0.25]);

// Bottom-side driver positions, shown below the board.
block("U9 wing A",      6.0, 6.2, -0.70, 1.8, 1.5, 0.55, [0.38, 0.42, 0.48]);
block("U10 wing B",     7.9, 6.2, -0.70, 1.8, 1.5, 0.55, [0.38, 0.42, 0.48]);
block("U11 spring",    13.6, 8.9, -0.70, 1.8, 1.5, 0.55, [0.38, 0.42, 0.48]);
block("U12 drill",     16.0, 8.9, -0.70, 1.8, 1.5, 0.55, [0.38, 0.42, 0.48]);