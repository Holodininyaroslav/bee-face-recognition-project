`timescale 1ns/1ps
`default_nettype none

module ReLU4_reg #(
    parameter int W = 32
)(
    clock,
    reset_n,

    we0,
    we1,
    we2,
    we3,

    start,
    clear,

    write_in,

    rd_sel,
    rd_data,

    done
);

    // ----------------------------
    // PORT DECLARATIONS (EXPLICIT)
    // ----------------------------
    input  logic         clock;
    input  logic         reset_n;

    input  logic         we0;
    input  logic         we1;
    input  logic         we2;
    input  logic         we3;

    input  logic         start;
    input  logic         clear;

    input  logic [W-1:0] write_in;

    input  logic [1:0]   rd_sel;
    output logic [W-1:0] rd_data;

    output logic         done;

    // ----------------------------
    // Internal registers
    // ----------------------------
    logic [W-1:0] in0, in1, in2, in3;
    logic [W-1:0] out0, out1, out2, out3;

    // ----------------------------
    // ReLU function
    // If MSB=1 => negative (signed) => output 0
    // else pass-through
    // ----------------------------
    function automatic logic [W-1:0] relu(input logic [W-1:0] x);
        relu = (x[W-1] == 1'b1) ? '0 : x;
    endfunction

    // ----------------------------
    // Sequential logic
    // ----------------------------
    always_ff @(posedge clock) begin
        if (!reset_n) begin
            in0  <= '0; in1  <= '0; in2  <= '0; in3  <= '0;
            out0 <= '0; out1 <= '0; out2 <= '0; out3 <= '0;
            done <= 1'b0;
        end else begin
            done <= 1'b0;

            if (clear) begin
                in0  <= '0; in1  <= '0; in2  <= '0; in3  <= '0;
                out0 <= '0; out1 <= '0; out2 <= '0; out3 <= '0;
            end else begin
                // load inputs
                if (we0) in0 <= write_in;
                if (we1) in1 <= write_in;
                if (we2) in2 <= write_in;
                if (we3) in3 <= write_in;

                // compute outputs in 1 cycle when start asserted
                if (start) begin
                    out0 <= relu(in0);
                    out1 <= relu(in1);
                    out2 <= relu(in2);
                    out3 <= relu(in3);
                    done <= 1'b1;
                end
            end
        end
    end

    // ----------------------------
    // Read mux
    // ----------------------------
    always_comb begin
        unique case (rd_sel)
            2'b00: rd_data = out0;
            2'b01: rd_data = out1;
            2'b10: rd_data = out2;
            2'b11: rd_data = out3;
            default: rd_data = out0;
        endcase
    end

endmodule

`default_nettype wire