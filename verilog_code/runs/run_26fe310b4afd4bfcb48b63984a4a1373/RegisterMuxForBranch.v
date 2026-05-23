`timescale 1ns/1ps

module Mux_Reg_For_Branch (
  input wire [31:0] rs1,
  input wire [31:0] rs2,
  input wire [31:0] forward,
  input wire [1:0] update,
  output reg [31:0] read1,
  output reg[31:0] read2
);
  always @(*) begin
    if (update == 2'b01) begin
      read1 <= forward;
      read2 <= rs2;
    end
    
    if (update == 2'b10) begin
      read1 <= rs1;
      read2 <= forward;
    end
    
    if (update == 2'b00 | update == 2'b11) begin
      read1 <= rs1;
      read2 <= rs2;
    end
  end
endmodule
    
  