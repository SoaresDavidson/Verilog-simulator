// ---------------------------------------------------------------------------
// tb_mult_fluxo.v - mede VAZAO, nao latencia.
//
// Por que este arquivo existe
// ---------------------------
// O tb_mult_shift_add.v das aulas 1 a 6 da um start, ESPERA o done, e so entao
// da o proximo start. Com esse protocolo, as tres arquiteturas da serie sao
// medidas pela latencia - e um pipeline fica INDISTINGUIVEL de um circuito
// combinacional lento, porque a espera esconde exatamente a coisa que o
// pipeline tem de bom.
//
// Este testbench injeta um par de operandos A CADA CICLO, sem esperar nada, e
// confere os resultados na ordem em que saem. E a unica forma de ver a vazao.
//
// DUAS FASES, e a segunda e a que pega bug
// ----------------------------------------
//   fase 1  fluxo continuo: start alto em todos os ciclos.
//           Mede a vazao de regime: ciclos por operacao com o cano cheio.
//   fase 2  fluxo com BOLHAS: start sobe e desce aleatoriamente.
//           Nao mede desempenho - mede CORRECAO. Um pipeline que conte ciclos
//           em vez de carregar um bit de validade junto com os dados passa na
//           fase 1 e falha aqui, porque as bolhas desalinham a contagem.
//           Este e o teste que separa um pipeline certo de um que so parece.
//
// Uso:
//     iverilog -DDUT_MODULE=mult_array_pipe -o f.vvp tb_mult_fluxo.v mult_array_pipe.v
//     vvp f.vvp
// ---------------------------------------------------------------------------

`timescale 1ns / 1ps
`default_nettype none

module tb_mult_fluxo;

`ifndef CLK_PERIOD
  `define CLK_PERIOD 10.0
`endif
`ifndef DUT_MODULE
  `define DUT_MODULE mult_array_pipe
`endif
`ifndef N_OPS
  `define N_OPS 200
`endif
// Qual dos cinco padroes de chaveamento da aula 5 injetar. So importa quando
// este testbench e usado para MEDIR POTENCIA; para verificar correcao, o
// padrao 2 (aleatorio) e o certo.
`ifndef PADRAO
  `define PADRAO 2
`endif
// 1 = so a fase de fluxo continuo. E o que se quer ao gerar VCD para potencia:
// a janela fica limpa, com o cano cheo do inicio ao fim.
// 2 = as duas fases (a segunda, com bolhas, e o teste de CORRECAO).
`ifndef N_FASES
  `define N_FASES 2
`endif

    localparam real PERIODO   = `CLK_PERIOD;
    localparam real T_LEITURA = PERIODO * 0.4;
    localparam      N_OPS     = `N_OPS;
    localparam      PADRAO    = `PADRAO;
    localparam      N_FASES   = `N_FASES;

    reg         clk = 1'b0, rst_n = 1'b0, start = 1'b0;
    reg  [15:0] a = 16'd0, b = 16'd0;
    wire [31:0] produto;
    wire        done;

    `DUT_MODULE dut (
        .clk (clk), .rst_n (rst_n), .start (start),
        .a (a), .b (b), .produto (produto), .done (done)
    );

    always #(PERIODO/2.0) clk = ~clk;

`ifdef USE_SDF
    initial begin
        $sdf_annotate(`SDF_FILE, dut, , "sdf_annotate.log", "MAXIMUM");
    end
`endif

    // -----------------------------------------------------------------------
    // A fila de resultados esperados.
    //
    // Os resultados saem na MESMA ORDEM em que os operandos entraram - um
    // pipeline nao reordena. Entao uma fila simples, com um indice de escrita
    // (na injecao) e um de leitura (na conferencia), basta.
    // -----------------------------------------------------------------------
    reg [31:0] esperado [0:4*N_OPS];
    integer    n_entrou = 0;      // quantos operandos foram injetados
    integer    n_saiu   = 0;      // quantos resultados foram conferidos
    integer    falhou   = 0;
    integer    i;

    integer    ciclo       = 0;   // contador global de bordas
    integer    ciclo_ini   = 0;   // borda em que a fase 1 comecou a injetar
    integer    ciclo_fim   = 0;   // borda em que o ultimo resultado da fase 1 saiu
    integer    ops_fase1   = 0;

    always @(posedge clk) if (rst_n) ciclo = ciclo + 1;

    // -----------------------------------------------------------------------
    // Conferencia: le no mesmo instante fixo apos a borda que o resto da serie
    // usa, para que o N3 com SDF nao produza falsas falhas.
    // -----------------------------------------------------------------------
    always @(posedge clk) begin
        #(T_LEITURA);
        if (rst_n && done === 1'b1) begin
            if (produto !== esperado[n_saiu]) begin
                falhou = falhou + 1;
                if (falhou <= 5)
                    $display("  FALHOU no resultado %0d: %08h (esperado %08h)",
                             n_saiu, produto, esperado[n_saiu]);
            end
            n_saiu    = n_saiu + 1;
            ciclo_fim = ciclo;
        end
    end

    task injetar;
        input [15:0] ta, tb;
        input        valido;
        begin
            @(posedge clk);
            #1;
            a     = ta;
            b     = tb;
            start = valido;
            if (valido) begin
                esperado[n_entrou] = ta * tb;
                n_entrou = n_entrou + 1;
            end
        end
    endtask

    // -----------------------------------------------------------------------
    // Os mesmos cinco padroes do tb_mult_potencia.v, palavra por palavra. E a
    // unica forma de a energia por operacao das duas arquiteturas ser
    // comparavel: mesmo estimulo, modo de operacao diferente.
    // -----------------------------------------------------------------------
    function [31:0] operandos;
        input integer padrao;
        input integer n;
        reg [15:0] fa, fb;
        begin
            case (padrao)
                0: begin fa = 16'h0000; fb = 16'h0000; end
                1: begin fa = 16'h1234; fb = 16'h1234; end
                2: begin fa = $random;  fb = $random;  end
                3: begin
                    fa = (n % 2) ? 16'h5555 : 16'hAAAA;
                    fb = (n % 2) ? 16'hAAAA : 16'h5555;
                end
                4: begin fa = 16'hFFFF; fb = 16'h0001 << (n % 16); end
                default: begin fa = $random; fb = $random; end
            endcase
            operandos = {fa, fb};
        end
    endfunction

    reg [15:0] va, vb;
    reg [31:0] par;
    reg [8*256:1] arquivo_vcd;

    initial begin
        if ($value$plusargs("vcd=%s", arquivo_vcd)) begin
            $dumpfile(arquivo_vcd);
            $dumpvars(0, tb_mult_fluxo);
        end

        rst_n = 1'b0;
        repeat (3) @(posedge clk);
        #1 rst_n = 1'b1;

        $display("");
        $display("=========================================================");
        $display(" vazao  -  %0d operacoes  -  %.1f ns", N_OPS, PERIODO);
        $display("=========================================================");

        // ---- fase 1: fluxo continuo ---------------------------------------
        @(posedge clk);
        ciclo_ini = ciclo;
        for (i = 0; i < N_OPS; i = i + 1) begin
            par = operandos(PADRAO, i);
            va  = par[31:16];
            vb  = par[15:0];
            injetar(va, vb, 1'b1);
        end
        injetar(16'd0, 16'd0, 1'b0);
        ops_fase1 = n_entrou;

        // Espera o cano esvaziar.
        while (n_saiu < ops_fase1) @(posedge clk);
        repeat (2) @(posedge clk);

        $display("  fase 1 (fluxo continuo)");
        $display("    injetadas : %0d", ops_fase1);
        $display("    conferidas: %0d", n_saiu);
        $display("    bordas do primeiro operando ao ultimo resultado: %0d",
                 ciclo_fim - ciclo_ini);
        $display("    ciclos por operacao: %0d.%02d",
                 (ciclo_fim - ciclo_ini) / ops_fase1,
                 (((ciclo_fim - ciclo_ini) * 100) / ops_fase1) % 100);

        $display("    janela da fase 1: t=%0t ps", $time);

        // ---- fase 2: fluxo com bolhas -------------------------------------
        if (N_FASES >= 2)
        for (i = 0; i < N_OPS; i = i + 1) begin
            va = $random;
            vb = $random;
            if ($random % 3 == 0) injetar(16'hDEAD, 16'hBEEF, 1'b0);
            injetar(va, vb, 1'b1);
        end
        if (N_FASES >= 2) injetar(16'd0, 16'd0, 1'b0);

        while (n_saiu < n_entrou) @(posedge clk);
        repeat (4) @(posedge clk);

        if (N_FASES >= 2) $display("  fase 2 (fluxo com bolhas)");
        if (N_FASES >= 2) begin
            $display("    injetadas : %0d", n_entrou - ops_fase1);
            $display("    conferidas: %0d", n_saiu - ops_fase1);
        end

        $display("");
        $display("---------------------------------------------------------");
        $display("  ENTRARAM : %0d", n_entrou);
        $display("  SAIRAM   : %0d", n_saiu);
        $display("  FALHOU   : %0d", falhou);
        if (falhou == 0 && n_saiu == n_entrou)
            $display("  RESULTADO: TODOS OS TESTES PASSARAM");
        else
            $display("  RESULTADO: HA FALHAS - ver mensagens acima");
        $display("---------------------------------------------------------");
        $display("");
        $finish;
    end

    initial begin
        #(PERIODO * 40000);
        $display("ERRO: timeout global do testbench");
        $finish;
    end

endmodule

`default_nettype wire
