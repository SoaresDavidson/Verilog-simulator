// ---------------------------------------------------------------------------
// mult_array.v - multiplicador 16 x 16 -> 32 bits, combinacional
//
// Aula 6 da serie. Mesma conta do mult_shift_add.v, arquitetura oposta.
//
// O shift-add da aula 1 tem UM somador e o usa dezesseis vezes, um ciclo de
// clock por vez. Este tem QUINZE somadores e os usa todos de uma vez, no mesmo
// ciclo. E o outro extremo do compromisso PPA: muita area, pouco tempo.
//
//      1011   <- parcial 0 = a & b[0], deslocada 0
//     10110   <- parcial 1 = a & b[1], deslocada 1
//    000000   <- parcial 2 = a & b[2], deslocada 2  (b[2]=0 -> zeros)
//   1011000   <- parcial 3 = a & b[3], deslocada 3
//   -------
//   1000111   <- soma de todas
//
// As dezesseis parcelas existem SIMULTANEAMENTE, como fios. Nao ha estado, nao
// ha contador, nao ha laco: so uma montanha de logica entre a entrada e a
// saida. Toda a diferenca de area, de potencia e de velocidade entre esta aula
// e a aula 1 nasce dessa unica escolha.
//
// POR QUE UMA ARVORE, E NAO UMA CADEIA
// ------------------------------------
// Somar as dezesseis parcelas em cadeia - ((((p0+p1)+p2)+p3)+...) - poe quinze
// somadores EM SERIE no caminho critico. Funciona, e e devastadoramente lento.
// Somando aos pares, o mesmo numero de somadores fica com profundidade quatro:
//
//   nivel 0   p0 p1 p2 p3 p4 p5 p6 p7 p8 p9 p10 p11 p12 p13 p14 p15   (16)
//   nivel 1    \/    \/    \/    \/    \/    \/     \/      \/          (8)
//   nivel 2      \__/        \__/        \__/         \__/             (4)
//   nivel 3         \______/                \______/                   (2)
//   nivel 4               \______________/                             (1)
//
// Mesmos 15 somadores, mesma area, um quarto do atraso. Esta e a razao pela
// qual a soma esta escrita com um generate em quatro niveis e nao com um
// somatorio ingenuo: a ESTRUTURA da expressao vira a estrutura do silicio.
//
// LIMITACAO: numeros SEM SINAL, igual ao shift-add. Booth trata o sinal.
// ---------------------------------------------------------------------------

`timescale 1ns / 1ps
`default_nettype none

module mult_array (
    input  wire        clk,
    input  wire        rst_n,     // reset assincrono, ativo em nivel BAIXO
    input  wire        start,     // pulso de 1 ciclo: carrega a, b e comeca
    input  wire [15:0] a,         // multiplicando
    input  wire [15:0] b,         // multiplicador
    output reg  [31:0] produto,   // resultado - SO e valido quando done sobe
    output reg         done       // pulso de 1 ciclo, no ciclo final
);

    localparam N = 16;

    // A mesma maquina de estados de duas fases do shift-add. Mantida de
    // proposito: com o protocolo identico, o testbench das aulas 1 a 5 roda
    // sobre este modulo sem uma linha alterada, e a comparacao entre as duas
    // arquiteturas nao tem nenhuma variavel solta.
    localparam PARADO     = 1'b0;
    localparam CALCULANDO = 1'b1;

    reg        estado;
    reg [15:0] mcand;             // copia de 'a'
    reg [15:0] mplier;            // copia de 'b'

    // -----------------------------------------------------------------------
    // Nivel 0: as dezesseis parcelas
    //
    // parcial[i] = (a AND b[i]) deslocada de i casas.
    //
    // O AND com {16{b[i]}} e a multiplicacao por um bit: replica b[i] nas
    // dezesseis posicoes, de modo que a parcela vale 'a' quando b[i] e 1 e
    // vale zero quando b[i] e 0. Em silicio isso e literalmente uma fileira
    // de dezesseis portas AND de duas entradas - 256 delas no total.
    // -----------------------------------------------------------------------
    wire [31:0] parcial [0:N-1];

    genvar i;
    generate
        for (i = 0; i < N; i = i + 1) begin : parciais
            assign parcial[i] = {16'd0, (mcand & {16{mplier[i]}})} << i;
        end
    endgenerate

    // -----------------------------------------------------------------------
    // Niveis 1 a 4: a arvore de somadores
    //
    // Oito somadores no primeiro nivel, quatro no segundo, dois no terceiro,
    // um no quarto. 8+4+2+1 = 15 somadores de 32 bits, profundidade 4.
    //
    // Os vetores sao declarados com a largura maxima e so a parte usada de
    // cada nivel e conectada; o sintetizador descarta o resto, porque sao
    // fios sem carga. E mais legivel do que quatro declaracoes de larguras
    // diferentes.
    // -----------------------------------------------------------------------
    wire [31:0] nivel1 [0:7];
    wire [31:0] nivel2 [0:3];
    wire [31:0] nivel3 [0:1];
    wire [31:0] nivel4;

    generate
        for (i = 0; i < 8; i = i + 1) begin : soma1
            assign nivel1[i] = parcial[2*i] + parcial[2*i + 1];
        end
        for (i = 0; i < 4; i = i + 1) begin : soma2
            assign nivel2[i] = nivel1[2*i] + nivel1[2*i + 1];
        end
        for (i = 0; i < 2; i = i + 1) begin : soma3
            assign nivel3[i] = nivel2[2*i] + nivel2[2*i + 1];
        end
    endgenerate

    assign nivel4 = nivel3[0] + nivel3[1];

    // -----------------------------------------------------------------------
    // O circuito sequencial
    //
    // Duas fases, como no shift-add - mas a fase CALCULANDO acontece UMA vez.
    // Registrar as entradas em mcand/mplier antes de calcular nao e capricho:
    // e o que faz o caminho critico ir de registrador a registrador, dentro do
    // bloco. Se a arvore pendurasse direto nas portas 'a' e 'b', o atraso do
    // caminho dependeria do que ha FORA do modulo, e a analise de temporizacao
    // passaria a depender de uma suposicao (o input delay) em vez de um fato.
    // -----------------------------------------------------------------------
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            estado  <= PARADO;
            produto <= 32'd0;
            mcand   <= 16'd0;
            mplier  <= 16'd0;
            done    <= 1'b0;
        end else begin
            done <= 1'b0;

            case (estado)

                PARADO: begin
                    if (start) begin
                        mcand  <= a;
                        mplier <= b;
                        estado <= CALCULANDO;
                    end
                end

                // A arvore inteira cabe entre duas bordas de clock. Este e o
                // ciclo que a aula 6 mede, e o unico que existe.
                CALCULANDO: begin
                    produto <= nivel4;
                    done    <= 1'b1;
                    estado  <= PARADO;
                end

                default: estado <= PARADO;

            endcase
        end
    end

endmodule

`default_nettype wire
