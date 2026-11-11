// ---------------------------------------------------------------------------
// mult_array_pipe.v - multiplicador 16 x 16 -> 32 bits, combinacional,
//                     em pipeline de 4 estagios
//
// Aula 7 da serie. Mesma arvore do mult_array.v da aula 6, cortada em quatro
// por registradores.
//
// O QUE O PIPELINE FAZ, E O QUE ELE NAO FAZ
// -----------------------------------------
// A aula 6 mediu um caminho critico de 22,171 ns com 29 portas em serie, e
// mostrou que nenhum buffer conserta profundidade logica. Cortar a arvore com
// registradores conserta: o periodo passa a ser o do MAIOR PEDACO, nao o da
// soma. Sete portas por estagio em vez de vinte e nove.
//
// O que o pipeline NAO faz sozinho e dar vazao. Com o protocolo de handshake
// da aula 6 - dar start, ESPERAR o done, so entao dar o proximo start - um
// pipeline de 4 estagios entregaria um resultado a cada ~6 ciclos, PIOR que os
// 3,16 ciclos por operacao do array combinacional. A aula 6 ja tinha medido
// que o protocolo custava 68% do tempo de cada operacao.
//
// Por isso este modulo troca o handshake por RASTREAMENTO DE VALIDADE:
//
//     start  = "ha um operando valido nesta borda"   (pode subir TODO ciclo)
//     done   = "o resultado nesta borda e valido"
//
// Um bit de validade viaja pelos estagios junto com os dados. Nao ha maquina
// de estados, nao ha espera e nao ha contrapressao: o circuito aceita um par
// de operandos por ciclo, sempre, e devolve um resultado por ciclo, quatro
// bordas depois.
//
// AS PORTAS SAO AS MESMAS das aulas 1 a 6. O testbench daquelas aulas roda
// sobre este modulo sem uma linha alterada - ele so nao vai explorar a vazao,
// e vai medir latencia 4 em vez de 16 ou 1.
//
// AS LARGURAS DOS REGISTRADORES
// -----------------------------
// Declarar os nos intermediarios com 32 bits seria mais facil de ler e
// custaria 176 flip-flops que nao guardam nada. Cada nivel da arvore tem um
// numero exato de bits significativos, e o limite e justo nos quatro casos:
//
//   r1[j] = p[2j] + p[2j+1]<<1   <=   3 * (2^16-1)  <  2^18   -> 18 bits
//   r2[k] = r1[2k] + r1[2k+1]<<2 <=  15 * (2^16-1)  <  2^20   -> 20 bits
//   r3[m] = r2[2m] + r2[2m+1]<<4 <= 255 * (2^16-1)  <  2^24   -> 24 bits
//   produto = r3[0] + r3[1]<<8   <= (2^16-1)^2      <  2^32   -> 32 bits
//
// O truque que permite isso: cada nivel guarda o valor JA DESLOCADO para a sua
// propria origem, nao na posicao absoluta dentro do produto. O realinhamento
// acontece na soma seguinte, com um deslocamento constante - que em silicio e
// fiacao, nao logica, e portanto e de graca.
// ---------------------------------------------------------------------------

`timescale 1ns / 1ps
`default_nettype none

module mult_array_pipe (
    input  wire        clk,
    input  wire        rst_n,     // reset assincrono, ativo em nivel BAIXO
    input  wire        start,     // "ha operando valido" - pode subir todo ciclo
    input  wire [15:0] a,         // multiplicando
    input  wire [15:0] b,         // multiplicador
    output reg  [31:0] produto,   // resultado - valido quando done sobe
    output reg         done       // "o resultado nesta borda e valido"
);

    localparam N = 16;

    // -----------------------------------------------------------------------
    // Estagio 0: os operandos.
    //
    // Igual ao da aula 6, e pela mesma razao: com as entradas registradas,
    // todo caminho critico vai de registrador a registrador, dentro do bloco.
    // -----------------------------------------------------------------------
    reg [15:0] mcand, mplier;

    // -----------------------------------------------------------------------
    // Os registradores de pipeline, um por corte.
    // -----------------------------------------------------------------------
    reg [17:0] r1 [0:7];          // depois do nivel 1   8 x 18 = 144 FFs
    reg [19:0] r2 [0:3];          // depois do nivel 2   4 x 20 =  80 FFs
    reg [23:0] r3 [0:1];          // depois do nivel 3   2 x 24 =  48 FFs
                                  //                             ----
                                  //                             272 FFs

    // A cadeia de validade: um bit por estagio, andando junto com os dados.
    // E ela - e so ela - que substitui a maquina de estados da aula 6.
    reg v1, v2, v3, v4;

    // -----------------------------------------------------------------------
    // Combinacional do estagio 1: parciais + nivel 1 da arvore.
    //
    // O AND com {16{mplier[i]}} e a multiplicacao por um bit, igual a aula 6.
    // A parcela impar entra deslocada de uma casa, e o par inteiro fica na
    // origem 2j - por isso r1[j] precisa de 18 bits e nao de 32.
    // -----------------------------------------------------------------------
    wire [17:0] soma1 [0:7];

    genvar i;
    generate
        for (i = 0; i < 8; i = i + 1) begin : nivel1
            assign soma1[i] = {2'b00, (mcand & {16{mplier[2*i]}})}
                            + {1'b0,  (mcand & {16{mplier[2*i + 1]}}), 1'b0};
        end
    endgenerate

    // -----------------------------------------------------------------------
    // Combinacional do estagio 2: nivel 2.
    // r1[2k] tem origem 4k; r1[2k+1] tem origem 4k+2, logo entra << 2.
    // -----------------------------------------------------------------------
    wire [19:0] soma2 [0:3];
    generate
        for (i = 0; i < 4; i = i + 1) begin : nivel2
            assign soma2[i] = {2'b00, r1[2*i]} + {r1[2*i + 1], 2'b00};
        end
    endgenerate

    // -----------------------------------------------------------------------
    // Combinacional do estagio 3: nivel 3.
    // r2[2m] tem origem 8m; r2[2m+1] tem origem 8m+4, logo entra << 4.
    // -----------------------------------------------------------------------
    wire [23:0] soma3 [0:1];
    generate
        for (i = 0; i < 2; i = i + 1) begin : nivel3
            assign soma3[i] = {4'b0000, r2[2*i]} + {r2[2*i + 1], 4'b0000};
        end
    endgenerate

    // -----------------------------------------------------------------------
    // Combinacional do estagio 4: nivel 4, a soma final.
    // r3[0] tem origem 0; r3[1] tem origem 8, logo entra << 8.
    // -----------------------------------------------------------------------
    wire [31:0] soma4 = {8'd0, r3[0]} + {r3[1], 8'd0};

    // -----------------------------------------------------------------------
    // Os registradores.
    //
    // Repare no que NAO existe aqui: nenhum 'case', nenhum 'estado', nenhum
    // 'if (start)' governando o fluxo dos dados. Os dados andam todo ciclo,
    // sempre. O que o 'start' controla e apenas o bit de validade que os
    // acompanha - e por isso o circuito aceita um par novo a cada borda.
    // -----------------------------------------------------------------------
    integer k;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            mcand   <= 16'd0;
            mplier  <= 16'd0;
            for (k = 0; k < 8; k = k + 1) r1[k] <= 18'd0;
            for (k = 0; k < 4; k = k + 1) r2[k] <= 20'd0;
            for (k = 0; k < 2; k = k + 1) r3[k] <= 24'd0;
            produto <= 32'd0;
            v1 <= 1'b0; v2 <= 1'b0; v3 <= 1'b0; v4 <= 1'b0;
            done    <= 1'b0;
        end else begin
            mcand  <= a;
            mplier <= b;
            v1     <= start;

            for (k = 0; k < 8; k = k + 1) r1[k] <= soma1[k];
            v2 <= v1;

            for (k = 0; k < 4; k = k + 1) r2[k] <= soma2[k];
            v3 <= v2;

            for (k = 0; k < 2; k = k + 1) r3[k] <= soma3[k];
            v4 <= v3;

            produto <= soma4;
            done    <= v4;
        end
    end

endmodule

`default_nettype wire
