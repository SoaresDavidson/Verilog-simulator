`timescale 1ns/1ps

module forward_unit(
    input  [4:0] IFIDrs1,
    input  [4:0] IFIDrs2,
    input  [4:0] IDEXrs1,
    input  [4:0] IDEXrs2,
    input  [4:0] EXMEMrd,
    input        EXMEM_RegWrite,
    input  [4:0] MEMWBrd,
    input        MEMWB_RegWrite,
    output reg [1:0] forwardA,
    output reg [1:0] forwardB,
    output reg [1:0] forwardRs1,
    output reg [1:0] forwardRs2
);


    always @(*) begin
        // mux de rs1 (pos-regBank)
        if (EXMEM_RegWrite && (EXMEMrd != 5'b0) && (EXMEMrd == IFIDrs1)) begin
            forwardRs1 = 2'b10; 
        end
        else if (MEMWB_RegWrite && (MEMWBrd != 5'b0) && (MEMWBrd == IFIDrs1)) begin
            forwardRs1 = 2'b01;
        end
        else begin
            forwardRs1 = 2'b00; 
        end

        // mux de rs2 (pos-regBank)
        if (EXMEM_RegWrite && (EXMEMrd != 5'b0) && (EXMEMrd == IFIDrs2)) begin
            forwardRs2 = 2'b10;
        end
        else if (MEMWB_RegWrite && (MEMWBrd != 5'b0) && (MEMWBrd == IFIDrs2)) begin
            forwardRs2 = 2'b01; 
        end
        else begin
            forwardRs2 = 2'b00; 
        end

        // mux de A (pre-ULA)
        if (EXMEM_RegWrite && (EXMEMrd != 5'b0) && (EXMEMrd == IDEXrs1)) begin
            forwardA = 2'b10; 
        end
        else if (MEMWB_RegWrite && (MEMWBrd != 5'b0) && (MEMWBrd == IDEXrs1)) begin
            forwardA = 2'b01;
        end
        else begin
            forwardA = 2'b00; 
        end

        // mux de B (pre-ULA)
        if (EXMEM_RegWrite && (EXMEMrd != 5'b0) && (EXMEMrd == IDEXrs2)) begin
            forwardB = 2'b10;
        end
        else if (MEMWB_RegWrite && (MEMWBrd != 5'b0) && (MEMWBrd == IDEXrs2)) begin
            forwardB = 2'b01; 
        end
        else begin
            forwardB = 2'b00; 
        end
    end

endmodule
