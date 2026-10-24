// ---------------------------------------------------------------------------
// tb_mult_vetores.v - testbench do mult_shift_add com vetores lidos de arquivo
//
// Variante didatica do tb_mult_shift_add.v. Ela testa exatamente o mesmo
// modulo, mas troca a lista de chamadas escritas no codigo por um arquivo de
// texto lido com $readmemh.
//
// Existe para mostrar duas coisas de Verilog que todo testbench usa:
//
//   1. TASK x FUNCTION - a diferenca esta no TEMPO.
//      'multiplicar' e uma task: ela espera bordas de clock, logo consome
//      tempo de simulacao, logo NAO pode ser uma function.
//      'referencia' e uma function: calcula e devolve um valor no mesmo
//      instante, sem esperar nada.
//
//   2. $readmemh - carrega uma tabela de numeros em hexadecimal, vinda de um
//      arquivo de texto, para dentro de um array de registradores.
//
// Uso:
//   iverilog -Wall -o sim_vet.vvp tb_mult_vetores.v mult_shift_add.v
//   vvp sim_vet.vvp +vcd=mult_vetores.vcd
//
// O arquivo de vetores pode ser trocado na linha de comando:
//   vvp sim_vet.vvp +vetores=outros_casos.txt
// ---------------------------------------------------------------------------

`timescale 1ns / 1ps
`default_nettype none

module tb_mult_vetores;

`ifndef CLK_PERIOD
  `define CLK_PERIOD 10.0
`endif

    localparam real PERIODO   = `CLK_PERIOD;
    localparam real T_LEITURA = PERIODO * 0.4;   // 40% do periodo
    localparam      LIMITE_CICLOS = 64;

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

    integer passou    = 0;
    integer falhou    = 0;
    integer suspeitos = 0;      // linhas do arquivo que nao batem com a referencia
    integer i;

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
        .clk (clk), .rst_n (rst_n), .start (start),
        .a (a), .b (b), .produto (produto), .done (done)
    );

    always #(PERIODO/2.0) clk = ~clk;

    // =======================================================================
    // A TABELA DE VETORES
    //
    // Um array de registradores: 64 posicoes de 64 bits cada. E a "memoria"
    // que o $readmemh preenche a partir do arquivo de texto.
    //
    // Cada linha do arquivo tem 16 digitos hexadecimais, empacotados assim:
    //
    //     [63:48] = a        [47:32] = b        [31:0] = produto esperado
    // =======================================================================
    localparam MAX_VETORES = 64;

    reg [63:0] vetores [0:MAX_VETORES-1];
    integer    n_vetores;

    // Nome do arquivo: 256 caracteres, nao 64. Strings em Verilog sao vetores
    // de bits de tamanho fixo e o excesso some SEM AVISO - um caminho longo
    // truncado faz o $readmemh falhar com uma mensagem que nao ajuda em nada.
    reg [8*256:1] arquivo_vetores;
    reg [8*256:1] arquivo_vcd;

    // =======================================================================
    // FUNCTION: calcula e devolve um valor, em tempo ZERO
    //
    // Uma function nao pode conter @, # nem wait. Em troca, ela devolve um
    // valor: o nome da function funciona como uma variavel onde se escreve o
    // resultado.
    //
    // Esta aqui serve de modelo de referencia INDEPENDENTE: o operador '*' do
    // simulador nao tem nada a ver com o algoritmo shift-add do circuito, e por
    // isso pode ser usado para conferir se os valores digitados no arquivo
    // estao certos - uma revisao automatica dos proprios dados de teste.
    //
    // A largura importa: 'referencia' tem 32 bits, e e isso que faz a
    // multiplicacao ser calculada em 32 bits. Com 16, o produto seria truncado
    // em silencio e a conferencia concordaria com o proprio erro.
    // =======================================================================
    function [31:0] referencia;
        input [15:0] fa;
        input [15:0] fb;
        begin
            referencia = fa * fb;
        end
    endfunction

    // =======================================================================
    // TASK: executa uma sequencia, e pode CONSUMIR TEMPO
    //
    // Esta task espera 18 bordas de clock do inicio ao fim. E por isso que ela
    // e uma task e nao uma function - uma function teria de terminar no mesmo
    // instante em que comecou.
    //
    // Uma task nao devolve valor: ela se comunica pelo lado de fora (aqui,
    // mexendo nos sinais 'a', 'b', 'start' e nos contadores do placar).
    //
    // 'ciclos' e 'visto' sao declarados DENTRO da task: existem so enquanto ela
    // roda. Em Verilog-2001 essas variaveis sao estaticas por padrao, ou seja,
    // duas chamadas simultaneas da mesma task compartilhariam as duas. Aqui
    // isso nao e problema porque as chamadas sao sequenciais, vindas de um
    // unico bloco initial. Se voce precisar chamar a mesma task de dois lugares
    // ao mesmo tempo, declare-a como 'task automatic'.
    // =======================================================================
    task multiplicar;
        input [15:0] ta;
        input [15:0] tb;
        input [31:0] esperado;
        integer ciclos;
        reg     visto;
        begin
            @(posedge clk);
            #1;                        // afasta a mudanca da borda de clock
            a     = ta;
            b     = tb;
            start = 1'b1;

            @(posedge clk);            // a borda que carrega os operandos
            #1;
            start = 1'b0;

            // Espera o done, amostrando sempre no mesmo instante apos a borda.
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
                $display("  FALHOU  a=%04h b=%04h  done nunca subiu", ta, tb);
            end else if (produto !== esperado) begin
                falhou = falhou + 1;
                $display("  FALHOU  a=%04h b=%04h -> %08h (esperado %08h)",
                         ta, tb, produto, esperado);
            end else begin
                passou = passou + 1;
            end
        end
    endtask

    // =======================================================================
    // Carrega o arquivo e conta quantos vetores vieram
    //
    // O array tem 64 posicoes e o arquivo tem menos linhas que isso. As posicoes
    // sao preenchidas antes com 'x' e depois so as que mudaram sao usadas -
    // assim da para acrescentar ou remover linhas do arquivo sem mexer no
    // testbench.
    //
    // O preco disso e um aviso, que APARECE e e esperado:
    //
    //   WARNING: $readmemh(vetores_mult.txt): Not enough words in the file
    //            for the requested range [0:63].
    //
    // Ele so diz que o arquivo tinha menos linhas que o array - que e
    // exatamente o que queremos. Para silencia-lo, troque MAX_VETORES pelo
    // numero exato de linhas; o custo e ter de mexer aqui toda vez que o
    // arquivo mudar.
    // =======================================================================
    task carregar_vetores;
        begin
            for (i = 0; i < MAX_VETORES; i = i + 1)
                vetores[i] = 64'hxxxxxxxxxxxxxxxx;

            $readmemh(arquivo_vetores, vetores);

            n_vetores = 0;
            for (i = 0; i < MAX_VETORES; i = i + 1)
                if (vetores[i] !== 64'hxxxxxxxxxxxxxxxx)
                    n_vetores = n_vetores + 1;

            $display("    arquivo   : %0s", arquivo_vetores);
            $display("    vetores   : %0d", n_vetores);
        end
    endtask

    // =======================================================================
    // Aplica todos os vetores do arquivo
    // =======================================================================
    task rodar_vetores;
        reg [15:0] va, vb;
        reg [31:0] vesp;
        begin
            for (i = 0; i < n_vetores; i = i + 1) begin
                va   = vetores[i][63:48];
                vb   = vetores[i][47:32];
                vesp = vetores[i][31:0];

                // Revisao dos DADOS antes de testar o CIRCUITO: se o valor
                // digitado no arquivo nao bate com o modelo de referencia, o
                // erro esta no arquivo, nao no multiplicador.
                if (vesp !== referencia(va, vb)) begin
                    suspeitos = suspeitos + 1;
                    $display("  VETOR SUSPEITO  linha %0d: %04h x %04h -> arquivo diz %08h, referencia diz %08h",
                             i+1, va, vb, vesp, referencia(va, vb));
                end

                multiplicar(va, vb, vesp);
            end
        end
    endtask

    // =======================================================================
    // Sequencia principal
    // =======================================================================
    initial begin
        if (!$value$plusargs("vetores=%s", arquivo_vetores))
            arquivo_vetores = "vetores_mult.txt";
        if (!$value$plusargs("vcd=%s", arquivo_vcd))
            arquivo_vcd = "mult_vetores.vcd";

        $dumpfile(arquivo_vcd);
        $dumpvars(0, tb_mult_vetores);

        $display("");
        $display("=========================================================");
        $display(" mult_shift_add  -  vetores lidos de arquivo");
        $display("=========================================================");

        carregar_vetores;

        rst_n = 1'b0;
        repeat (3) @(posedge clk);
        #1 rst_n = 1'b1;

        rodar_vetores;

        repeat (4) @(posedge clk);

        $display("");
        $display("---------------------------------------------------------");
        $display("  PASSOU : %0d", passou);
        $display("  FALHOU : %0d", falhou);
        if (suspeitos != 0)
            $display("  VETORES SUSPEITOS NO ARQUIVO : %0d", suspeitos);
        if (falhou == 0 && suspeitos == 0)
            $display("  RESULTADO: TODOS OS TESTES PASSARAM");
        else
            $display("  RESULTADO: HA PROBLEMAS - ver mensagens acima");
        $display("---------------------------------------------------------");
        $display("");

        $finish;
    end

    initial begin
        #(PERIODO * 20000);
        $display("ERRO: timeout global do testbench");
        $finish;
    end

endmodule

`default_nettype wire
