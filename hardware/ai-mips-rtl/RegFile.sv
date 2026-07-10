

`timescale 1ns/1ps
`default_nettype none

module RegFile (
    clock,
    reset_n,
    write_enable,
    addr1,
    addr2,
    addr3,
    write_data,
    rd1,
    rd2
);

    // ----------------------------
    // PORT DECLARATIONS (EXPLICIT)
    // ----------------------------
    input  logic        clock;
    input  logic        reset_n;
    input  logic        write_enable;
    input  logic [4:0]  addr1;
    input  logic [4:0]  addr2;
    input  logic [4:0]  addr3;
    input  logic [31:0] write_data;

    output logic [31:0] rd1;
    output logic [31:0] rd2;

    // ----------------------------
    // Register array
    // ----------------------------
    logic [31:0] registers [0:31];

    integer i;

    // Async reset, sync write
    always_ff @(posedge clock or negedge reset_n) begin
        if (!reset_n) begin
            for (i = 0; i < 32; i = i + 1)
                registers[i] <= 32'd0;
        end else begin
            if (write_enable && (addr3 != 5'd0))
                registers[addr3] <= write_data;

            // keep $zero hardwired to 0
            registers[0] <= 32'd0;
        end
    end

    // Combinational reads
    always_comb begin
        rd1 = (addr1 != 5'd0) ? registers[addr1] : 32'd0;
        rd2 = (addr2 != 5'd0) ? registers[addr2] : 32'd0;
    end

endmodule

`default_nettype wire
