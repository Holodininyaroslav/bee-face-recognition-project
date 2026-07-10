

`timescale 1ns/1ps
`default_nettype none

module MUX #(
    parameter BUS = 32
)(
    data_true,
    data_false,
    sel,
    data_out
);

    // ----------------------------
    // PORT DECLARATIONS
    // ----------------------------
    input  wire [BUS-1:0] data_true;
    input  wire [BUS-1:0] data_false;
    input  wire           sel;

    output reg  [BUS-1:0] data_out;

    // ----------------------------
    // MUX logic
    // ----------------------------
    always @(*) begin
        if (sel)
            data_out = data_true;
        else
            data_out = data_false;
    end

endmodule

`default_nettype wire
