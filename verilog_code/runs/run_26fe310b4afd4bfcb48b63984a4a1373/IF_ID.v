`timescale 1ns/1ps

// adicionar PC

module IF_ID (
	input 	wire [31:0] instruction,
	input	wire clk,
	input	wire rst,
	input	wire enable,
	input   wire IFIDWrite,
	input   wire [31:0] pc_in,
	input   wire predicted_in,
	input   wire Flush,
	

	output  wire [31:0] pc_out,
	output	wire [6:0] opcode,
	output	wire [4:0] rd,
	output	wire [4:0] rs1,
	output	wire [4:0] rs2,
	output	wire [2:0] funct3,
	output	wire [6:0] funct7,
	output	wire [11:0] imm_I,
	output	wire [11:0] imm_S,
	output 	wire [11:0] imm_B,
	output	wire [19:0] imm_U,
	output  wire [19:0] imm_J,
	output  wire predicted_out
);

reg predicted_reg;
reg [31:0] register, pc_out_reg;
// campos
assign opcode = register[6:0];
assign rd     = register[11:7];
assign rs1    = register[19:15];
assign rs2    = register[24:20];
assign funct3 = register[14:12];
assign funct7 = register[31:25];

// imediatos
assign imm_I  = register[31:20];
assign imm_S  = {register[31:25], register[11:7]};
assign imm_B  = {register[31], register[7], register[30:25], register[11:8]};
assign imm_U  = register[31:12];
assign imm_J  = {register[31], register[19:12], register[20], register[30:21]};
assign predicted_out = predicted_reg;

assign pc_out = pc_out_reg;
always @(posedge clk or posedge rst) begin
	if (rst) begin
		register <= 32'b0;
	end else if (Flush) begin
		register <= 32'b0;
		pc_out_reg <= 32'b0;
		predicted_reg <= 1'b0;
	end else if (enable && IFIDWrite) begin
		register <= instruction;
		pc_out_reg <= pc_in;
		predicted_reg <= predicted_in;
	end
end

endmodule