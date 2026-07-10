

`timescale 1ns/1ps
`default_nettype none

module ControlUnit (
    opcode,
    funct,
    rd,
    zero_flag,

    alu_control,
    mem_to_reg,
    mem_write,
    alu_src,
    reg_dest,
    reg_write,
    jump,
    pc_src,

    acc_we_a0, acc_we_a1, acc_we_a2, acc_we_a3,
    acc_we_b0, acc_we_b1, acc_we_b2, acc_we_b3,
    acc_start,
    acc_size,
    acc_clear,
    acc_is_mfacc,
    acc_rd_sel,

    relu_we0, relu_we1, relu_we2, relu_we3,
    relu_start,
    relu_clear,
    relu_is_mfrelu,
    relu_rd_sel
);

    // ----------------------------
    // PORT DECLS (NON-ANSI)
    // ----------------------------
    input  wire [5:0] opcode;
    input  wire [5:0] funct;
    input  wire [4:0] rd;
    input  wire       zero_flag;

    output wire [2:0] alu_control;
    output wire       mem_to_reg;
    output wire       mem_write;
    output wire       alu_src;
    output wire       reg_dest;
    output wire       reg_write;
    output wire       jump;
    output wire       pc_src;

    output wire       acc_we_a0, acc_we_a1, acc_we_a2, acc_we_a3;
    output wire       acc_we_b0, acc_we_b1, acc_we_b2, acc_we_b3;
    output wire       acc_start;
    output wire [1:0] acc_size;
    output wire       acc_clear;
    output wire       acc_is_mfacc;
    output wire [1:0] acc_rd_sel;

    output wire       relu_we0, relu_we1, relu_we2, relu_we3;
    output wire       relu_start;
    output wire       relu_clear;
    output wire       relu_is_mfrelu;
    output wire [1:0] relu_rd_sel;

    // ----------------------------
    // INTERNAL REGS (drive outputs)
    // ----------------------------
    reg  [2:0] alu_control_r;
    reg        mem_to_reg_r, mem_write_r, alu_src_r, reg_dest_r, reg_write_r, jump_r;
    reg        pc_src_r;

    reg        acc_we_a0_r, acc_we_a1_r, acc_we_a2_r, acc_we_a3_r;
    reg        acc_we_b0_r, acc_we_b1_r, acc_we_b2_r, acc_we_b3_r;
    reg        acc_start_r;
    reg  [1:0] acc_size_r;
    reg        acc_clear_r;
    reg        acc_is_mfacc_r;
    reg  [1:0] acc_rd_sel_r;

    reg        relu_we0_r, relu_we1_r, relu_we2_r, relu_we3_r;
    reg        relu_start_r;
    reg        relu_clear_r;
    reg        relu_is_mfrelu_r;
    reg  [1:0] relu_rd_sel_r;

    assign alu_control = alu_control_r;
    assign mem_to_reg  = mem_to_reg_r;
    assign mem_write   = mem_write_r;
    assign alu_src     = alu_src_r;
    assign reg_dest    = reg_dest_r;
    assign reg_write   = reg_write_r;
    assign jump        = jump_r;
    assign pc_src      = pc_src_r;

    assign acc_we_a0   = acc_we_a0_r;
    assign acc_we_a1   = acc_we_a1_r;
    assign acc_we_a2   = acc_we_a2_r;
    assign acc_we_a3   = acc_we_a3_r;
    assign acc_we_b0   = acc_we_b0_r;
    assign acc_we_b1   = acc_we_b1_r;
    assign acc_we_b2   = acc_we_b2_r;
    assign acc_we_b3   = acc_we_b3_r;
    assign acc_start   = acc_start_r;
    assign acc_size    = acc_size_r;
    assign acc_clear   = acc_clear_r;
    assign acc_is_mfacc= acc_is_mfacc_r;
    assign acc_rd_sel  = acc_rd_sel_r;

    assign relu_we0    = relu_we0_r;
    assign relu_we1    = relu_we1_r;
    assign relu_we2    = relu_we2_r;
    assign relu_we3    = relu_we3_r;
    assign relu_start  = relu_start_r;
    assign relu_clear  = relu_clear_r;
    assign relu_is_mfrelu = relu_is_mfrelu_r;
    assign relu_rd_sel = relu_rd_sel_r;

    // ----------------------------
    // BASE DECODE
    // ----------------------------
    wire [1:0] alu_op_base;
    wire       branch_base;

    wire reg_write_base, reg_dest_base, alu_src_base;
    wire mem_to_reg_base, mem_write_base, jump_base;

    MainDec md(
        .opcode_md  (opcode),
        .reg_write  (reg_write_base),
        .reg_dest   (reg_dest_base),
        .alu_src    (alu_src_base),
        .branch     (branch_base),
        .mem_write  (mem_write_base),
        .mem_to_reg (mem_to_reg_base),
        .alu_op     (alu_op_base),
        .jump       (jump_base)
    );

    ALUDec ad(
        .funct       (funct),
        .alu_op      (alu_op_base),
        .alu_control (alu_control_r)
    );

    // ----------------------------
    // OVERRIDES
    // ----------------------------
    reg branch_final;

    always @(*) begin
        // defaults = base
        reg_write_r  = reg_write_base;
        reg_dest_r   = reg_dest_base;
        alu_src_r    = alu_src_base;
        mem_to_reg_r = mem_to_reg_base;
        mem_write_r  = mem_write_base;
        jump_r       = jump_base;
        branch_final = branch_base;

        // accel defaults
        acc_we_a0_r = 1'b0; acc_we_a1_r = 1'b0; acc_we_a2_r = 1'b0; acc_we_a3_r = 1'b0;
        acc_we_b0_r = 1'b0; acc_we_b1_r = 1'b0; acc_we_b2_r = 1'b0; acc_we_b3_r = 1'b0;
        acc_start_r = 1'b0;
        acc_size_r  = 2'b00;
        acc_clear_r = 1'b0;
        acc_is_mfacc_r = 1'b0;
        acc_rd_sel_r   = rd[1:0];

        relu_we0_r = 1'b0; relu_we1_r = 1'b0; relu_we2_r = 1'b0; relu_we3_r = 1'b0;
        relu_start_r = 1'b0;
        relu_clear_r = 1'b0;
        relu_is_mfrelu_r = 1'b0;
        relu_rd_sel_r    = rd[1:0];

        // custom R-type
        if (opcode == 6'b000000) begin

            // LOADA (funct[5:2]==8)
            if (funct[5:2] == 4'h8) begin
                reg_write_r  = 1'b0; mem_write_r = 1'b0; mem_to_reg_r = 1'b0; jump_r = 1'b0; branch_final = 1'b0;
                case (funct[1:0])
                    2'b00: acc_we_a0_r = 1'b1;
                    2'b01: acc_we_a1_r = 1'b1;
                    2'b10: acc_we_a2_r = 1'b1;
                    2'b11: acc_we_a3_r = 1'b1;
                endcase
            end

            // LOADB (funct[5:2]==9)
            else if (funct[5:2] == 4'h9) begin
                reg_write_r  = 1'b0; mem_write_r = 1'b0; mem_to_reg_r = 1'b0; jump_r = 1'b0; branch_final = 1'b0;
                case (funct[1:0])
                    2'b00: acc_we_b0_r = 1'b1;
                    2'b01: acc_we_b1_r = 1'b1;
                    2'b10: acc_we_b2_r = 1'b1;
                    2'b11: acc_we_b3_r = 1'b1;
                endcase
            end

            // CLEAR (0x28)
            else if (funct == 6'h28) begin
                reg_write_r  = 1'b0; mem_write_r = 1'b0; mem_to_reg_r = 1'b0; jump_r = 1'b0; branch_final = 1'b0;
                acc_clear_r  = 1'b1;
            end

            // START (funct[5:2]==0xC)
            else if (funct[5:2] == 4'hC) begin
                reg_write_r  = 1'b0; mem_write_r = 1'b0; mem_to_reg_r = 1'b0; jump_r = 1'b0; branch_final = 1'b0;
                acc_start_r  = 1'b1;
                acc_size_r   = (funct[1:0] == 2'b11) ? 2'b11 : 2'b00;
            end

            // MFACC (0x2A)
            else if (funct == 6'h2A) begin
                mem_write_r  = 1'b0; mem_to_reg_r = 1'b0; jump_r = 1'b0; branch_final = 1'b0;
                reg_write_r  = 1'b1;
                reg_dest_r   = 1'b1;
                acc_is_mfacc_r = 1'b1;
                acc_rd_sel_r   = rd[1:0];
            end

            // RELU_LOAD (funct[5:2]==0xD)
            else if (funct[5:2] == 4'hD) begin
                reg_write_r  = 1'b0; mem_write_r = 1'b0; mem_to_reg_r = 1'b0; jump_r = 1'b0; branch_final = 1'b0;
                case (funct[1:0])
                    2'b00: relu_we0_r = 1'b1;
                    2'b01: relu_we1_r = 1'b1;
                    2'b10: relu_we2_r = 1'b1;
                    2'b11: relu_we3_r = 1'b1;
                endcase
            end

            // RELU_CLEAR (0x38)
            else if (funct == 6'h38) begin
                reg_write_r  = 1'b0; mem_write_r = 1'b0; mem_to_reg_r = 1'b0; jump_r = 1'b0; branch_final = 1'b0;
                relu_clear_r = 1'b1;
            end

            // RELU_START (0x39)
            else if (funct == 6'h39) begin
                reg_write_r  = 1'b0; mem_write_r = 1'b0; mem_to_reg_r = 1'b0; jump_r = 1'b0; branch_final = 1'b0;
                relu_start_r = 1'b1;
            end

            // MFRELU (0x3A)
            else if (funct == 6'h3A) begin
                mem_write_r  = 1'b0; mem_to_reg_r = 1'b0; jump_r = 1'b0; branch_final = 1'b0;
                reg_write_r  = 1'b1;
                reg_dest_r   = 1'b1;
                relu_is_mfrelu_r = 1'b1;
                relu_rd_sel_r    = rd[1:0];
            end
        end
    end

    // pc_src
    always @(*) begin
        pc_src_r = branch_final & zero_flag;
    end

endmodule

`default_nettype wire