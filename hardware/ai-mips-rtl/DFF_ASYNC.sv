


`timescale 1ns/1ps
`default_nettype none

module DFF_ASYNC #(
    parameter WIDTH = 1
)(
    reset_n,
    clock,
    d,
    q
);

    // ----------------------------
    // PORT DECLARATIONS
    // ----------------------------
    input  wire             reset_n;   // async active-low reset
    input  wire             clock;
    input  wire [WIDTH-1:0] d;

    output reg  [WIDTH-1:0] q;

    // ----------------------------
    // D Flip-Flop with async reset
    // ----------------------------
    always @(posedge clock or negedge reset_n) begin
        if (!reset_n)
            q <= {WIDTH{1'b0}};
        else
            q <= d;
    end

endmodule

`default_nettype wire