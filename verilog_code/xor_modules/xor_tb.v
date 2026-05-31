`timescale 1ns/1ps

module xor_tb;
  
  reg clk;
  reg rst;
  reg enable;
  reg result;
  // Instanciação do módulo topo do seu processador
  xor xor (
      .A(A),
      .B(B),
      .C(result)
  );


  // Gerador de Clock (Período de 20ns -> 50 MHz)
  always #10 clk = ~clk;

  initial begin
    A = 0;
    B = 0;
    rst = 1;
    clk = 0;
    $dumpfile("sinais.vcd");   // nome do arquivo de saída
    $dumpvars(0, tb_xor); // 0 = captura TUDO recursivamente

    #10;
    rst = 0;
    
    // aqui você aplica suas instruções / estímulos
    #1000;
    $finish;
  end

  always @(posedge clk) begin
     if (!rst && enable) begin

    end
  end
endmodule