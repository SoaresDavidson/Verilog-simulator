`timescale 1ns/1ps

module BranchTargetBuffer(
    input wire clk,
    input wire rst,
    input wire [31:0] pc,
    input wire [31:0] IFID_pc,
    input wire [31:0] target_address,
    input wire branch_taken,
    output reg [31:0] predicted_address,
    output reg predicted
);

    // pc[66:35], target[34:3], state[2:1], valid[0]
    reg [66:0] buffer[0:255]; 
    
    wire [7:0] pc_less = pc[9:2];
    wire [7:0] IFID_pc_less = IFID_pc[9:2];
    
    // Atalho para o estado atual para facilitar a leitura e evitar dead cases
    wire [1:0] current_state = buffer[IFID_pc_less][2:1];
    wire is_valid = buffer[IFID_pc_less][0];

    // Leitura combinacional contínua para evitar warning do Icarus Verilog no always @(*)
    wire [66:0] selected_entry = buffer[pc_less];
    
    // Lógica Sequencial: Escrita e Atualização de Estados
    always @(posedge clk or posedge rst) begin
        if (rst) begin : rst_block
            integer i;
            for (i = 0; i < 256; i = i + 1) begin
                buffer[i] <= 67'b0;
            end
        end 
        else if (branch_taken) begin
            // Se a entrada não existe ou o PC/Target mudou, reiniciamos a entrada
            if (!is_valid || buffer[IFID_pc_less][66:35] != IFID_pc || buffer[IFID_pc_less][34:3] != target_address) begin
                buffer[IFID_pc_less] <= {IFID_pc, target_address, 2'b00, 1'b1};
            end 
            else begin
                // Atualização da Máquina de Estados (Branch Tomado)
                case (current_state)
                    2'b01:   buffer[IFID_pc_less][2:1] <= 2'b00;
                    2'b11:   buffer[IFID_pc_less][2:1] <= 2'b01;
                    2'b10:   buffer[IFID_pc_less][2:1] <= 2'b11;
                    default: buffer[IFID_pc_less][2:1] <= 2'b00; // Cobre 2'b00 e outros
                endcase
            end
        end 
        else if (is_valid) begin
            // Atualização da Máquina de Estados (Branch NÃO Tomado)
            case (current_state)
                2'b00:   buffer[IFID_pc_less][2:1] <= 2'b01;
                2'b01:   buffer[IFID_pc_less][2:1] <= 2'b11;
                2'b11:   buffer[IFID_pc_less][2:1] <= 2'b10;
                default: buffer[IFID_pc_less][2:1] <= 2'b10; // Cobre 2'b10
            endcase
        end
    end

    // Lógica Combinacional: Leitura e Predição
    always @(*) begin
        if (selected_entry[0] == 1'b1 && 
            (selected_entry[2:1] == 2'b00 || selected_entry[2:1] == 2'b01) &&
            pc == selected_entry[66:35]) begin
            predicted = 1'b1;
            predicted_address = selected_entry[34:3];
        end else begin
            predicted = 1'b0;
            predicted_address = 32'b0;
        end
    end

endmodule