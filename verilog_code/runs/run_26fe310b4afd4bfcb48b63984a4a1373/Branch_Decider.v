`timescale 1ns/1ps

module BranchDecider (
  input  wire [6:0] opcode,
  input  wire [2:0] funct3,
  input  wire [31:0] rs1,
  input  wire [31:0] rs2,
  input  wire bolha,
  output reg  Branch
);
  
  always @(*) begin
	 Branch = 1'b0;  
    if (opcode == 7'b1100011) begin
      case (funct3)
        3'b000: Branch = ($signed(rs1) == $signed(rs2));   // BEQ
        3'b001: Branch = ($signed(rs1) != $signed(rs2));   // BNE
        3'b100: Branch = ($signed(rs1) < $signed(rs2));    // BLT
        3'b101: Branch = ($signed(rs1) >= $signed(rs2));   // BGE
        3'b110: Branch = (rs1 < rs2); // BLT unsigned
        3'b111: Branch = (rs1 >= rs2); // BGE unsigned
        default: Branch = 1'b0;
      endcase
    end
  end
endmodule