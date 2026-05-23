`timescale 1ns/1ps


module EX_MEM (
    // controle MEM
	input	wire mem_rd_in,
	input	wire mem_wr_in,

	// controle WB
	input	wire reg_wr_in,
	input	wire mux_reg_wr_in,
    input   wire [2:0] funct3_in,
    
    // dados
    input   wire [31:0] ula_res_in,
    input   wire [31:0] val_B_in,
    input   wire [4:0] rd_in,

    // controle de reg
	input	wire clk,
	input	wire rst,
	input	wire enable,

	output	wire mem_rd_out,
	output	wire mem_wr_out,
	output	wire reg_wr_out,
	output	wire mux_reg_wr_out,
    output  wire [2:0] funct3_out,
    output  wire [31:0] ula_res_out,
    output  wire [31:0] val_B_out,
    output  wire [4:0] rd_out
);

// registradores
reg [31:0] ula_res;
reg [31:0] val_B;
reg [4:0] rd;
reg mem_rd;
reg mem_wr;
reg reg_wr;
reg mux_reg_wr;
reg [2:0] funct3;

// leitura
assign val_B_out = val_B;
assign ula_res_out = ula_res;
assign rd_out = rd;
assign mem_rd_out = mem_rd;
assign mem_wr_out = mem_wr;
assign reg_wr_out = reg_wr;
assign mux_reg_wr_out = mux_reg_wr;
assign funct3_out = funct3;
// escrita

always @(posedge clk or posedge rst) begin
    if (rst) begin
        ula_res <= 32'b0;
        val_B <= 32'b0;
        rd <= 5'b0;
        mem_rd <= 1'b0;
        mem_wr <= 1'b0;
        reg_wr <= 1'b0;
        mux_reg_wr <= 1'b0;
        funct3 <= 3'b0;
    end else if (enable) begin
        ula_res <= ula_res_in;
        val_B <= val_B_in;
        rd <= rd_in;
        mem_rd <= mem_rd_in;
        mem_wr <= mem_wr_in;
        reg_wr <= reg_wr_in;
        mux_reg_wr <= mux_reg_wr_in;
        funct3 <= funct3_in;
    end
end

endmodule