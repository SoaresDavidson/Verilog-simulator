`timescale 1ns/1ps

module instruction_memory(
    input clk,
    input [31:0] addr,
    output wire [31:0] instruction
);
    reg [31:0] instruction_memory [1023:0]; // memoria de instruções
    assign instruction = instruction_memory[addr >> 2]; // busca a instrução



endmodule