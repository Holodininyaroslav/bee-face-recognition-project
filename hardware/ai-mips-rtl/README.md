# AI MIPS RTL Hardware Sources

This folder contains the SystemVerilog hardware part of the Bee Face Recognition Project.

The Hive UI uses software simulation to show processors and messages, but the project also includes partial hardware sources for an AI MIPS processor / accelerator path:

- `MIPS.sv` - top-level MIPS processor module.
- `ControlUnit.sv`, `MainDec.sv`, `ALUDec.sv` - control logic.
- `DataPath.sv`, `RegFile.sv`, `DataMem.sv`, `InstrMem.sv` - processor datapath and memory blocks.
- `ALU.sv`, `CLA_Adder.sv`, `Adder.sv`, `Shifter.sv`, `MUX.sv`, `SignExtn.sv` - arithmetic and data routing blocks.
- `MatrixAccel.sv`, `Mat_Mul.sv`, `ReLU4.sv` - AI-oriented accelerator / neural-network helper blocks.
- `Top.sv` - top-level integration wrapper.
- `*_tb.sv` files - simulation testbenches.
- `prog*.txt` and `program_1.asm` - example program inputs.
- `AI_MIPS.qpf` and `AI_MIPS.qsf` - Quartus project/settings files.

Current status: hardware source / educational prototype. These files are included so the project is not only a web/software simulation; it also keeps the partial RTL that represents the AI MIPS processor layer planned for the bee compute nodes.
