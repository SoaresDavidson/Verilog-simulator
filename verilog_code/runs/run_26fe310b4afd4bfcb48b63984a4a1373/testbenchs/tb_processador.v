`timescale 1ns/1ps

module tb_processador;
  
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

  initial begin
    $dumpfile("sinais.vcd");   // nome do arquivo de saída
    $dumpvars(0, tb_processador); // 0 = captura TUDO recursivamente
    
    // aqui você aplica suas instruções / estímulos
    #100;
    $finish;
  end

  always @(*) begin
     if (!rst && enable) begin

    end
  end
endmodule