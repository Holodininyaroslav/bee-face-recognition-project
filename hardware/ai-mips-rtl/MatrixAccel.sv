
`timescale 1ns/1ps
`default_nettype none

//==============================================================
// MatrixAccel (RU)
// ?????????? ?????? ?? 4 ???????????? Mat_mult.
// ?????????:
//  - acc_size = 2'b00 : ????? "2x2" (?????????? ?????? U0, ????? C00)
//  - acc_size = 2'b11 : ????? "4x4 ? 2 ????":
//      PH0: (A00,A10) x (B00,B01) -> C00,C01,C10,C11 (????????)
//      PH1: (A01,A11) x (B10,B11) -> ?????????? ? C00,C01,C10,C11
//
// ?????????:
//  - rf_rs_data: ?????, ??????? ????? ? A*/B* ?? ??????? acc_we_*
//  - acc_start: ????? ??????????
//  - acc_clear: ??????? C*
//  - acc_rd_sel / acc_rd_data: ?????? ?????????? (MFACC)
//  - done: 1 ???? ?? ??????????
//  - busy: 1 ???? ?? IDLE
//==============================================================

module MatrixAccel #(
    parameter integer W = 32
)(
    input  wire             clock,
    input  wire             reset_n,

    input  wire             acc_we_a0,
    input  wire             acc_we_a1,
    input  wire             acc_we_a2,
    input  wire             acc_we_a3,

    input  wire             acc_we_b0,
    input  wire             acc_we_b1,
    input  wire             acc_we_b2,
    input  wire             acc_we_b3,

    input  wire             acc_start,
    input  wire [1:0]       acc_size,     // 00=2x2, 11=4x4
    input  wire             acc_clear,

    input  wire [31:0]      rf_rs_data,

    input  wire [1:0]       acc_rd_sel,
    output reg  [31:0]      acc_rd_data,

    output wire             busy,
    output reg              done
);

    // --------------------------
    // ???????? ?????? A, B ? ???????????? C
    // --------------------------
    reg [W-1:0] A00, A01, A10, A11;
    reg [W-1:0] B00, B01, B10, B11;
    reg [W-1:0] C00, C01, C10, C11;

    // --------------------------
    // FSM ?????????
    // --------------------------
    localparam [2:0]
        IDLE    = 3'd0,
        P0_LOAD = 3'd1,
        P0_ACC  = 3'd2,
        P1_LOAD = 3'd3,
        P1_ACC  = 3'd4;

    reg [2:0] st;

    // ??????, ??????????? ??? ??????
    reg op_2x2;
    reg op_4x4;

    // --------------------------
    // "Freeze" ?????? ???????????:
    // ????????????????? ????? ????????????? ?????? ? LOAD ?????
    // --------------------------
    reg [W-1:0] mulA0, mulB0;
    reg [W-1:0] mulA1, mulB1;
    reg [W-1:0] mulA2, mulB2;
    reg [W-1:0] mulA3, mulB3;

    // ?????? 4 ???????????
    wire [W-1:0] mulR0, mulR1, mulR2, mulR3;

    Mat_mult U0(.A(mulA0), .B(mulB0), .Res(mulR0));
    Mat_mult U1(.A(mulA1), .B(mulB1), .Res(mulR1));
    Mat_mult U2(.A(mulA2), .B(mulB2), .Res(mulR2));
    Mat_mult U3(.A(mulA3), .B(mulB3), .Res(mulR3));

    // busy = ?? IDLE
    assign busy = (st != IDLE);

    // --------------------------
    // ???????????? ?????? ??????????? ? LOAD ??????????
    // --------------------------
    always @(posedge clock) begin
        if (!reset_n) begin
            mulA0 <= {W{1'b0}}; mulB0 <= {W{1'b0}};
            mulA1 <= {W{1'b0}}; mulB1 <= {W{1'b0}};
            mulA2 <= {W{1'b0}}; mulB2 <= {W{1'b0}};
            mulA3 <= {W{1'b0}}; mulB3 <= {W{1'b0}};
        end else begin
            if (st == P0_LOAD) begin
                if (op_2x2) begin
                    mulA0 <= A00; mulB0 <= B00;
                end else if (op_4x4) begin
                    mulA0 <= A00; mulB0 <= B00;
                    mulA1 <= A00; mulB1 <= B01;
                    mulA2 <= A10; mulB2 <= B00;
                    mulA3 <= A10; mulB3 <= B01;
                end
            end else if (st == P1_LOAD) begin
                if (op_4x4) begin
                    mulA0 <= A01; mulB0 <= B10;
                    mulA1 <= A01; mulB1 <= B11;
                    mulA2 <= A11; mulB2 <= B10;
                    mulA3 <= A11; mulB3 <= B11;
                end
            end
            // ?????: freeze (?????? ?????? mulA*/mulB*)
        end
    end

    // --------------------------
    // ???????? always: ?????? A/B/C + FSM
    // --------------------------
    always @(posedge clock) begin
        if (!reset_n) begin
            A00 <= {W{1'b0}}; A01 <= {W{1'b0}}; A10 <= {W{1'b0}}; A11 <= {W{1'b0}};
            B00 <= {W{1'b0}}; B01 <= {W{1'b0}}; B10 <= {W{1'b0}}; B11 <= {W{1'b0}};
            C00 <= {W{1'b0}}; C01 <= {W{1'b0}}; C10 <= {W{1'b0}}; C11 <= {W{1'b0}};
            st  <= IDLE;
            done <= 1'b0;
            op_2x2 <= 1'b0;
            op_4x4 <= 1'b0;
        end else begin
            done <= 1'b0;

            // ?????? ??????? A
            if (acc_we_a0) A00 <= rf_rs_data[W-1:0];
            if (acc_we_a1) A01 <= rf_rs_data[W-1:0];
            if (acc_we_a2) A10 <= rf_rs_data[W-1:0];
            if (acc_we_a3) A11 <= rf_rs_data[W-1:0];

            // ?????? ??????? B
            if (acc_we_b0) B00 <= rf_rs_data[W-1:0];
            if (acc_we_b1) B01 <= rf_rs_data[W-1:0];
            if (acc_we_b2) B10 <= rf_rs_data[W-1:0];
            if (acc_we_b3) B11 <= rf_rs_data[W-1:0];

            // ??????? C
            if (acc_clear) begin
                C00 <= {W{1'b0}}; C01 <= {W{1'b0}}; C10 <= {W{1'b0}}; C11 <= {W{1'b0}};
            end

            // FSM
            case (st)
                IDLE: begin
                    if (acc_start) begin
                        op_2x2 <= (acc_size == 2'b00);
                        op_4x4 <= (acc_size == 2'b11);
                        st <= P0_LOAD;
                    end
                end

                P0_LOAD: st <= P0_ACC;

                P0_ACC: begin
                    if (op_2x2) begin
                        C00 <= mulR0;
                        done <= 1'b1;
                        op_2x2 <= 1'b0;
                        st <= IDLE;
                    end else if (op_4x4) begin
                        C00 <= mulR0;
                        C01 <= mulR1;
                        C10 <= mulR2;
                        C11 <= mulR3;
                        st <= P1_LOAD;
                    end else begin
                        st <= IDLE;
                    end
                end

                P1_LOAD: st <= P1_ACC;

                P1_ACC: begin
                    C00 <= C00 + mulR0;
                    C01 <= C01 + mulR1;
                    C10 <= C10 + mulR2;
                    C11 <= C11 + mulR3;
                    done <= 1'b1;
                    op_4x4 <= 1'b0;
                    st <= IDLE;
                end

                default: st <= IDLE;
            endcase
        end
    end

    // --------------------------
    // Readback mux
    // --------------------------
    always @* begin
        case (acc_rd_sel)
            2'b00: acc_rd_data = C00;
            2'b01: acc_rd_data = C01;
            2'b10: acc_rd_data = C10;
            2'b11: acc_rd_data = C11;
            default: acc_rd_data = C00;
        endcase
    end

endmodule

`default_nettype wire