`timescale 1ns/1ps

module main_memory(
    input   wire clk,
    input   wire memRead,
    input   wire memWrite,
    input   wire [2:0]  funct3,
    input   wire [31:0] addr,
    input   wire [31:0] writeData,
    output  reg  [31:0] data
);
    // Memória de 4KB (ajuste conforme a necessidade do seu projeto na UFPI)
    reg [7:0] memory [4095:0]; 
    
    reg [7:0]  r_byte; 
    reg [15:0] r_half;
    reg [31:0] r_word;

    // Leitura combinacional contínua para evitar warning do Icarus Verilog no always @(*)
    wire [7:0] memory_addr_0 = memory[addr];
    wire [7:0] memory_addr_1 = memory[addr + 1];
    wire [7:0] memory_addr_2 = memory[addr + 2];
    wire [7:0] memory_addr_3 = memory[addr + 3];

    // Lógica Combinacional de Leitura
    always @(*) begin
        r_byte = memory_addr_0;
        r_half = {memory_addr_1, memory_addr_0};
        r_word = {memory_addr_3, memory_addr_2, memory_addr_1, memory_addr_0};
        
        if (memRead) begin
            case (funct3)
                3'b000: data = { {24{r_byte[7]}}, r_byte }; // lb (Sign Extension)
                3'b001: data = { {16{r_half[15]}}, r_half }; // lh (Sign Extension)
                3'b010: data = r_word;                        // lw
                3'b100: data = { 24'b0, r_byte };            // lbu (Zero Extension)
                3'b101: data = { 16'b0, r_half };            // lhu (Zero Extension)
                default: data = 32'b0;
            endcase
        end else begin
            data = 32'b0;
        end
    end

    // Lógica Sequencial de Escrita
    always @(posedge clk) begin
        if (memWrite) begin 
            case (funct3)
                3'b000: memory[addr] <= writeData[7:0]; // sb
                3'b001: begin // sh
                    memory[addr]     <= writeData[7:0];
                    memory[addr + 1] <= writeData[15:8];
                end
                3'b010: begin // sw
                    memory[addr]     <= writeData[7:0];
                    memory[addr + 1] <= writeData[15:8];
                    memory[addr + 2] <= writeData[23:16];
                    memory[addr + 3] <= writeData[31:24];
                end
                default: ;
            endcase
        end
    end
endmodule