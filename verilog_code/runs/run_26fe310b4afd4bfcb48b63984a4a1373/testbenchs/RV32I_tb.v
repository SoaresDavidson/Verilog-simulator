`timescale 1ns/1ps

module RV32i_tb;

    // Sinais de estímulo do sistema
    reg clk;
    reg rst;
    reg enable;

    // Sinais de monitoramento (saídas do topo para debug externo)
    wire [31:0] pc_out;
    wire [31:0] out_instruction;

    // Instanciação do módulo topo do seu processador
    RV32i dut (
        .clk(clk),
        .rst(rst),
        .enable(enable),
        .pc_out(pc_out),
        .out_instruction(out_instruction)
    );

    // Canal do arquivo de log
    integer log_file;
    integer ciclo;

    // Gerador de Clock (Período de 20ns -> 50 MHz)
    always #10 clk = ~clk;

    // Bloco de Inicialização e Controle da Simulação
    initial begin
        // Inicializa os sinais
        clk = 0;
        rst = 1;
        enable = 1;
        ciclo = 0;

        // Abre o arquivo de log no modo de escrita (override)
        log_file = $fopen("execucao_pipeline.json", "w");
        if (log_file == 0) begin
            $display("Erro crítico: Não foi possível criar o arquivo de log.");
            $finish;
        end
        $readmemb("testBenchs/binarios/INSTRUCTIONS.bin", dut.im.instruction_memory);
        $readmemb("testbenchs/binarios/RAM.bin", dut.m_m.memory);
        // assign dut.reg_bank.registers[1] = 32'hFFFFFFFA; // -6 em complemento de 2
        // assign dut.reg_bank.registers[2] = 32'hFFFFFFFC; // -4 em complemento de 2
    
            // Aguarda 2 ciclos de clock em Reset para estabilizar o hardware

        // Aguarda 2 ciclos de clock em Reset para estabilizar o hardware
        #40;
        rst = 0;

        // Opcional: Carrega um programa de teste na memória de instruções se ela não for inicializada internamente
        // $readmemh("meu_programa.hex", dut.instruction_memory.instruction_memory);

        // Executa a simulação por um período de tempo determinado
        // Altere este valor baseado no tamanho do programa que o processador rodará
        #5000;

        // Encerra a simulação de forma limpa
        $fclose(log_file);
        $display("Simulação finalizada com sucesso. Arquivo 'execucao_pipeline.json' gerado.");
        $finish;
    end

    // Monitoramento Assíncrono a cada ciclo de Clock (Borda de Subida)
    always @(posedge clk) begin
        // Começamos a registrar apenas após a liberação do reset
        if (!rst && enable) begin
            ciclo = ciclo + 1;

            // Escrita formatada em formato JSON Lines (uma linha por ciclo de clock)
            // Nota: Para acessar registradores internos, usamos a sintaxe hierárquica do Verilog (dut.nome_da_instancia...)
            $fwrite(log_file, "{");
            $fwrite(log_file, "\"ciclo\": \"%0d\", ",     ciclo);
            $fwrite(log_file, "\"pc_atual\": \"%h\", ", dut.pc); // Sinal interno do PC atual em execução
            $fwrite(log_file, "\"instrucao\": \"%h\", ", out_instruction);
            
            // Informações de rs1 e rs2
            $fwrite(log_file, "\"rs1_num\": \"%0d\", \"rs1_val\": \"%0d\", \"rs2_num\": \"%0d\", \"rs2_val\": \"%0d\", ",
                dut.IF_ID.rs1, dut.reg_bank.A, dut.IF_ID.rs2, dut.reg_bank.B);

            // Estado de todos os 32 registradores
            $fwrite(log_file, "\"x0\": \"%0d\", \"x1\": \"%0d\", \"x2\": \"%0d\", \"x3\": \"%0d\", \"x4\": \"%0d\", \"x5\": \"%0d\", \"x6\": \"%0d\", \"x7\": \"%0d\", ",
                dut.reg_bank.registers[0], dut.reg_bank.registers[1], dut.reg_bank.registers[2], dut.reg_bank.registers[3],
                dut.reg_bank.registers[4], dut.reg_bank.registers[5], dut.reg_bank.registers[6], dut.reg_bank.registers[7]);
            $fwrite(log_file, "\"x8\": \"%0d\", \"x9\": \"%0d\", \"x10\": \"%0d\", \"x11\": \"%0d\", \"x12\": \"%0d\", \"x13\": \"%0d\", \"x14\": \"%0d\", \"x15\": \"%0d\", ",
                dut.reg_bank.registers[8], dut.reg_bank.registers[9], dut.reg_bank.registers[10], dut.reg_bank.registers[11],
                dut.reg_bank.registers[12], dut.reg_bank.registers[13], dut.reg_bank.registers[14], dut.reg_bank.registers[15]);
            $fwrite(log_file, "\"x16\": \"%0d\", \"x17\": \"%0d\", \"x18\": \"%0d\", \"x19\": \"%0d\", \"x20\": \"%0d\", \"x21\": \"%0d\", \"x22\": \"%0d\", \"x23\": \"%0d\", ",
                dut.reg_bank.registers[16], dut.reg_bank.registers[17], dut.reg_bank.registers[18], dut.reg_bank.registers[19],
                dut.reg_bank.registers[20], dut.reg_bank.registers[21], dut.reg_bank.registers[22], dut.reg_bank.registers[23]);
            $fwrite(log_file, "\"x24\": \"%0d\", \"x25\": \"%0d\", \"x26\": \"%0d\", \"x27\": \"%0d\", \"x28\": \"%0d\", \"x29\": \"%0d\", \"x30\": \"%0d\", \"x31\": \"%0d\", ",
                dut.reg_bank.registers[24], dut.reg_bank.registers[25], dut.reg_bank.registers[26], dut.reg_bank.registers[27],
                dut.reg_bank.registers[28], dut.reg_bank.registers[29], dut.reg_bank.registers[30], dut.reg_bank.registers[31]);
            
            // Sub-objeto registradores para compatibilidade estrita
            $fwrite(log_file, "\"registradores\": {");
            $fwrite(log_file, "\"x0\":\"%0d\",\"x1\":\"%0d\",\"x2\":\"%0d\",\"x3\":\"%0d\",\"x4\":\"%0d\",\"x5\":\"%0d\",\"x6\":\"%0d\",\"x7\":\"%0d\",",
                dut.reg_bank.registers[0], dut.reg_bank.registers[1], dut.reg_bank.registers[2], dut.reg_bank.registers[3],
                dut.reg_bank.registers[4], dut.reg_bank.registers[5], dut.reg_bank.registers[6], dut.reg_bank.registers[7]);
            $fwrite(log_file, "\"x8\":\"%0d\",\"x9\":\"%0d\",\"x10\":\"%0d\",\"x11\":\"%0d\",\"x12\":\"%0d\",\"x13\":\"%0d\",\"x14\":\"%0d\",\"x15\":\"%0d\",",
                dut.reg_bank.registers[8], dut.reg_bank.registers[9], dut.reg_bank.registers[10], dut.reg_bank.registers[11],
                dut.reg_bank.registers[12], dut.reg_bank.registers[13], dut.reg_bank.registers[14], dut.reg_bank.registers[15]);
            $fwrite(log_file, "\"x16\":\"%0d\",\"x17\":\"%0d\",\"x18\":\"%0d\",\"x19\":\"%0d\",\"x20\":\"%0d\",\"x21\":\"%0d\",\"x22\":\"%0d\",\"x23\":\"%0d\",",
                dut.reg_bank.registers[16], dut.reg_bank.registers[17], dut.reg_bank.registers[18], dut.reg_bank.registers[19],
                dut.reg_bank.registers[20], dut.reg_bank.registers[21], dut.reg_bank.registers[22], dut.reg_bank.registers[23]);
            $fwrite(log_file, "\"x24\":\"%0d\",\"x25\":\"%0d\",\"x26\":\"%0d\",\"x27\":\"%0d\",\"x28\":\"%0d\",\"x29\":\"%0d\",\"x30\":\"%0d\",\"x31\":\"%0d\"",
                dut.reg_bank.registers[24], dut.reg_bank.registers[25], dut.reg_bank.registers[26], dut.reg_bank.registers[27],
                dut.reg_bank.registers[28], dut.reg_bank.registers[29], dut.reg_bank.registers[30], dut.reg_bank.registers[31]);
            $fwrite(log_file, "}, ");
            
            // Monitoramento de Conflitos (Hazards e Sinais do BTB)
            $fwrite(log_file, "\"bolha\": \"%b\", ",        dut.hdu.Bolha);
            $fwrite(log_file, "\"flush\": \"%b\", ",        dut.hdu.Flush);
            $fwrite(log_file, "\"btb_predito\": \"%b\", ",  dut.btb_predicted);
            $fwrite(log_file, "\"btb_alvo\": \"%h\"",       dut.btb_predicted_address);
            
            // Fecha o objeto JSON da linha atual
            $fwrite(log_file, "}\n");
        end
    end

endmodule