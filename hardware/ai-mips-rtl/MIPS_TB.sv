

//==============================================================
// MIPS_tb.sv ? testbench for MIPS.sv (ModelSim-friendly)
//==============================================================
`timescale 1ns/1ps
`default_nettype none

module MIPS_tb;

  // -------------------- clock/reset --------------------
  logic clock;
  logic reset_n;

  initial begin
    clock = 1'b0;
    forever #5 clock = ~clock;   // 10ns period
  end

  initial begin
    reset_n = 1'b0;
    repeat (3) @(posedge clock);
    reset_n = 1'b1;
  end

  // -------------------- DUT I/O --------------------
  logic [31:0] instruction;
  logic [31:0] read_data;

  wire  [31:0] pc;
  wire  [31:0] alu_out;
  wire  [31:0] write_data;
  wire         mem_write;

  MIPS dut (
    .reset_n    (reset_n),
    .clock      (clock),
    .instruction(instruction),
    .read_data  (read_data),
    .pc         (pc),
    .alu_out    (alu_out),
    .write_data (write_data),
    .mem_write  (mem_write)
  );

  //==============================================================
  // Instruction Memory
  //==============================================================
  logic [31:0] imem [0:255];

  //==============================================================
  // Data Memory
  //==============================================================
  logic [31:0] dmem [0:255];

  // async read
  always @(*) begin
    read_data = dmem[alu_out[9:2]];
  end

  // sync write  (IMPORTANT: use always, not always_ff)
  always @(posedge clock) begin
    if (mem_write) begin
      dmem[alu_out[9:2]] <= write_data;
    end
  end

  //==============================================================
  // Helpers to build instructions
  //==============================================================
  function automatic [31:0] I_type(
    input [5:0] opcode,
    input [4:0] rs,
    input [4:0] rt,
    input [15:0] imm
  );
    I_type = {opcode, rs, rt, imm};
  endfunction

  function automatic [31:0] R_type(
    input [4:0] rs,
    input [4:0] rt,
    input [4:0] rd,
    input [4:0] shamt,
    input [5:0] funct
  );
    R_type = {6'b000000, rs, rt, rd, shamt, funct};
  endfunction

  function automatic [31:0] J_type(
    input [5:0] opcode,
    input [25:0] target
  );
    J_type = {opcode, target};
  endfunction

  //==============================================================
  // Program load
  //==============================================================
  localparam [5:0] OP_ADDI = 6'h08;
  localparam [5:0] OP_LW   = 6'h23;
  localparam [5:0] OP_SW   = 6'h2B;
  localparam [5:0] OP_BEQ  = 6'h04;

  localparam [4:0] R_ZERO = 5'd0;
  localparam [4:0] R_T0   = 5'd8;
  localparam [4:0] R_T1   = 5'd9;
  localparam [4:0] R_T2   = 5'd10;
  localparam [4:0] R_T3   = 5'd11;

  integer i;

  initial begin
    // clear memories
    for (i = 0; i < 256; i = i + 1) begin
      imem[i] = 32'h0000_0000;
      dmem[i] = 32'h0000_0000;
    end

    // program
    imem[0] = I_type(OP_ADDI, R_ZERO, R_T0, 16'd5);     // t0=5
    imem[1] = I_type(OP_ADDI, R_ZERO, R_T1, 16'd100);   // t1=100
    imem[2] = I_type(OP_SW,   R_T1,   R_T0, 16'd0);     // mem[t1+0]=t0
    imem[3] = I_type(OP_LW,   R_T1,   R_T2, 16'd0);     // t2=mem[t1+0]
    imem[4] = I_type(OP_BEQ,  R_T2,   R_T0, 16'd1);     // if equal skip
    imem[5] = I_type(OP_ADDI, R_ZERO, R_T3, 16'd1);     // should skip
    imem[6] = I_type(OP_ADDI, R_ZERO, R_T3, 16'd2);     // label
    imem[7] = 32'h0000_0000;                            // nop

    // preload data memory at word address 25 (100>>2)
    dmem[25] = 32'hDEAD_BEEF;
  end

  // instruction fetch
  always @(*) begin
    instruction = imem[pc[9:2]];
  end

  //==============================================================
  // Monitor
  //==============================================================
  initial begin
    $display("time   pc        instr      alu_out   mem_write write_data read_data");
    $monitor("%4t  %08h  %08h  %08h    %0d      %08h  %08h",
             $time, pc, instruction, alu_out, mem_write, write_data, read_data);
  end

  //==============================================================
  // Check result
  //==============================================================
  initial begin
    repeat (15) @(posedge clock);

    if (dmem[25] !== 32'd5) begin
      $display("FAIL: dmem[100] expected 5, got %0d (0x%08h)", dmem[25], dmem[25]);
    end else begin
      $display("PASS: dmem[100] = %0d (0x%08h)", dmem[25], dmem[25]);
    end

    $finish;
  end

endmodule

`default_nettype wire
