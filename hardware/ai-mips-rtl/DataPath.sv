
`timescale 1ns/1ps
`default_nettype none

module DataPath (
    reset_n_synch,
    clock,

    instruction,
    read_data,

    alu_control,
    pc_src,
    mem_to_reg,
    alu_src,
    reg_dest,
    reg_write,
    jump,

    // Matrix accel control
    acc_we_a0, acc_we_a1, acc_we_a2, acc_we_a3,
    acc_we_b0, acc_we_b1, acc_we_b2, acc_we_b3,
    acc_start,
    acc_size,
    acc_clear,
    acc_is_mfacc,
    acc_rd_sel,

    // ReLU accel control
    relu_we0, relu_we1, relu_we2, relu_we3,
    relu_start,
    relu_clear,
    relu_is_mfrelu,
    relu_rd_sel,

    // outputs
    zero_flag,
    pc,
    alu_out,
    write_data
);

    // ----------------------------
    // PORT DECLARATIONS (EXPLICIT)
    // ----------------------------
    input  logic        reset_n_synch;
    input  logic        clock;

    input  logic [31:0] instruction;
    input  logic [31:0] read_data;

    input  logic [2:0]  alu_control;
    input  logic        pc_src;
    input  logic        mem_to_reg;
    input  logic        alu_src;
    input  logic        reg_dest;
    input  logic        reg_write;
    input  logic        jump;

    input  logic        acc_we_a0, acc_we_a1, acc_we_a2, acc_we_a3;
    input  logic        acc_we_b0, acc_we_b1, acc_we_b2, acc_we_b3;
    input  logic        acc_start;
    input  logic [1:0]  acc_size;
    input  logic        acc_clear;
    input  logic        acc_is_mfacc;
    input  logic [1:0]  acc_rd_sel;

    input  logic        relu_we0, relu_we1, relu_we2, relu_we3;
    input  logic        relu_start;
    input  logic        relu_clear;
    input  logic        relu_is_mfrelu;
    input  logic [1:0]  relu_rd_sel;

    output logic        zero_flag;
    output logic [31:0] pc;
    output logic [31:0] alu_out;
    output logic [31:0] write_data;

    // ----------------------------
    // 1) Decode fields
    // ----------------------------
    logic [5:0]  opcode;
    logic [4:0]  rs, rt, rd;
    logic [15:0] imm16;

    assign opcode = instruction[31:26];
    assign rs     = instruction[25:21];
    assign rt     = instruction[20:16];
    assign rd     = instruction[15:11];
    assign imm16  = instruction[15:0];

    // ----------------------------
    // 2) RegFile
    // ----------------------------
    logic [4:0]  write_reg_base;
    logic [4:0]  write_reg;
    logic [31:0] rd1, rd2;
    logic [31:0] wb_data;

    MUX #(.BUS(5)) mux_regdst (
        .data_true  (rd),
        .data_false (rt),
        .sel        (reg_dest),
        .data_out   (write_reg_base)
    );

    assign write_reg = write_reg_base;

    RegFile rf (
        .clock        (clock),
        .reset_n      (reset_n_synch),
        .write_enable (reg_write),
        .addr1        (rs),
        .addr2        (rt),
        .addr3        (write_reg),
        .write_data   (wb_data),
        .rd1          (rd1),
        .rd2          (rd2)
    );

    // ----------------------------
    // 3) immediate
    // ----------------------------
    logic [31:0] imm32;

    always_comb begin
        unique case (opcode)
            6'b001101: imm32 = {16'b0, imm16};            // ORI
            6'b001111: imm32 = {imm16, 16'b0};            // LUI
            default:   imm32 = {{16{imm16[15]}}, imm16};  // sign-extend
        endcase
    end

    // ----------------------------
    // 4) ALU
    // ----------------------------
    logic [31:0] alu_b;
    logic [31:0] alu_result;

    MUX #(.BUS(32)) mux_alusrc (
        .data_true  (imm32),
        .data_false (rd2),
        .sel        (alu_src),
        .data_out   (alu_b)
    );

    ALU #(.WIDTH(32)) alu (
        .reset_n     (reset_n_synch),
        .src_a       (rd1),
        .src_b       (alu_b),
        .alu_control (alu_control),
        .alu_result  (alu_result),
        .zero_flag   (zero_flag)
    );

    assign alu_out    = alu_result;
    assign write_data = rd2;

    // ==========================================================
    // 5) MatrixAccel
    // ==========================================================
    logic [31:0] acc_rd_data;
    logic        acc_busy, acc_done;

    MatrixAccel UACC (
        .clock         (clock),
        .reset_n       (reset_n_synch),

        .acc_we_a0     (acc_we_a0),
        .acc_we_a1     (acc_we_a1),
        .acc_we_a2     (acc_we_a2),
        .acc_we_a3     (acc_we_a3),

        .acc_we_b0     (acc_we_b0),
        .acc_we_b1     (acc_we_b1),
        .acc_we_b2     (acc_we_b2),
        .acc_we_b3     (acc_we_b3),

        .acc_start     (acc_start),
        .acc_size      (acc_size),
        .acc_clear     (acc_clear),

        .rf_rs_data    (rd1),

        .acc_rd_sel    (acc_rd_sel),
        .acc_rd_data   (acc_rd_data),

        .busy          (acc_busy),
        .done          (acc_done)
    );

    // ==========================================================
    // 6) ReLU4_reg
    // ==========================================================
    logic [31:0] relu_rd_data;
    logic        relu_done;

    ReLU4_reg URELU (
        .clock     (clock),
        .reset_n   (reset_n_synch),

        .we0       (relu_we0),
        .we1       (relu_we1),
        .we2       (relu_we2),
        .we3       (relu_we3),

        .start     (relu_start),
        .clear     (relu_clear),

        .write_in  (rd1),

        .rd_sel    (relu_rd_sel),
        .rd_data   (relu_rd_data),

        .done      (relu_done)
    );

    // ----------------------------
    // 7) Writeback mux
    // ----------------------------
    logic [31:0] wb_normal;

    MUX #(.BUS(32)) mux_memtoreg (
        .data_true  (read_data),
        .data_false (alu_result),
        .sel        (mem_to_reg),
        .data_out   (wb_normal)
    );

    always_comb begin
        if (acc_is_mfacc)        wb_data = acc_rd_data;
        else if (relu_is_mfrelu) wb_data = relu_rd_data;
        else                     wb_data = wb_normal;
    end

    // ----------------------------
    // 8) NEXT PC
    // ----------------------------
    logic [31:0] pc_q, pc_plus4, imm_shift2, pc_branch, pc_after_br, pc_jump, pc_next;

    Shifter #(.SHAMT(2), .DIRC(1), .BUS(32)) sh_branch (
        .data_in  (imm32),
        .data_out (imm_shift2)
    );

    Adder #(.BUS(32)) add_pc4 (
        .reset_n  (reset_n_synch),
        .data_a   (pc_q),
        .data_b   (32'd4),
        .data_res (pc_plus4)
    );

    Adder #(.BUS(32)) add_branch (
        .reset_n  (reset_n_synch),
        .data_a   (pc_plus4),
        .data_b   (imm_shift2),
        .data_res (pc_branch)
    );

    MUX #(.BUS(32)) mux_branch (
        .data_true  (pc_branch),
        .data_false (pc_plus4),
        .sel        (pc_src),
        .data_out   (pc_after_br)
    );

    assign pc_jump = {pc_plus4[31:28], instruction[25:0], 2'b00};

    MUX #(.BUS(32)) mux_jump (
        .data_true  (pc_jump),
        .data_false (pc_after_br),
        .sel        (jump),
        .data_out   (pc_next)
    );

    // ----------------------------
    // 9) PC reg
    // ----------------------------
    DFF_ASYNC #(.WIDTH(32)) PC_REG32 (
        .reset_n (reset_n_synch),
        .clock   (clock),
        .d       (pc_next),
        .q       (pc_q)
    );

    assign pc = pc_q;

endmodule

`default_nettype wire