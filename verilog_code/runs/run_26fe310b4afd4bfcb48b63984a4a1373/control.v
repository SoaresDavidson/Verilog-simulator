`timescale 1ns/1ps

// fazer a diferenciacao das instrucoes tipo U
module control(
    input wire [6:0] opcode,
    // controle MEM
    output	wire mem_rd_out, //le memoria
	output	wire mem_wr_out, //escreve memoria

	// controle WB
	output	wire reg_wr_out, // escreve banco de reg
	output	wire mux_reg_wr_out, //mux do final

    // EX
    output   wire [1:0] ula_op_out, // escolhe operação
    output   wire [1:0] alu_src1_out, // escolhe pc ou val_A ou 0
    output   wire [1:0] alu_src2_out, // escolhe val_B ou imm ou 4
    // ID
    output wire jump_out,
    output wire branch_out,
    output wire jalr_out

);

reg mem_rd, mem_wr, reg_wr, mux_reg_wr, branch, jump, jalr;
reg [1:0] ula_op, alu_src1, alu_src2;



assign mem_rd_out = mem_rd;
assign mem_wr_out = mem_wr;
assign reg_wr_out = reg_wr;
assign mux_reg_wr_out = mux_reg_wr;
assign branch_out = branch;
assign ula_op_out = ula_op;
assign alu_src1_out = alu_src1;
assign alu_src2_out = alu_src2;
assign jump_out = jump;
assign jalr_out = jalr;

always @(*) begin
    case (opcode)
        7'b0110011: begin //tipo R
            branch = 1'b0;
            mem_rd = 1'b0;
            mem_wr = 1'b0;
            ula_op = 2'b10; 
            reg_wr = 1'b1;
            mux_reg_wr = 1'b0; 
            alu_src1 = 2'b0;
            alu_src2 = 2'b0;
            jump = 1'b0;
            jalr = 1'b0;
        end 
        7'b0010011: begin // tipo I
            branch = 1'b0;
            mem_rd = 1'b0;
            mem_wr = 1'b0;
            ula_op = 2'b10;
            reg_wr = 1'b1;
            mux_reg_wr = 1'b0; 
            alu_src1 = 2'b00;
            alu_src2 = 2'b01;
            jump = 1'b0;
            jalr = 1'b0;
        end
        7'b0000011: begin // tipo I load
            branch = 1'b0;
            mem_rd = 1'b1;
            mem_wr = 1'b0;
            ula_op = 2'b00;
            reg_wr = 1'b1;
            mux_reg_wr = 1'b0; 
            alu_src1 = 2'b00;
            alu_src2 = 2'b01;
            jump = 1'b0;
            jalr = 1'b0;
        end
        7'b0100011: begin // tipo S 
            branch = 1'b0;
            mem_rd = 1'b0;
            mem_wr = 1'b1;
            ula_op = 2'b00;
            reg_wr = 1'b0;
            mux_reg_wr = 1'b1; 
            alu_src1 = 2'b00;
            alu_src2 = 2'b01;
            jump = 1'b0;
            jalr = 1'b0;
        end
        7'b1100011: begin // tipo B 
            branch = 1'b1;
            mem_rd = 1'b0;
            mem_wr = 1'b0;
            ula_op = 2'b00;
            reg_wr = 1'b0;
            mux_reg_wr = 1'b0; 
            alu_src1 = 2'b00;
            alu_src2 = 2'b00;
            jump = 1'b0;
            jalr = 1'b0;
        end
        7'b0110111: begin // tipo U lui
            branch = 1'b0;
            mem_rd = 1'b0;
            mem_wr = 1'b0;
            ula_op = 2'b00;
            reg_wr = 1'b1;
            mux_reg_wr = 1'b0;
            alu_src1 = 2'b10;
            alu_src2 = 2'b01;
            jump = 1'b0;
            jalr = 1'b0;
        end
        7'b0010111: begin // tipo U auipc
            branch = 1'b0;
            mem_rd = 1'b0;
            mem_wr = 1'b0;
            ula_op = 2'b00;
            reg_wr = 1'b1;
            mux_reg_wr = 1'b0;
            alu_src1 = 2'b01;
            alu_src2 = 2'b01;
            jump = 1'b0;
            jalr = 1'b0;
        end
        7'b1101111: begin // tipo J
            branch = 1'b0;
            mem_rd = 1'b0;
            mem_wr = 1'b0;
            ula_op = 2'b00;
            reg_wr = 1'b1;
            mux_reg_wr = 1'b0; 
            jump = 1'b1;
				jalr = 1'b0;
            alu_src1 = 2'b01;
            alu_src2 = 2'b10;
        end
        7'b1100111: begin  // tipo I JALR
            branch = 1'b0;
            mem_rd = 1'b0;
            mem_wr = 1'b0;
            ula_op = 2'b00;
            reg_wr = 1'b1;
            mux_reg_wr = 1'b0; 
            alu_src1 = 2'b01;
            alu_src2 = 2'b10;
            jump = 1'b1;
            jalr = 1'b1;
        end
		  default: begin
            branch = 1'b0;
            mem_rd = 1'b0;
            mem_wr = 1'b0;
            ula_op = 2'b00;
            reg_wr = 1'b0;
            mux_reg_wr = 1'b0; 
            alu_src1 = 2'b00;
            alu_src2 = 2'b00;
            jump = 1'b0;
            jalr = 1'b0;
			end
    endcase
    end
endmodule
