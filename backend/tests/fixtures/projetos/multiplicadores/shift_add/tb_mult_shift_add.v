// ---------------------------------------------------------------------------
// tb_mult_shift_add.v - testbench do multiplicador shift-add
//
// REGRA DE OURO DESTE ARQUIVO: ele roda SEM MODIFICACAO nos tres niveis de
// simulacao do fluxo:
//
//   N1 RTL                    iverilog tb_mult_shift_add.v mult_shift_add.v
//   N2 gate-level sem atraso  + netlist + modelos sky130 (-DFUNCTIONAL)
//   N3 gate-level com atraso  + netlist + modelos + SDF   (-DUSE_SDF)
//
// Se o testbench precisasse mudar entre os niveis, a comparacao entre eles nao
// significaria nada. Por isso duas restricoes que o codigo respeita:
//
//   1. NENHUMA referencia hierarquica ao interior do DUT (ex.: dut.cont).
//      A netlist pos-sintese nao tem esses sinais - so portas e celulas.
//   2. As entradas mudam logo APOS uma borda de clock, e as saidas sao lidas
//      DEPOIS de um atraso de acomodacao. Ler no instante da borda funciona no
//      RTL (atraso zero) e produz uma enxurrada de falsas falhas com SDF.
//
// Uso:
//   iverilog -Wall -o sim.vvp tb_mult_shift_add.v mult_shift_add.v
//   vvp sim.vvp +vcd=mult_rtl.vcd
//   gtkwave mult_shift_add.gtkw
// ---------------------------------------------------------------------------

`timescale 1ns / 1ps
`default_nettype none

module tb_mult_shift_add;

    // -----------------------------------------------------------------------
    // Parametros de tempo
    //
    // CLK_PERIOD e sobrescrevivel na linha de comando:
    //     iverilog -DCLK_PERIOD=8 ...
    // E assim que, depois da sintese, se aperta o clock ate o circuito QUEBRAR
    // e se confirma na pratica a fmax que a STA previu.
    // -----------------------------------------------------------------------
`ifndef CLK_PERIOD
  `define CLK_PERIOD 10.0          // 10 ns = 100 MHz
`endif

    localparam real PERIODO = `CLK_PERIOD;

    // Instante de leitura das saidas, medido a partir da borda de subida.
    // 40% do periodo: tempo de sobra para o clk->Q e a propagacao das celulas,
    // e ainda bem antes da proxima borda.
    localparam real T_LEITURA = PERIODO * 0.4;

    // Rede de seguranca: quantos ciclos esperar pelo 'done' antes de desistir.
    // O circuito deve levar 16; qualquer coisa perto de 64 e sintoma de que ele
    // travou (tipico quando o SDF nao anota e tudo fica em x).
    localparam LIMITE_CICLOS = 64;

    // -----------------------------------------------------------------------
    // Sinais
    // -----------------------------------------------------------------------
    reg         clk   = 1'b0;
    reg         rst_n = 1'b0;
    reg         start = 1'b0;
    reg  [15:0] a     = 16'd0;
    reg  [15:0] b     = 16'd0;

    wire [31:0] produto;
    wire        done;

    integer passou   = 0;
    integer falhou   = 0;
    integer n_ops    = 0;     // quantas multiplicacoes foram pedidas
    integer i;

    // Latencia observada, para comparar com as proximas versoes do
    // multiplicador (a versao combinacional levara 1 ciclo, nao 16).
    integer lat_min = 9999;
    integer lat_max = 0;

    // -----------------------------------------------------------------------
    // DUT
    //
    // A instancia se chama 'dut' e esse nome importa: e o alvo do
    // $sdf_annotate no nivel N3.
    // -----------------------------------------------------------------------
    // -----------------------------------------------------------------------
    // Qual modulo instanciar.
    //
    // O default e o multiplicador da aula 1, de modo que todos os comandos das
    // aulas 1 a 5 continuam valendo sem mudanca. A aula 6 sobrescreve com
    //     iverilog -DDUT_MODULE=mult_array ...
    // para medir a OUTRA arquitetura com este MESMO arquivo de teste. Trocar o
    // testbench junto com o circuito invalidaria a comparacao.
    // -----------------------------------------------------------------------
`ifndef DUT_MODULE
  `define DUT_MODULE mult_shift_add
`endif

    `DUT_MODULE dut (
        .clk     (clk),
        .rst_n   (rst_n),
        .start   (start),
        .a       (a),
        .b       (b),
        .produto (produto),
        .done    (done)
    );

    // -----------------------------------------------------------------------
    // Clock
    // -----------------------------------------------------------------------
    always #(PERIODO/2.0) clk = ~clk;

    // -----------------------------------------------------------------------
    // Anotacao de atrasos (so no nivel N3)
    // -----------------------------------------------------------------------
`ifdef USE_SDF
    initial begin
        $sdf_annotate(`SDF_FILE, dut, , "sdf_annotate.log", "MAXIMUM");
    end
`endif

    // -----------------------------------------------------------------------
    // Vigia do 'done': conta os pulsos.
    //
    // Um bug classico em maquina de estados e o done disparar sozinho, ou
    // disparar duas vezes. O placar de acertos nao pegaria isso - a task le o
    // primeiro done e segue feliz. Contar os pulsos e comparar com o numero de
    // operacoes pedidas pega.
    // -----------------------------------------------------------------------
    // Repare que ele amostra em T_LEITURA depois da borda, e NAO na borda: ler
    // 'done' no instante da borda devolve o valor do ciclo ANTERIOR (a saida do
    // flip-flop so muda na regiao de atribuicao nao-bloqueante). O vigia contaria
    // cada pulso um ciclo atrasado - e perderia o ultimo, ja que a simulacao
    // termina antes da borda seguinte. E a mesma regra que a task obedece.
    integer pulsos_done = 0;
    always @(posedge clk) begin
        #(T_LEITURA);
        if (done === 1'b1) pulsos_done = pulsos_done + 1;
    end

    // -----------------------------------------------------------------------
    // Tarefa central: pede uma multiplicacao e confere o resultado.
    //
    // Protocolo de tempo (o coracao do testbench portavel):
    //
    //   @(posedge clk)  -> sincroniza
    //   #1              -> afasta a mudanca de entrada da borda de clock
    //   aplica a, b, start
    //   @(posedge clk)  -> ESTA borda carrega os operandos no DUT
    //   #1 start = 0    -> start e um pulso de um ciclo so
    //   repete { @(posedge clk); #T_LEITURA; } ate ver done
    //   confere         -> a leitura e valida em qualquer nivel de simulacao
    // -----------------------------------------------------------------------
    task multiplicar;
        input [15:0] ta, tb;
        input [31:0] esperado;
        integer ciclos;
        reg     visto;
        begin
            @(posedge clk);
            #1;
            a     = ta;
            b     = tb;
            start = 1'b1;

            @(posedge clk);        // a borda que carrega
            #1;
            start = 1'b0;
            n_ops = n_ops + 1;

            // Espera o done, amostrando SEMPRE no mesmo instante apos a borda.
            ciclos = 0;
            visto  = 1'b0;
            while (!visto && ciclos < LIMITE_CICLOS) begin
                @(posedge clk);
                #(T_LEITURA);
                ciclos = ciclos + 1;
                if (done === 1'b1) visto = 1'b1;
            end

            if (!visto) begin
                falhou = falhou + 1;
                $display("FALHOU t=%0t TIMEOUT a=%04h b=%04h - done nunca subiu em %0d ciclos",
                         $time, ta, tb, LIMITE_CICLOS);
            end else begin
                if (ciclos < lat_min) lat_min = ciclos;
                if (ciclos > lat_max) lat_max = ciclos;

                if (produto === esperado) begin
                    passou = passou + 1;
                end else begin
                    falhou = falhou + 1;
                    $display("FALHOU t=%0t a=%04h b=%04h -> produto=%08h (esperado %08h)",
                             $time, ta, tb, produto, esperado);
                end
            end
        end
    endtask

    // -----------------------------------------------------------------------
    // Camada 1: vetores dirigidos
    //
    // Os valores esperados estao escritos A MAO, em hexadecimal - nao
    // calculados com o operador '*'. Se o esperado viesse da mesma ferramenta
    // que simula o circuito, um erro de entendimento meu passaria despercebido
    // nas duas pontas. Aqui as duas fontes sao independentes: eu e o circuito.
    // -----------------------------------------------------------------------
    task rodar_dirigidos;
        begin
            // --- casos triviais, que sao onde os bugs bobos se escondem -----
            multiplicar(16'h0000, 16'h0000, 32'h00000000);  // 0 x 0
            multiplicar(16'h0000, 16'hFFFF, 32'h00000000);  // 0 x max
            multiplicar(16'hFFFF, 16'h0000, 32'h00000000);  // max x 0
            multiplicar(16'h0001, 16'h0001, 32'h00000001);  // 1 x 1
            multiplicar(16'h0001, 16'hFFFF, 32'h0000FFFF);  // identidade
            multiplicar(16'hFFFF, 16'h0001, 32'h0000FFFF);  // identidade trocada

            // --- o pior caso: todos os bits somam, o vai-um atravessa tudo ---
            multiplicar(16'hFFFF, 16'hFFFF, 32'hFFFE0001);  // 65535^2

            // --- a fronteira dos 16 bits: onde o resultado deixa de caber ----
            multiplicar(16'h8000, 16'h0002, 32'h00010000);  // 32768 x 2
            multiplicar(16'h8000, 16'h8000, 32'h40000000);  // 32768^2
            multiplicar(16'hFFFF, 16'h0002, 32'h0001FFFE);  // max x 2

            // --- potencias de dois: so deslocamento, nenhuma soma ------------
            multiplicar(16'h0001, 16'h8000, 32'h00008000);
            multiplicar(16'h0100, 16'h0100, 32'h00010000);  // 256 x 256

            // --- bits alternados: atividade maxima de chaveamento ------------
            multiplicar(16'hAAAA, 16'h5555, 32'h38E31C72);
            multiplicar(16'h5555, 16'hAAAA, 32'h38E31C72);  // comutatividade

            // --- conferencia em decimal, para o leitor humano ----------------
            multiplicar(16'd100,  16'd100,  32'd10000);
            multiplicar(16'd1234, 16'd5678, 32'd7006652);

            $display("    vetores dirigidos aplicados: 16");
        end
    endtask

    // -----------------------------------------------------------------------
    // Camada 2: vetores aleatorios contra o modelo de referencia
    //
    // Aqui o esperado vem do operador '*' do simulador - uma implementacao
    // completamente diferente do shift-add, e por isso uma referencia legitima.
    //
    // Note a largura: 'esperado' tem 32 bits, e e isso que faz a conta ser
    // feita em 32 bits. Se fosse 'reg [15:0] esperado', o produto seria
    // truncado em silencio e o teste concordaria com o proprio erro.
    // -----------------------------------------------------------------------
    localparam N_ALEATORIOS = 200;

    task rodar_aleatorios;
        reg [15:0] ra, rb;
        reg [31:0] esperado;
        begin
            for (i = 0; i < N_ALEATORIOS; i = i + 1) begin
                ra = $random;
                rb = $random;
                esperado = ra * rb;
                multiplicar(ra, rb, esperado);
            end
            $display("    vetores aleatorios aplicados: %0d", N_ALEATORIOS);
        end
    endtask

    // -----------------------------------------------------------------------
    // Sequencia principal
    // -----------------------------------------------------------------------
    // 256 caracteres. Com um buffer curto (64), um caminho longo e truncado
    // silenciosamente e o $dumpfile falha com "Unable to open ...".
    reg [8*256:1] arquivo_vcd;

    initial begin
        if (!$value$plusargs("vcd=%s", arquivo_vcd))
            arquivo_vcd = "mult_shift_add.vcd";

        $dumpfile(arquivo_vcd);
        $dumpvars(0, tb_mult_shift_add);

        $display("");
        $display("=========================================================");
        $display(" Testbench mult_shift_add  -  periodo = %.1f ns (%.1f MHz)",
                 PERIODO, 1000.0/PERIODO);
        $display("=========================================================");

        // Reset assincrono, liberado 1 ns DEPOIS da borda: mudar um sinal
        // exatamente sobre a borda cria ambiguidade que o gate-level resolve
        // de formas imprevisiveis.
        rst_n = 1'b0;
        repeat (3) @(posedge clk);
        #1 rst_n = 1'b1;
        $display("    reset liberado em t=%0t", $time);

        // Com o reset solto e sem start, nada pode acontecer.
        repeat (3) @(posedge clk);
        #(T_LEITURA);
        if (done !== 1'b0 || produto !== 32'd0) begin
            falhou = falhou + 1;
            $display("FALHOU t=%0t parado apos reset: done=%b produto=%08h",
                     $time, done, produto);
        end

        rodar_dirigidos;
        rodar_aleatorios;

        // Alguns ciclos ociosos antes de fechar o placar: da tempo de contar o
        // pulso da ultima operacao e confirma que o circuito fica quieto
        // enquanto ninguem pede nada.
        repeat (4) @(posedge clk);
        #(T_LEITURA);
        if (done !== 1'b0) begin
            falhou = falhou + 1;
            $display("FALHOU t=%0t done ficou alto com o circuito ocioso", $time);
        end

        // Placar
        $display("");
        $display("---------------------------------------------------------");
        $display("  PASSOU : %0d", passou);
        $display("  FALHOU : %0d", falhou);
        $display("  latencia: %0d ciclos (min) / %0d ciclos (max)", lat_min, lat_max);
        $display("  pulsos de done: %0d   operacoes pedidas: %0d", pulsos_done, n_ops);
        if (pulsos_done != n_ops)
            $display("  ATENCAO: numero de pulsos de done nao bate com o de operacoes");
        if (falhou == 0 && pulsos_done == n_ops)
            $display("  RESULTADO: TODOS OS TESTES PASSARAM");
        else
            $display("  RESULTADO: HA FALHAS - ver mensagens acima");
        $display("---------------------------------------------------------");
        $display("");

        $finish;
    end

    // -----------------------------------------------------------------------
    // Rede de seguranca global: impede que a simulacao rode para sempre.
    // -----------------------------------------------------------------------
    initial begin
        #(PERIODO * 20000);
        $display("ERRO: timeout global do testbench");
        $finish;
    end

endmodule

`default_nettype wire
