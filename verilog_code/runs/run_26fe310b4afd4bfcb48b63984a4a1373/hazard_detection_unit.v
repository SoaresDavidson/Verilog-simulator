`timescale 1ns/1ps

module hazard_detection_unit (
    input wire       IDEX_RegWrite,
    input wire       EXMEM_MemRead,
    input wire       IDEX_MemRead,
    input wire       branch,
    input wire       jalr,
    input wire       mul,
    input wire [2:0] IDEXfunct3,
    input wire [2:0] counter,
    input wire [4:0] EXMEM_RegisterRd,
    input wire [4:0] IDEX_RegisterRd,
    input wire [4:0] IFID_Register1,
    input wire [4:0] IFID_Register2,
    input wire       Jump,
    input wire       predicted,
     
    output reg       PCWrite,
    output reg       IFIDWrite,
    output reg       IDEXenable,
    output reg       Bolha,
    output reg       Bolha_mem,
   output reg       Flush
);


    always @(*) begin
        // tudo normal
        PCWrite   = 1'b1;
        IFIDWrite = 1'b1;
        Bolha     = 1'b0;
        Flush     = 1'b0;
        IDEXenable = 1'b1;
        Bolha_mem = 1'b0;
        // Hazard (caso de instrução seguida de B ou JALR dependente)
        if (IDEX_RegWrite &&
            (IDEX_RegisterRd != 5'b00000) &&
            (branch || jalr) &&
            ((IDEX_RegisterRd == IFID_Register1) || (IDEX_RegisterRd == IFID_Register2))) begin

            PCWrite   = 1'b0;
            IFIDWrite = 1'b0;
            Bolha     = 1'b1;
        end
        // Hazard (caso do load seguido de instrucao B ou JAlR)
        if (EXMEM_MemRead &&
            (EXMEM_RegisterRd != 5'b00000) &&
            (branch || jalr) &&
            ((EXMEM_RegisterRd == IFID_Register1) || (EXMEM_RegisterRd == IFID_Register2))) begin

            PCWrite   = 1'b0;
            IFIDWrite = 1'b0;
            Bolha     = 1'b1;
        end

        // Hazard (caso de Load seguido de qualquer instrucao dependente)
        else if(IDEX_MemRead &&
        (IDEX_RegisterRd != 5'b0) &&
        ((IDEX_RegisterRd == IFID_Register1) || (IDEX_RegisterRd == IFID_Register2))) begin

            PCWrite   = 1'b0;
            IFIDWrite = 1'b0;
            Bolha     = 1'b1;
        end
        // Hazard (caso de multiplicação em andamento)
        else if (mul && ((counter < 3'b110 && IDEXfunct3[1] == 1'b0) || (counter < 3'b111 && IDEXfunct3[1] == 1'b1))) begin
            PCWrite   = 1'b0;
            IFIDWrite = 1'b0;
            IDEXenable = 1'b0;
            Bolha_mem = 1'b1;
        end

        else if ((predicted ^ Jump) && ~Bolha) begin
            // A predição estava errada, limpa a próxima instrução
            Flush = 1'b1;
        end
    end

endmodule
