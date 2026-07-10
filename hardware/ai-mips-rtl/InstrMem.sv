module InstrMem (
    input  logic [31:0] pc,
    output logic [31:0] instr
);

  logic [31:0] ram [0:127];
  integer i;

  initial begin
    for (i = 0; i < 128; i = i + 1)
      ram[i] = 32'h00000000;

    // ВАЖНО: без параметров/строковых переменных!
    $readmemh("prog3.txt", ram);
  end

  wire [6:0] word_addr = pc[8:2];
  assign instr = ram[word_addr];

endmodule