`timescale 1ns/1ps

module MEM_WB(
    // controle WB
    input   wire mem_rd_in,
	input	wire reg_wr_in,
	input	wire mux_reg_wr_in,

    // dados
    input   wire [4:0]  rd_in,
    input   wire [31:0] ula_res_in,
    input   wire [31:0] mem_res_in,

    // controle de reg
	input	wire clk,
	input	wire rst,
	input	wire enable,

    output  wire mem_rd_out,
	output	wire reg_wr_out,
	output	wire mux_reg_wr_out,
    output  wire [31:0] ula_res_out,
    output  wire [31:0] mem_res_out,
    output  wire [4:0] rd_out
);

// registradores
reg reg_wr;
reg mux_reg_wr;
reg [31:0] ula_res;
reg [31:0] mem_res;
reg [4:0] rd;
// leitura
assign reg_wr_out = reg_wr;
assign mux_reg_wr_out = mux_reg_wr;
assign ula_res_out = ula_res;
assign mem_res_out = mem_res;
assign rd_out = rd;
assign mem_rd_out = mem_rd_in;

// escrita
always @(posedge clk or posedge rst) begin
    if (rst) begin
        reg_wr <= 1'b0;
        mux_reg_wr <= 1'b0;
        ula_res <= 32'b0;
        mem_res <= 32'b0;
        rd <= 5'b0;
    end else if (enable) begin
        reg_wr <= reg_wr_in;
        mux_reg_wr <= mux_reg_wr_in;
        ula_res <= ula_res_in;
        mem_res <= mem_res_in;
        rd <= rd_in;
    end
end

endmodule