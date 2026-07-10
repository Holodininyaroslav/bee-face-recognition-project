

`timescale 1ns/1ps
`default_nettype none

module Mat_mult #(
    parameter W = 32
)(
    A,
    B,
    Res
);

    // ----------------------------
    // PORT DECLARATIONS
    // ----------------------------
    input  wire [W-1:0] A;
    input  wire [W-1:0] B;

    output wire [W-1:0] Res;

    // ----------------------------
    // MATRIX MULTIPLY (temporary)
    // ----------------------------
    assign Res = A * B;

endmodule

`default_nettype wire