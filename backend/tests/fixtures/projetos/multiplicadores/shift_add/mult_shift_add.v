// ---------------------------------------------------------------------------
// mult_shift_add.v - multiplicador 16 x 16 -> 32 bits, sincrono
//
// Aula 1 da serie de multiplicadores. Implementa o algoritmo shift-add
// classico: o mesmo que se aprende na escola, em base 2 e um digito por ciclo.
//
//     1011   (multiplicando)
//   x 1101   (multiplicador)
//   ------
//     1011   <- bit 0 do multiplicador e 1: soma
//    0000    <- bit 1 e 0: nao soma
//   1011     <- bit 2 e 1: soma (deslocado)
//  1011      <- bit 3 e 1: soma (deslocado)
//
// A ideia central desta versao: em vez de somar tudo de uma vez (o que exigiria
// 16 somadores), somamos UMA parcela por ciclo de clock, reaproveitando um
// unico somador. Sao 16 ciclos para um resultado - o extremo "pouca area,
// muito tempo" do compromisso PPA. As proximas aulas andam na direcao oposta.
//
// TRUQUE DE IMPLEMENTACAO (vale entender, porque nao e obvio):
// o registrador 'produto' guarda as DUAS coisas ao mesmo tempo:
//
//     produto[31:16] = acumulador (a soma parcial)
//     produto[15:0]  = o que ainda sobra do multiplicador b
//
// A cada ciclo o conjunto inteiro desliza um bit para a direita. O acumulador
// desce sobre o espaco que o multiplicador vai liberando, e o bit do
// multiplicador que interessa no ciclo esta SEMPRE em produto[0].
// Consequencia: o somador precisa de 16 bits, nao de 32. Metade da area.
//
// LIMITACAO DESTA VERSAO: opera com numeros SEM SINAL. Multiplicacao com
// sinal aparece na aula sobre Booth.
// ---------------------------------------------------------------------------

`timescale 1ns / 1ps
`default_nettype none

module mult_shift_add (
    input  wire        clk,
    input  wire        rst_n,     // reset assincrono, ativo em nivel BAIXO
    input  wire        start,     // pulso de 1 ciclo: carrega a, b e comeca
    input  wire [15:0] a,         // multiplicando
    input  wire [15:0] b,         // multiplicador
    output reg  [31:0] produto,   // resultado - SO e valido quando done sobe
    output reg         done       // pulso de 1 ciclo, no ciclo final
);

    // -----------------------------------------------------------------------
    // Parametros
    // -----------------------------------------------------------------------
    localparam N = 16;            // largura dos operandos = numero de ciclos

    // Estados. Duas linhas de codigo, mas e uma maquina de estados de verdade:
    // e ela que faz deste um circuito de multiplos ciclos.
    localparam PARADO     = 1'b0;
    localparam CALCULANDO = 1'b1;

    // -----------------------------------------------------------------------
    // Registradores internos
    // -----------------------------------------------------------------------
    reg        estado;
    reg [15:0] mcand;             // copia de 'a', fixa durante toda a conta
    reg [4:0]  cont;              // 0..15 -> precisa de 5 bits, nao 4

    // -----------------------------------------------------------------------
    // O passo combinacional: a parcela deste ciclo
    //
    // 17 bits, nao 16: a soma de dois numeros de 16 bits pode produzir 17. Se
    // declarassemos 16, o vai-um seria descartado em silencio e o resultado
    // sairia errado so nos casos grandes - o erro mais dificil de achar.
    // -----------------------------------------------------------------------
    wire        bit_atual  = produto[0];
    wire [16:0] soma       = {1'b0, produto[31:16]} + {1'b0, mcand};
    wire [16:0] parte_alta = bit_atual ? soma : {1'b0, produto[31:16]};

    // -----------------------------------------------------------------------
    // O circuito sequencial
    // -----------------------------------------------------------------------
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            estado  <= PARADO;
            produto <= 32'd0;
            mcand   <= 16'd0;
            cont    <= 5'd0;
            done    <= 1'b0;
        end else begin
            // Valor padrao: done e um PULSO. Sem esta linha ele ficaria em 1
            // para sempre depois da primeira conta. A atribuicao dentro do
            // case, mais abaixo, sobrescreve esta quando for a hora.
            done <= 1'b0;

            case (estado)

                // -----------------------------------------------------------
                // Parado: espera o start e carrega os operandos.
                //
                // produto recebe {16 zeros, b}: o acumulador comeca zerado e o
                // multiplicador ocupa a metade de baixo, pronto para ser
                // consumido bit a bit por produto[0].
                // -----------------------------------------------------------
                PARADO: begin
                    if (start) begin
                        produto <= {16'd0, b};
                        mcand   <= a;
                        cont    <= 5'd0;
                        estado  <= CALCULANDO;
                    end
                end

                // -----------------------------------------------------------
                // Calculando: um passo do algoritmo por ciclo.
                //
                // O deslizamento e a concatenacao abaixo: 17 bits da parte
                // alta (ja com o vai-um no topo) seguidos dos 15 bits que
                // sobram da parte baixa. 17 + 15 = 32.
                //
                // Um start que chegue aqui e ignorado de proposito: a conta em
                // andamento nao e interrompida.
                // -----------------------------------------------------------
                CALCULANDO: begin
                    produto <= {parte_alta, produto[15:1]};
                    cont    <= cont + 5'd1;

                    if (cont == N-1) begin
                        estado <= PARADO;
                        done   <= 1'b1;
                    end
                end

                default: estado <= PARADO;

            endcase
        end
    end

endmodule

`default_nettype wire
