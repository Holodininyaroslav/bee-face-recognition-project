

`timescale 1ns/1ps
`default_nettype none

module MainDec (
    input  wire [5:0] opcode_md,

    output reg         reg_write,
    output reg         reg_dest,
    output reg         alu_src,
    output reg         branch,
    output reg         mem_write,
    output reg         mem_to_reg,
    output reg  [1:0]  alu_op,
    output reg         jump
);

    // opcodes
    localparam [5:0] OP_RTYPE = 6'b000000;
    localparam [5:0] OP_LW    = 6'b100011;
    localparam [5:0] OP_SW    = 6'b101011;
    localparam [5:0] OP_BEQ   = 6'b000100;
    localparam [5:0] OP_ADDI  = 6'b001000;
    localparam [5:0] OP_ORI   = 6'b001101;
    localparam [5:0] OP_LUI   = 6'b001111;
    localparam [5:0] OP_J     = 6'b000010;

    always @* begin
        // defaults (NOP)
        reg_write  = 1'b0;
        reg_dest   = 1'b0;
        alu_src    = 1'b0;
        branch     = 1'b0;
        mem_write  = 1'b0;
        mem_to_reg = 1'b0;
        alu_op     = 2'b00;
        jump       = 1'b0;

        case (opcode_md)
            OP_RTYPE: begin
                reg_write  = 1'b1;
                reg_dest   = 1'b1;
                alu_src    = 1'b0;
                mem_to_reg = 1'b0;
                mem_write  = 1'b0;
                branch     = 1'b0;
                alu_op     = 2'b10;
                jump       = 1'b0;
            end

            OP_LW: begin
                reg_write  = 1'b1;
                reg_dest   = 1'b0;
                alu_src    = 1'b1;
                mem_to_reg = 1'b1;
                mem_write  = 1'b0;
                branch     = 1'b0;
                alu_op     = 2'b00;
                jump       = 1'b0;
            end

            OP_SW: begin
                reg_write  = 1'b0;
                reg_dest   = 1'b0;
                alu_src    = 1'b1;
                mem_to_reg = 1'b0;
                mem_write  = 1'b1;
                branch     = 1'b0;
                alu_op     = 2'b00;
                jump       = 1'b0;
            end

            OP_BEQ: begin
                reg_write  = 1'b0;
                reg_dest   = 1'b0;
                alu_src    = 1'b0;
                mem_to_reg = 1'b0;
                mem_write  = 1'b0;
                branch     = 1'b1;
                alu_op     = 2'b01;
                jump       = 1'b0;
            end

            OP_ADDI: begin
                reg_write  = 1'b1;
                reg_dest   = 1'b0;
                alu_src    = 1'b1;
                mem_to_reg = 1'b0;
                mem_write  = 1'b0;
                branch     = 1'b0;
                alu_op     = 2'b00;
                jump       = 1'b0;
            end

            OP_LUI: begin
                reg_write  = 1'b1;
                reg_dest   = 1'b0;
                alu_src    = 1'b1;
                mem_to_reg = 1'b0;
                mem_write  = 1'b0;
                branch     = 1'b0;
                alu_op     = 2'b00;
                jump       = 1'b0;
            end

            OP_ORI: begin
                reg_write  = 1'b1;
                reg_dest   = 1'b0;
                alu_src    = 1'b1;
                mem_to_reg = 1'b0;
                mem_write  = 1'b0;
                branch     = 1'b0;
                alu_op     = 2'b11;
                jump       = 1'b0;
            end

            OP_J: begin
                reg_write  = 1'b0;
                reg_dest   = 1'b0;
                alu_src    = 1'b0;
                mem_to_reg = 1'b0;
                mem_write  = 1'b0;
                branch     = 1'b0;
                alu_op     = 2'b00;
                jump       = 1'b1;
            end
        endcase
    end

endmodule

`default_nettype wire