`timescale 1ns/1ps

module tb_RV32i;

    // --- Sinais de Estímulo ---
    reg clk;
    reg rst;
    reg enable;

    wire [31:0] pc_out;
    wire [31:0] out_instruction;


    RV32i dut (
        .clk(clk),
        .rst(rst),
        .enable(enable),
        .pc_out(pc_out),
        .out_instruction(out_instruction)
    );
    
    
    // --- Clock e Reset ---
    initial begin
        clk = 0;
        forever #5 clk = ~clk;
    end
    
    initial begin
        $readmemb("testBenchs/binarios/INSTRUCTIONS.bin", dut.im.instruction_memory);
        $readmemb("testbenchs/binarios/RAM.bin", dut.m_m.memory);
        
        assign dut.reg_bank.registers[1] = 32'hFFFFFFFA; // -6 em complemento de 2
        assign dut.reg_bank.registers[2] = 32'hFFFFFFFC; // -4 em complemento de 2

        rst = 1;
        enable = 0;
        #20;
        rst = 0;
        enable = 1; // Habilita o processador
        #1000;
        $finish;
    
    end

    // Use a borda de descida do clock para garantir que todos os valores
// do ciclo já foram calculados e registrados.
reg [7:0] tipo;
always @(posedge clk) begin
    // Não imprima nada durante o reset ou se o processador estiver desabilitado
    case (dut.IF_ID.opcode) 
        7'b0110011: tipo = "R";
        7'b0010011, 7'b0000011, 7'b1100111: tipo = "I";
        7'b0100011: tipo = "S";
        7'b1100011: tipo = "B";
        7'b1101111: tipo = "J";
        7'b0010111, 7'b0110111: tipo = "U";
        7'b1111111: begin
            $display("\n--- Simulação Finalizada ---");
            $finish; // Sinal fictício para terminar a simulação
        end
        default: tipo = "?";
    endcase
    if (rst == 0 && enable == 1) begin

        // --- CABEÇALHO DO CICLO ---
        // Adiciona um cabeçalho claro para cada ciclo de clock
        $display("\n//--------------------[ CICLO @ %0t ]--------------------//", $time);

        // --- ESTÁGIO IF ---
        
        // --- BRANCH TARGET BUFFER ---
        $display("  [BTB] Inputs -> pc: %8h | IFID_pc: %8h | target_address: %8h | branch_taken: %b",
                 dut.btb.pc, dut.btb.IFID_pc, dut.btb.target_address, dut.btb.branch_taken);
        $display("       Outputs -> predicted_address: %8h | predicted: %8h",
                 dut.btb.predicted_address, dut.btb.predicted);
        $display("       Internal -> pc_less: %3d | buffer_pc: %8h | buffer_target: %8h | buffer_state: %2b | buffer_valid: %b",
                 dut.btb.pc_less, dut.btb.buffer[dut.btb.pc_less][66:35], dut.btb.buffer[dut.btb.pc_less][34:3], dut.btb.buffer[dut.btb.pc_less][2:1], dut.btb.buffer[dut.btb.pc_less][0]);
        $display("-----------------------------------------------------------------");
        
        $display("PC: %8h   |   Instruction: %32b", pc_out, out_instruction);
        // --- ESTÁGIO ID ---
        $display("-----------------------------------------------------------------");
        $display("  [IF/ID] Opcode: %7b | tipo: %c | rd: %2d, rs1: %2d, rs2: %2d", dut.IF_ID.opcode, tipo, dut.IF_ID.rd, dut.IF_ID.rs1, dut.IF_ID.rs2);
        $display("       Funct3: %3b  | Funct7: %7b | mul: %b", dut.IF_ID.funct3, dut.IF_ID.funct7, dut.mul);
        $display("       Imm Gen: %8h", dut.imm_gen_output);
        $display("       RegBank Read -> rs1_value: %10d | rs2_value: %10d", dut.reg_bank.A, dut.reg_bank.B);
        $display("       Forwarding -> Fwd_1: %2b | Fwd_2: %2b | forward_1_value: %10d | forward_2_value: %10d", dut.fwd.forwardRs1, dut.fwd.forwardRs2, dut.forwarding_rs1, dut.forwarding_rs2);
        $display("       Branch Decider -> Branch Taken: %b | IFID_BTB_predicted: %b | xor:%b" , dut.branch_decider.Branch, dut.IF_ID.predicted_out, dut.branch_decider.Branch ^ dut.IF_ID.predicted_out);
        $display("       Hazard Detection -> PCWrite: %b | IFIDWrite: %b | IDEXenable: %b | Bolha: %b | Bolha_mem: %b | Flush: %b | hazard_mul: %b",
                 dut.hdu.PCWrite, dut.hdu.IFIDWrite, dut.hdu.IDEXenable, dut.hdu.Bolha, dut.hdu.Bolha_mem, dut.hdu.Flush, dut.hdu.mul);

        // --- ESTÁGIO EX ---
        $display("-----------------------------------------------------------------");
        // Mostra os valores que SAEM do registrador ID/EX
        $display("  [ID/EX] Control -> RegWr: %b, MemRd: %b, MemWr: %b, MuxReg: %b, alu_src1: %b, ULAOp: %2b, alu_src2: %b, mul: %b",
                 dut.ID_EX.reg_wr_out, dut.ID_EX.mem_rd_out, dut.ID_EX.mem_wr_out, dut.ID_EX.mux_reg_wr_out, dut.ID_EX.alu_src1_out, dut.ID_EX.ula_out, dut.ID_EX.alu_src2_out, dut.ID_EX.mul_out);
        $display("       Data    -> rs1_value: %10d | rs2_value: %10d | rd: %2d | imm: %h | pc: %h",
                 dut.ID_EX.val_A_out, dut.ID_EX.val_B_out, dut.ID_EX.rd_out, dut.ID_EX.imm_out, dut.ID_EX.pc_out);
        $display("       Forward -> Fwd_1: %2b, Fwd_2: %2b", dut.fwd.forwardA, dut.fwd.forwardB);
        $display("       ULA -> A: %10d | B: %10d | C: %10d", dut.ULA.A, dut.ULA.B, dut.ULA.C);
        $display("       MUL -> signedS: %b | unsignedS: %10d | counter: %3b" , dut.uut.regularS, dut.uut.unsignedS, dut.uut.counter);

        // --- ESTÁGIO MEM ---
        $display("-----------------------------------------------------------------");
        $display("  [EX/MEM] Control -> RegWr: %b, MemRd: %b, MemWr: %b, MuxReg: %b",
                  dut.EX_MEM.reg_wr_out, dut.EX_MEM.mem_rd_out, dut.EX_MEM.mem_wr_out, dut.EX_MEM.mux_reg_wr_out);
        $display("        Data    -> ULA_Res: %10d | val_B: %10d | rd: %2d",
                  dut.EX_MEM.ula_res_out, dut.EX_MEM.val_B_out, dut.EX_MEM.rd_out);
        
        // --- ESTÁGIO WB ---
        $display("-----------------------------------------------------------------");
        $display("  [MEM/WB] Control -> RegWr: %b, MuxReg: %b", dut.MEM_WB.reg_wr_out, dut.MEM_WB.mux_reg_wr_out);
        $display("       Data    -> ULA_Res: %10d | Mem_Data: %10d | rd: %2d",
                 dut.MEM_WB.ula_res_out, dut.MEM_WB.mem_res_out, dut.MEM_WB.rd_out);
        
        $display("-----------------------------------------------------------------");
        // $display("%d %d %d %d %d", dut.m_m.memory[0], dut.m_m.memory[1], dut.m_m.memory[2], dut.m_m.memory[3], dut.m_m.funct3);
        $display("reg0: %0d reg1: %0d reg2: %0d reg3: %0d reg4: %0d reg5: %0d reg6: %0d, reg7: %0d, reg8: %0d", dut.reg_bank.registers[0], dut.reg_bank.registers[1], dut.reg_bank.registers[2], dut.reg_bank.registers[3], dut.reg_bank.registers[4], dut.reg_bank.registers[5], dut.reg_bank.registers[6], dut.reg_bank.registers[7], dut.reg_bank.registers[8]);
        $display("mem0: %0d mem1: %0d mem2: %0d mem3: %0d mem4: %0d mem5: %0d mem6: %0d, mem7: %0d, mem8: %0d", dut.m_m.memory[0], dut.m_m.memory[1], dut.m_m.memory[2], dut.m_m.memory[3], dut.m_m.memory[4], dut.m_m.memory[5], dut.m_m.memory[6], dut.m_m.memory[7], dut.m_m.memory[8]);
        $display("%b", dut.btb.buffer[20]);

    end
end


endmodule