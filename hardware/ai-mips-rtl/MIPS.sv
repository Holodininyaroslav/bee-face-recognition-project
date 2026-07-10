


`timescale 1ns/1ps
`default_nettype none

module MIPS (
    reset_n,
    clock,
    instruction,
    read_data,
    pc,
    alu_out,
    write_data,
    mem_write
);

    // ----------------------------
    // EXPLICIT PORT DECLARATIONS
    // ----------------------------
    input  wire        reset_n;
    input  wire        clock;
    input  wire [31:0] instruction;
    input  wire [31:0] read_data;

    output wire [31:0] pc;
    output wire [31:0] alu_out;
    output wire [31:0] write_data;
    output wire        mem_write;

    // ----------------------------
    // Internal wires
    // ----------------------------
    wire        reg_write_w, reg_dest_w, alu_src_w, mem_to_reg_w, jump_w, pc_src_w;
    wire [2:0]  alu_control_w;
    wire        zero_w;

    // Matrix accel wires
    wire        acc_we_a0_w, acc_we_a1_w, acc_we_a2_w, acc_we_a3_w;
    wire        acc_we_b0_w, acc_we_b1_w, acc_we_b2_w, acc_we_b3_w;
    wire        acc_start_w;
    wire [1:0]  acc_size_w;
    wire        acc_clear_w;
    wire        acc_is_mfacc_w;
    wire [1:0]  acc_rd_sel_w;

    // ReLU accel wires
    wire        relu_we0_w, relu_we1_w, relu_we2_w, relu_we3_w;
    wire        relu_start_w;
    wire        relu_clear_w;
    wire        relu_is_mfrelu_w;
    wire [1:0]  relu_rd_sel_w;

    // ----------------------------
    // ControlUnit
    // ----------------------------
    ControlUnit CU (
        .opcode        (instruction[31:26]),
        .funct         (instruction[5:0]),
        .rd            (instruction[15:11]),
        .zero_flag     (zero_w),

        // Standard
        .alu_control   (alu_control_w),
        .mem_to_reg    (mem_to_reg_w),
        .mem_write     (mem_write),
        .alu_src       (alu_src_w),
        .reg_dest      (reg_dest_w),
        .reg_write     (reg_write_w),
        .jump          (jump_w),
        .pc_src        (pc_src_w),

        // Matrix accel
        .acc_we_a0     (acc_we_a0_w),
        .acc_we_a1     (acc_we_a1_w),
        .acc_we_a2     (acc_we_a2_w),
        .acc_we_a3     (acc_we_a3_w),
        .acc_we_b0     (acc_we_b0_w),
        .acc_we_b1     (acc_we_b1_w),
        .acc_we_b2     (acc_we_b2_w),
        .acc_we_b3     (acc_we_b3_w),
        .acc_start     (acc_start_w),
        .acc_size      (acc_size_w),
        .acc_clear     (acc_clear_w),
        .acc_is_mfacc  (acc_is_mfacc_w),
        .acc_rd_sel    (acc_rd_sel_w),

        // ReLU accel
        .relu_we0      (relu_we0_w),
        .relu_we1      (relu_we1_w),
        .relu_we2      (relu_we2_w),
        .relu_we3      (relu_we3_w),
        .relu_start    (relu_start_w),
        .relu_clear    (relu_clear_w),
        .relu_is_mfrelu(relu_is_mfrelu_w),
        .relu_rd_sel   (relu_rd_sel_w)
    );

    // ----------------------------
    // DataPath
    // ----------------------------
    DataPath DP (
        .reset_n_synch  (reset_n),
        .clock          (clock),

        .instruction    (instruction),
        .read_data      (read_data),

        // Standard
        .alu_control    (alu_control_w),
        .pc_src         (pc_src_w),
        .mem_to_reg     (mem_to_reg_w),
        .alu_src        (alu_src_w),
        .reg_dest       (reg_dest_w),
        .reg_write      (reg_write_w),
        .jump           (jump_w),

        // Matrix accel
        .acc_we_a0      (acc_we_a0_w),
        .acc_we_a1      (acc_we_a1_w),
        .acc_we_a2      (acc_we_a2_w),
        .acc_we_a3      (acc_we_a3_w),
        .acc_we_b0      (acc_we_b0_w),
        .acc_we_b1      (acc_we_b1_w),
        .acc_we_b2      (acc_we_b2_w),
        .acc_we_b3      (acc_we_b3_w),
        .acc_start      (acc_start_w),
        .acc_size       (acc_size_w),
        .acc_clear      (acc_clear_w),
        .acc_is_mfacc   (acc_is_mfacc_w),
        .acc_rd_sel     (acc_rd_sel_w),

        // ReLU accel
        .relu_we0       (relu_we0_w),
        .relu_we1       (relu_we1_w),
        .relu_we2       (relu_we2_w),
        .relu_we3       (relu_we3_w),
        .relu_start     (relu_start_w),
        .relu_clear     (relu_clear_w),
        .relu_is_mfrelu (relu_is_mfrelu_w),
        .relu_rd_sel    (relu_rd_sel_w),

        // Outputs
        .zero_flag      (zero_w),
        .pc             (pc),
        .alu_out        (alu_out),
        .write_data     (write_data)
    );

endmodule

`default_nettype wire