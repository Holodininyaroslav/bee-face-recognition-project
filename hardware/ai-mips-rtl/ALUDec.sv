

module ALUDec (
    input  logic [5:0] funct,
    input  logic [1:0] alu_op,
    output logic [2:0] alu_control
);

    // alu_op
    localparam ALUOP_ADD   = 2'b00; // lw, sw, addi, lui
    localparam ALUOP_SUB   = 2'b01; // beq
    localparam ALUOP_FUNCT = 2'b10; // R-type
    localparam ALUOP_ORI   = 2'b11; // ori

    // funct ??? R-type
    localparam ADDFUN = 6'b100000;
    localparam SUBFUN = 6'b100010;
    localparam ANDFUN = 6'b100100;
    localparam ORFUN  = 6'b100101;
    localparam SLTFUN = 6'b101010;
    localparam MULFUN = 6'b011100;

    // ???? ?????????? ALU (??? ? ????)
    localparam AND = 3'b000;
    localparam OR  = 3'b001;
    localparam ADD = 3'b010;
    localparam SUB = 3'b110;
    localparam MUL = 3'b101;
    localparam SLT = 3'b111;

    always_comb begin
        unique case (alu_op)
            ALUOP_ADD:   alu_control = ADD; // ?????? / addi / lui
            ALUOP_SUB:   alu_control = SUB; // beq
            ALUOP_ORI:   alu_control = OR;  // ori
            ALUOP_FUNCT: begin
                unique case (funct)
                    ADDFUN: alu_control = ADD;
                    SUBFUN: alu_control = SUB;
                    ANDFUN: alu_control = AND;
                    ORFUN:  alu_control = OR;
                    SLTFUN: alu_control = SLT;
                    MULFUN: alu_control = MUL;
                    default: alu_control = ADD;
                endcase
            end
            default: alu_control = ADD;
        endcase
    end

endmodule
