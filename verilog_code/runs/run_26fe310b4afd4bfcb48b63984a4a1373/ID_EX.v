`timescale 1ns/1ps

// adicionar PC e PC+4
// analizar se precisa de controle de mux B

module ID_EX(
	// controle EX
	input	wire [1:0] ula_in,
	input	wire [1:0] alu_src1_in,
	input	wire [1:0] alu_src2_in,
	input   wire       mul_in,

	// controle MEM
	input	wire mem_rd_in,
	input	wire mem_wr_in,

	// controle WB
	input	wire reg_wr_in,
	input	wire mux_reg_wr_in,

	// dados
	input   wire [31:0] pc_in,
	input	wire [31:0] imm_in,
	input	wire [4:0] rs1_in,
	input	wire [4:0] rs2_in,
	input	wire [4:0] rd_in,
	input   wire [6:0] funct7_in,
	input   wire [2:0] funct3_in,
	input	wire [31:0] val_A_in,
	input	wire [31:0] val_B_in,

	// controle de reg
	input	wire clk,
	input	wire rst,
	input	wire enable,

	output  wire  [31:0] pc_out,
	output	wire  [31:0] imm_out,
	output	wire  [4:0] rs1_out,
	output	wire  [4:0] rs2_out,
	output	wire  [4:0] rd_out,
	output  wire  [6:0] funct7_out,
	output  wire  [2:0] funct3_out,
	output	wire  [31:0] val_A_out,
	output	wire  [31:0] val_B_out,
	output	wire [1:0] ula_out,
	output	wire [1:0] alu_src1_out,
	output	wire [1:0] alu_src2_out,
	output wire  mul_out,
	output	wire mem_rd_out,
	output	wire mem_wr_out,
	output	wire reg_wr_out,
	output	wire mux_reg_wr_out
);


// registradores
reg [31:0] imm, pc;
reg [4:0] rs1;
reg [4:0] rs2;
reg [4:0] rd;
reg [6:0] funct7;
reg [2:0] funct3;
reg [31:0] val_A;
reg [31:0] val_B;
reg [1:0] ula;
reg [1:0] alu_src1;
reg [1:0] alu_src2;
//sinais de controle
reg mem_rd, mem_wr, reg_wr, mux_reg_wr, mul;

assign pc_out = pc;
// leitura
assign imm_out = imm;
assign rs1_out = rs1;
assign rs2_out = rs2;
assign rd_out = rd;
assign funct7_out = funct7;
assign funct3_out = funct3;
assign val_A_out = val_A;
assign val_B_out = val_B;
assign ula_out = ula;
assign mem_rd_out = mem_rd;
assign mem_wr_out = mem_wr;
assign reg_wr_out = reg_wr;
assign mux_reg_wr_out = mux_reg_wr;
assign alu_src1_out = alu_src1;
assign alu_src2_out = alu_src2;
assign mul_out = mul;

// escrita
always @(posedge clk or posedge rst) begin
	if(rst) begin
		pc <= 32'b0;
		imm <= 32'b0;
 		rs1 <= 5'b0;
 		rs2 <= 5'b0;
 		rd <= 5'b0; 
 		funct7 <= 7'b0;
 		funct3 <= 3'b0;
 		val_A <= 32'b0;
 		val_B <= 32'b0;
 		ula <= 2'b0;
 		mem_rd <= 1'b0;
 		mem_wr <= 1'b0;
 		reg_wr <= 1'b0;	
		mux_reg_wr <= 1'b0;
		alu_src1 <= 2'b0;
		alu_src2 <= 2'b0;
		mul <= 1'b0;
	end else if (enable) begin
		pc <= pc_in;
		imm <= imm_in;
		rs1 <= rs1_in;
		rs2 <= rs2_in;
		rd <= rd_in;
		funct7 <= funct7_in;
		funct3 <= funct3_in;
		val_A <= val_A_in;
		val_B <= val_B_in;
		ula <= ula_in;
		mem_rd <= mem_rd_in;
		mem_wr <= mem_wr_in;
		reg_wr <= reg_wr_in;
		mux_reg_wr <= mux_reg_wr_in;
		alu_src1 <= alu_src1_in;
		alu_src2 <= alu_src2_in;
		mul <= mul_in;
	end
end

endmodule