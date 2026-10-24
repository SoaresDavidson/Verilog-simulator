// ---------------------------------------------------------------------------
// mult_array_pipe32.v - a MESMA arquitetura do mult_array_pipe.v, com todos os
//                       registradores intermediarios declarados com 32 bits.
//
// Este arquivo existe para UMA medicao, e so para ela: quanto custa declarar
// os nos intermediarios com a largura do resultado final em vez da largura que
// eles de fato precisam.
//
//                     dimensionado        32 bits      desperdicio
//   r1  (8 nos)       18 bits = 144      32 = 256          112
//   r2  (4 nos)       20 bits =  80      32 = 128           48
//   r3  (2 nos)       24 bits =  48      32 =  64           16
//                             ------          -----        ----
//                               272            448          176
//
// A pergunta que o experimento responde: o sintetizador PODA sozinho os bits
// altos, que sao provadamente sempre zero? Se podar, os dois arquivos dao a
// mesma area e a largura e so estilo. Se nao podar, sao 176 flip-flops de
// verdade, com area, potencia de relogio e fuga de verdade.
//
// Tudo o mais - a arvore, o rastreamento de validade, o protocolo, o reset -
// e identico ao mult_array_pipe.v, para que a unica variavel seja a largura.
// ---------------------------------------------------------------------------

`timescale 1ns / 1ps
`default_nettype none

module mult_array_pipe32 (
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
    reg [31:0] r1 [0:7];          // depois do nivel 1   8 x 32 = 256 FFs
    reg [31:0] r2 [0:3];          // depois do nivel 2   4 x 32 = 128 FFs
    reg [31:0] r3 [0:1];          // depois do nivel 3   2 x 32 =  64 FFs
                                  //                             ----
                                  //                             448 FFs

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
    wire [31:0] soma1 [0:7];

    genvar i;
    generate
        for (i = 0; i < 8; i = i + 1) begin : nivel1
            assign soma1[i] = {16'd0, (mcand & {16{mplier[2*i]}})}
                            + ({16'd0, (mcand & {16{mplier[2*i + 1]}})} << 1);
        end
    endgenerate

    // -----------------------------------------------------------------------
    // Combinacional do estagio 2: nivel 2.
    // r1[2k] tem origem 4k; r1[2k+1] tem origem 4k+2, logo entra << 2.
    // -----------------------------------------------------------------------
    wire [31:0] soma2 [0:3];
    generate
        for (i = 0; i < 4; i = i + 1) begin : nivel2
            assign soma2[i] = r1[2*i] + (r1[2*i + 1] << 2);
        end
    endgenerate

    // -----------------------------------------------------------------------
    // Combinacional do estagio 3: nivel 3.
    // r2[2m] tem origem 8m; r2[2m+1] tem origem 8m+4, logo entra << 4.
    // -----------------------------------------------------------------------
    wire [31:0] soma3 [0:1];
    generate
        for (i = 0; i < 2; i = i + 1) begin : nivel3
            assign soma3[i] = r2[2*i] + (r2[2*i + 1] << 4);
        end
    endgenerate

    // -----------------------------------------------------------------------
    // Combinacional do estagio 4: nivel 4, a soma final.
    // r3[0] tem origem 0; r3[1] tem origem 8, logo entra << 8.
    // -----------------------------------------------------------------------
    wire [31:0] soma4 = r3[0] + (r3[1] << 8);

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
            for (k = 0; k < 8; k = k + 1) r1[k] <= 32'd0;
            for (k = 0; k < 4; k = k + 1) r2[k] <= 32'd0;
            for (k = 0; k < 2; k = k + 1) r3[k] <= 32'd0;
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
