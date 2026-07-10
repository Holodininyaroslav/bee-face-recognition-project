`timescale 1ns/1ps
`default_nettype none

module ReLU4_reg_tb;

    localparam int W = 32;

    logic        clock;
    logic        reset_n;

    logic        in_we;
    logic [1:0]  in_sel;
    logic [W-1:0] in_data;

    logic        start;

    logic [W-1:0] out0, out1, out2, out3;
    logic        done;

    // DUT
    ReLU4_reg #(.W(W)) dut (
        .clock   (clock),
        .reset_n (reset_n),

        .in_we   (in_we),
        .in_sel  (in_sel),
        .in_data (in_data),

        .start   (start),

        .out0    (out0),
        .out1    (out1),
        .out2    (out2),
        .out3    (out3),

        .done    (done)
    );

    // clock 100MHz -> 10ns period
    initial clock = 1'b0;
    always #5 clock = ~clock;

    task automatic write_in(input logic [1:0] sel, input logic [31:0] val);
        begin
            @(negedge clock);
            in_we   = 1'b1;
            in_sel  = sel;
            in_data = val;
            @(negedge clock);
            in_we   = 1'b0;
            in_sel  = 2'b00;
            in_data = '0;
        end
    endtask

    task automatic pulse_start;
        begin
            @(negedge clock);
            start = 1'b1;
            @(negedge clock);
            start = 1'b0;
        end
    endtask

    // simple checker
    function automatic logic [31:0] relu_ref(input logic [31:0] x);
        relu_ref = (x[31] == 1'b1) ? 32'h00000000 : x;
    endfunction

    task automatic check_outputs(input logic [31:0] a0,a1,a2,a3);
        begin
            // outputs update on posedge where start=1, so check right after that edge
            @(posedge clock);
            #1;
            if (out0 !== relu_ref(a0)) $display("FAIL out0 exp=%h got=%h", relu_ref(a0), out0);
            if (out1 !== relu_ref(a1)) $display("FAIL out1 exp=%h got=%h", relu_ref(a1), out1);
            if (out2 !== relu_ref(a2)) $display("FAIL out2 exp=%h got=%h", relu_ref(a2), out2);
            if (out3 !== relu_ref(a3)) $display("FAIL out3 exp=%h got=%h", relu_ref(a3), out3);

            $display("OUT: out0=%h out1=%h out2=%h out3=%h (done=%b)", out0,out1,out2,out3,done);
        end
    endtask

    initial begin
        // init
        in_we   = 0;
        in_sel  = 0;
        in_data = 0;
        start   = 0;

        reset_n = 0;
        repeat (3) @(posedge clock);
        reset_n = 1;

        // -----------------------------
        // TEST 1: mix negative/positive/zero
        // in0 = -1 (0xFFFF_FFFF) -> 0
        // in1 = +5 -> 5
        // in2 = 0 -> 0
        // in3 = 0x8000_0000 (most negative) -> 0
        // -----------------------------
        write_in(2'b00, 32'hFFFF_FFFF);
        write_in(2'b01, 32'h0000_0005);
        write_in(2'b10, 32'h0000_0000);
        write_in(2'b11, 32'h8000_0000);

        pulse_start();
        check_outputs(32'hFFFF_FFFF, 32'h0000_0005, 32'h0000_0000, 32'h8000_0000);

        // -----------------------------
        // TEST 2: overwrite only some inputs, others stay from previous
        // change in1 and in2
        // in1 = 0x7FFF_FFFF -> stays
        // in2 = -7 (0xFFFF_FFF9) -> 0
        // -----------------------------
        write_in(2'b01, 32'h7FFF_FFFF);
        write_in(2'b10, 32'hFFFF_FFF9);

        pulse_start();
        // expected: in0 old (-1)->0, in1 new -> 0x7FFF_FFFF, in2 new neg ->0, in3 old 0x8000_0000 ->0
        check_outputs(32'hFFFF_FFFF, 32'h7FFF_FFFF, 32'hFFFF_FFF9, 32'h8000_0000);

        // -----------------------------
        // TEST 3: all positive
        // -----------------------------
        write_in(2'b00, 32'h0000_00AA);
        write_in(2'b01, 32'h0000_00BB);
        write_in(2'b10, 32'h0000_00CC);
        write_in(2'b11, 32'h0000_00DD);

        pulse_start();
        check_outputs(32'h0000_00AA, 32'h0000_00BB, 32'h0000_00CC, 32'h0000_00DD);

        $display("TB finished.");
        #20;
        $stop;
    end

endmodule

`default_nettype wire