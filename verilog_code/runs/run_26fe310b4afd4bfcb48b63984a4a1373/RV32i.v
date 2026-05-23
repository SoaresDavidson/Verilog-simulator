`timescale 1ns/1ps

`default_nettype none
module RV32i(
    input wire clk,
    input wire rst,
    input wire enable,    
    //so para testes
    output wire [31:0] pc_out,
    output wire [31:0] out_instruction
);
  //Branch Target Buffer
  wire [31:0] btb_predicted_address;
  wire btb_predicted;
  //program counter
  wire [31:0] pc;
  wire PCWrite;
  //instruction memory
  wire [31:0] instruction;
  //IF/ID
  wire IFIDWrite, IFIDpredicted;
  wire [6:0] opcode; 
  wire [4:0] IFID_rd, IFID_rs1, IFID_rs2; //registadores de destino e fonte
  wire [2:0] funct3; 
  wire [6:0] funct7;
  wire [11:0] imm_I, imm_S, imm_B; //imediatos tipo I, S e B
  wire [19:0] imm_U, imm_J; //imediatos tipo U e J
  wire [31:0] IFID_pc;
  //sinais de controle
  wire mem_rd, mem_wr, reg_wr, mux_reg_mem, branch, jump, jalr;
  wire [1:0] alu_src1, alu_src2;
  wire [1:0] ula_op;
  //foward unit
  reg [31:0] forwarding_A, forwarding_B, forwarding_rs1, forwarding_rs2;
  //ID/EX
  wire IDEXmem_rd, IDEXmem_wr, IDEXreg_wr, IDEXmux_reg_wr, IDEXmul;
  wire [1:0] IDEXalu_src1, IDEXalu_src2;
  wire [1:0] IDEXula;
  wire [31:0] IDEXimm, IDEXpc;
  wire [4:0] IDEXrs1, IDEXrs2, IDEXrd;
  wire [6:0] IDEXfunct7;
  wire [2:0] IDEXfunct3;
  wire [31:0] IDEXval_A, IDEXval_B;
  //Banco de registradores
  wire [31:0] rs1_value;
  wire [31:0] rs2_value;
  //branch decider
  wire branch_tomado;
  // imm gen
  reg [31:0] imm_gen_output;
  //forward unit
  wire [1:0] forwardA;
  wire [1:0] forwardB;
  wire [1:0] forwardrs1;
  wire [1:0] forwardrs2;
  // hazard unit
  wire Jump, Bolha, Flush, Bolha_mem, IDEXenable;
  //ULA controler
  wire [3:0] operation;
  wire ula_err;
  //ULA
  wire ULA_zero;
  reg [31:0] ULA_A, ULA_B;
  wire [31:0] ULA_C;
  //multiplicador
  reg mul;
  wire [2:0] counter;
  wire [31:0] signedS, unsignedS; 
  wire [63:0] tempS, tempU;
  //EX/MEM
  wire EXMEMmem_rd,EXMEMmem_wr, EXMEMreg_wr, EXMEMmux_reg_wr;
  wire [31:0] EXMEMula_res, EXMEMval_B;
  wire [4:0] EXMEMrd;
  wire [2:0] EXMEMfunct3;
  //MEM/WB
  wire [4:0] MEMWB_rd;
  wire MEMWBreg_wr, MEMWBmem_rd, MEMWBmem_wr, MEMWBmux_reg_wr;
  wire [31:0] MEMWBula_res, MEMWBmem_data;
  reg [31:0] MEMWBmux_result;
  //main memory
  wire [31:0]MEMWBdata;
  //mux final
  assign pc_out = pc;
  assign out_instruction = instruction;

  BranchTargetBuffer btb(
    .clk(clk),
    .rst(rst),
    .pc(pc),
    .IFID_pc(IFID_pc),
    .target_address($signed(imm_gen_output) + ((jump && ~opcode[3]) ?  forwarding_rs1 : IFID_pc)),
    .branch_taken((branch_tomado && branch) || jump),
    //outputs
    .predicted_address(btb_predicted_address),
    .predicted(btb_predicted)
  );
    // .Target(IFIDpredicted && !branch ? IFID_pc : btb_predicted ? btb_predicted_address : $signed(imm_gen_output) + ((jump && ~opcode[3]) ?  forwarding_rs1 : IFID_pc)), // não questione, so comparar o opcode[3] do jalr e do jal a única diferença é esse bit  // 
  PC dut_pc(
    //entradas
    .Clk(clk),
    .Reset(rst),
    .IFID_pc(IFID_pc),
    .btb_predicted_address(btb_predicted_address),
    .btb_predicted(btb_predicted),
    .branch(branch),
    .IFIDpredicted(IFIDpredicted),
    .Jump((branch_tomado && branch) || jump), // se for jump ou branch tomado em um instrução do tipo B, pega o target
    .Enable(enable),
    .PCWrite(PCWrite), // sinal vindo da hazard unit
    //ternario aninhado pois estou com preguiça de criar mais fios ass:Davi
    .Target($signed(imm_gen_output) + ((jump && ~opcode[3]) ?  forwarding_rs1 : IFID_pc)), // não questione, so comparar o opcode[3] do jalr e do jal a única diferença é esse bit
    //saída
    .pc(pc) // saída do PC
  );

  instruction_memory im(
    //entradas
    .clk(clk),
    .addr(pc),
    //saída
    .instruction(instruction)
  );


  IF_ID IF_ID(
    //entradas
    .instruction(instruction),
    .clk(clk),
    .rst(rst),
    .predicted_in(btb_predicted),
    .Flush(Flush),
    .enable(enable),
    .IFIDWrite(IFIDWrite),
    .pc_in(pc),
    //saídas
    .pc_out(IFID_pc),
    .opcode(opcode),
    .rd(IFID_rd),
    .rs1(IFID_rs1),
    .rs2(IFID_rs2),
    .funct3(funct3),
    .funct7(funct7),
    //imediatos
    .imm_I(imm_I),
    .imm_S(imm_S),
    .imm_B(imm_B),
    .imm_U(imm_U),
    .imm_J(imm_J),
    .predicted_out(IFIDpredicted)
  );

  control ctrl(
    //entrada
    .opcode(opcode),
    //saídas
    .mem_rd_out(mem_rd),
    .mem_wr_out(mem_wr),
    .reg_wr_out(reg_wr),
    .mux_reg_wr_out(mux_reg_mem),
    .ula_op_out(ula_op),
    .alu_src1_out(alu_src1),
    .alu_src2_out(alu_src2),
    .jump_out(jump),
    .branch_out(branch),
    .jalr_out(jalr)
  );

  always @(*) begin
    mul = (opcode == 7'b0110011) && (funct7 == 7'b0000001); // verifica se é uma instrução de multiplicação
  end

  hazard_detection_unit hdu (
    .IDEX_RegWrite(IDEXreg_wr),
    .EXMEM_MemRead(EXMEMmem_rd),
    .IDEX_MemRead(IDEXmem_rd),
    .branch(branch),
    .jalr(jalr),
    .mul(IDEXmul),
    .IDEXfunct3(IDEXfunct3),
    .counter(counter),
    .EXMEM_RegisterRd(EXMEMrd),
    .IDEX_RegisterRd(IDEXrd),
    .IFID_Register1(IFID_rs1),
    .IFID_Register2(IFID_rs2),
    .Jump((branch_tomado && branch) || jump), 
    .predicted(IFIDpredicted),
    .PCWrite(PCWrite),
    .IFIDWrite(IFIDWrite),
    .IDEXenable(IDEXenable),
    .Bolha_mem(Bolha_mem),
    .Bolha(Bolha),
    .Flush(Flush)
  );

  // imm gen
  always @(*) begin
    case (opcode)
      7'b0110011: imm_gen_output = {32{1'b0}}; // tipo R
      7'b0010011, 7'b0000011, 7'b1100111: imm_gen_output = {{20{imm_I[11]}}, imm_I}; //tipo I
      7'b0100011: imm_gen_output = {{20{imm_S[11]}}, imm_S}; //tipo S
      7'b1100011: imm_gen_output = {{19{imm_B[11]}}, imm_B, 1'b0}; //tipo B
      7'b1101111: imm_gen_output = {{11{imm_J[19]}}, imm_J, 1'b0}; //tipo J
      7'b0010111, 7'b0110111: imm_gen_output = {imm_U, 12'b0}; //tipo U
      default: imm_gen_output = 32'b0;
    endcase
  end
  //mudar para C receber do pipeline de MEMWB
  register_bank reg_bank (
    .clk(clk),
    .rst(rst),
    .rs1(IFID_rs1),
    .rs2(IFID_rs2),
    .rd(MEMWB_rd),
    .RegWrite(MEMWBreg_wr),
    .C(MEMWBmux_result),
    .A(rs1_value),
    .B(rs2_value)
  );
  
  always @(*) begin
    forwarding_rs1 = rs1_value;
    forwarding_rs2 = rs2_value;

    // forwarding for rs1
    case (forwardrs1)
      2'b10: forwarding_rs1 = EXMEMula_res;
      2'b01: forwarding_rs1 = MEMWBmux_result;
      default: forwarding_rs1 = rs1_value;
    endcase

    // forwarding for rs2
    case (forwardrs2)
      2'b10: forwarding_rs2 = EXMEMula_res;
      2'b01: forwarding_rs2 = MEMWBmux_result;
      default: forwarding_rs2 = rs2_value;
    endcase
  end
  
  BranchDecider branch_decider(
    .opcode(opcode),
    .funct3(funct3),
    .rs1(forwarding_rs1),
    .rs2(forwarding_rs2),
    .bolha(Bolha),
    .Branch(branch_tomado)
  );


  ID_EX ID_EX (
    .ula_in(~Bolha ? ula_op : 2'b0), // se for bolha, zera o sinal de controle
    .alu_src1_in(~Bolha ? alu_src1 : 2'b0),
    .alu_src2_in(~Bolha ? alu_src2 : 2'b0),
    .mem_rd_in(~Bolha ? mem_rd : 1'b0),
    .mem_wr_in(~Bolha ? mem_wr : 1'b0),
    .reg_wr_in(~Bolha ? reg_wr : 1'b0),
    .mux_reg_wr_in(~Bolha ? mux_reg_mem : 1'b0),
    .mul_in(~Bolha ? mul : 1'b0),
    .pc_in(IFID_pc),
    .imm_in(jump ? 4 : imm_gen_output),
    .rs1_in(IFID_rs1),
    .rs2_in(IFID_rs2),
    .rd_in(IFID_rd),
    .funct7_in(funct7),
    .funct3_in(funct3),
    .val_A_in(forwarding_rs1),
    .val_B_in(forwarding_rs2),
    .clk(clk),
    .rst(rst),
    .enable(IDEXmul ? IDEXenable : enable), // se for multiplicação, usa o sinal da hazard unit
    .pc_out(IDEXpc),
    .imm_out(IDEXimm),
    .rs1_out(IDEXrs1),
    .rs2_out(IDEXrs2),
    .rd_out(IDEXrd),
    .funct7_out(IDEXfunct7),
    .funct3_out(IDEXfunct3),
    .val_A_out(IDEXval_A),
    .val_B_out(IDEXval_B),
    .ula_out(IDEXula),
    .alu_src1_out(IDEXalu_src1),
    .alu_src2_out(IDEXalu_src2),
    .mem_rd_out(IDEXmem_rd),
    .mem_wr_out(IDEXmem_wr),
    .reg_wr_out(IDEXreg_wr),
    .mul_out(IDEXmul),
    .mux_reg_wr_out(IDEXmux_reg_wr)
  );
  //forward unit
  forward_unit fwd (
    .IFIDrs1(IFID_rs1),
    .IFIDrs2(IFID_rs2),
    .IDEXrs1(IDEXrs1),
    .IDEXrs2(IDEXrs2),
    .EXMEMrd(EXMEMrd),
    .EXMEM_RegWrite(EXMEMreg_wr),
    .MEMWBrd(MEMWB_rd),
    .MEMWB_RegWrite(MEMWBreg_wr),
    .forwardA(forwardA),
    .forwardB(forwardB),
    .forwardRs1(forwardrs1),
    .forwardRs2(forwardrs2)  
	 );

	//logica dos muxes da ula
  always @(*) begin
    forwarding_A = IDEXval_A;
    forwarding_B = IDEXval_B;
    ULA_A = IDEXval_A;
    ULA_B = IDEXval_B;

    // forwarding
    case (forwardA)
      2'b10: forwarding_A = EXMEMula_res;
      2'b01: forwarding_A = MEMWBmux_result;
      default: forwarding_A = IDEXval_A;
    endcase

    case (forwardB)
      2'b10: forwarding_B = EXMEMula_res;
      2'b01: forwarding_B = MEMWBmux_result;
      default: forwarding_B = IDEXval_B;
    endcase

    // seleção das fontes da ULA
    case (IDEXalu_src1)
      2'b00: ULA_A = forwarding_A;
      2'b01: ULA_A = IDEXpc;
      2'b10: ULA_A = 32'b0;
      default: ULA_A = forwarding_A;
    endcase

    case (IDEXalu_src2)
      2'b00: ULA_B = forwarding_B;
      2'b01: ULA_B = IDEXimm;
      2'b10: ULA_B = 32'd4;
      default: ULA_B = forwarding_B;
    endcase
  end
  //alu controler
  ULA_controler ula_ctrl (
    .rst(rst),
    .ula_op(IDEXula),
    .funct7(IDEXfunct7),
    .funct3(IDEXfunct3),
    .operation(operation),
    .err(ula_err)
  );

  ULA ULA ( 
    //entradas
    .A (ULA_A),
    .B (ULA_B),
    //saidas
		.C (ULA_C),
		.ULA_zero (ULA_zero),
		.ula_op (operation)
	);
  
  MulPipelined32Bits uut (
    .Clk(clk),
    .Reset(rst),
    .A(ULA_A),
    .mul(IDEXmul),
    .funct3(IDEXfunct3[1:0]),
    .B(ULA_B),
    .Rd(IDEXrd),
    .counter(counter),
    .regularS(signedS),
    .unsignedS(unsignedS),
    .tempS(tempS),
    .tempU(tempU)
  );

  EX_MEM EX_MEM(
    .mem_rd_in(Bolha_mem ? 1'b0 : IDEXmem_rd),
    .mem_wr_in(Bolha_mem ? 1'b0 : IDEXmem_wr),
    .reg_wr_in(Bolha_mem ? 1'b0 : IDEXreg_wr),
    .mux_reg_wr_in(Bolha_mem ? 1'b0 : IDEXmux_reg_wr),
    .funct3_in(IDEXfunct3),
    .ula_res_in(IDEXmul ? (IDEXfunct3[1] ? unsignedS[31:0] : signedS[31:0]) : ULA_C),
    .val_B_in(forwarding_B),
    .rd_in(IDEXrd),
    .clk(clk),
    .rst(rst),
    .enable(enable),
    .mem_rd_out(EXMEMmem_rd),
    .mem_wr_out(EXMEMmem_wr),
    .reg_wr_out(EXMEMreg_wr),
    .mux_reg_wr_out(EXMEMmux_reg_wr),
    .funct3_out(EXMEMfunct3),
    .ula_res_out(EXMEMula_res),
    .val_B_out(EXMEMval_B),
    .rd_out(EXMEMrd)

  );
  //main memory
  main_memory m_m(
    .clk(clk),
    .funct3(EXMEMfunct3),
    .memRead(EXMEMmem_rd),
    .memWrite(EXMEMmem_wr),
    .addr(EXMEMula_res),
    .writeData(EXMEMval_B),
    .data(MEMWBdata)
  );

  MEM_WB MEM_WB(
    .mem_rd_in(EXMEMmem_rd),
    .reg_wr_in(EXMEMreg_wr),
    .mux_reg_wr_in(EXMEMmux_reg_wr),
    .rd_in(EXMEMrd),
    .ula_res_in(EXMEMula_res),
    .mem_res_in(MEMWBdata), 
    .clk(clk),
    .rst(rst),
    .enable(enable),
    .mem_rd_out(MEMWBmem_rd),
    .reg_wr_out(MEMWBreg_wr),
    .mux_reg_wr_out(MEMWBmux_reg_wr),
    .ula_res_out(MEMWBula_res),
    .mem_res_out(MEMWBmem_data),
    .rd_out(MEMWB_rd)
  );
  always @(*) begin
		MEMWBmux_result = MEMWBmux_reg_wr ? MEMWBmem_data : MEMWBula_res;
  end

endmodule

