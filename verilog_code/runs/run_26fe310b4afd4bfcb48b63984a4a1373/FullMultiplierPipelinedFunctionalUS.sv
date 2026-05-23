`timescale 1ns/1ps

module Encoder_Radix_4(
    input  wire [2:0] yi,
    output wire       neg,
    output wire       mul_2x,
    output wire       mul_1x
);

    assign neg    = yi[2];
    assign mul_2x = ( yi[2] & ~yi[1] & ~yi[0] ) |
                    ( ~yi[2] &  yi[1] &  yi[0] );
    assign mul_1x = yi[1] ^ yi[0];

endmodule
module Single_Bit_Decoder(
  input  wire [1:0] yi,
  input  wire       mul_1x,
  input  wire       mul_2x,
  input  wire       neg,
  output reg        partial     
);
    always @(*) begin
    if (mul_1x & ~mul_2x) begin
      partial = yi[1];
    end
    else if (~mul_1x & mul_2x) begin
      partial = yi[0];
    end
    else begin
      partial = 0;
    end

      partial = neg ^ partial;
  end
endmodule
module Zerar(
  input wire A,
  output wire B);
  assign B = A;
endmodule

module MSBDecider (
  input wire y,
  input wire mul_1x,
  input wire mul_2x,
  input wire neg,
  input wire nosignal,
  output reg partial
);
  
  always @(*) begin
    if (nosignal && y) begin
      partial = ~neg & ~mul_1x & mul_2x | (neg & ~mul_2x);
    end
    else begin
      partial = neg ^ (y & (mul_1x | mul_2x));
    end
  end
endmodule

module EXTDecider (
  input wire msb,
  input wire y,
  input wire nosignal,
  input wire neg,
  output reg extension
);
  always @(*) begin
    if (nosignal && y && ~neg) begin
      extension = 0;
    end
    else if (nosignal && y && neg) begin
      extension = 1;
    end
    else begin
      extension = msb;
    end
  end
endmodule

module Decoder_64 (
    input  wire [31:0] y,
    input  wire        mul_1x,
    input  wire        mul_2x,
    input  wire        neg,
  	input  wire        nosignal,
  	output reg  [63:0] partial,
  output wire [63:0] partial_ext
);
  wire [63:0] partial_int;
  	wire temp = 0;
  	wire [32:0] y33;
  	assign y33 = {y, temp};

    genvar i;
    generate
      for (i = 0; i < 64; i = i + 1) begin : decoders
        if (i < 32) begin
            Single_Bit_Decoder sbd (
                .yi      ( y33[i+1 : i] ),
                .mul_1x  ( mul_1x ),
                .mul_2x  ( mul_2x ),
                .neg     ( neg ),
                .partial ( partial_int[i] )
            );
        end 
        else if (i == 32) begin
             //Single_Bit_Decoder msb (
             //  .yi      ( {y33[32],y33[32]} ),
             //   .mul_1x  ( mul_1x ),
             //   .mul_2x  ( mul_2x ),
             //   .neg     ( neg ),
             //   .partial ( partial_int[i] )
            //);
         MSBDecider most(
            .y(y[31]),
            .mul_1x(mul_1x),
            .mul_2x(mul_2x),
            .neg(neg),
            .nosignal(nosignal),
            .partial(partial_int[i])
          );
        end
        else begin
          EXTDecider ext(
            .msb(partial_int[32]),
            .y(y[31]),
            .nosignal(nosignal),
            .neg(neg),
            .extension(partial_int[i])
          );
        end
    end
    endgenerate

    always @(*) begin
      if (neg)// && (mul_1x || mul_2x)
            partial = partial_int + 1;
        else
            partial = partial_int;
    end
            assign partial_ext = partial;
endmodule
  

module Compressor4_2(
  input wire A,
  input wire B,
  input wire C,
  input wire D,
  input wire Cin,
  output wire Cout,
  output wire Carry,
  output wire S
);
 
    assign S = A ^ B ^ C ^ D ^ Cin;
    assign Carry = (A ^ B ^ C ^ D) & Cin | (~(A ^ B ^ C ^ D) & D); //alterado
    assign Cout = (A ^ B) & C | (A & B);
 
endmodule

module Gambiarra(
  input wire A,
  input wire B,
  output wire C,
  output wire D
);
  assign C = A;
  assign D = B;
endmodule

module PP4Adder(
  input wire [63:0] A,
  input wire [63:0] B,
  input wire [63:0] C,
  input wire [63:0] D,
  output wire [63:0] P_low,
  output reg [63:0] P_high
);
  
  wire zero;
  assign zero = 0;
  wire [64:0] carries;
  wire [64:0] carryouts;
  assign carries[0] = 0;
  assign carryouts[0] = 0;
  wire [63:0] B_shifted;
  wire [63:0] C_shifted;
  wire [63:0] D_shifted;
  //assign B_shifted = {B[61:0], 2'b00};
  //assign C_shifted = {C[59:0], 4'b0000};
  //assign D_shifted = {D[57:0], 6'b000000};
  assign B_shifted = B;
  assign C_shifted = C;
  assign D_shifted = D;
  
  genvar i;
  generate
    
    for (i = 0; i < 64; i = i + 1) begin : sum
                Compressor4_2 compressor (
                  .A(B_shifted[i]),
                  .B(C_shifted[i]),
                  .C(D_shifted[i]),
               .D(carryouts[i]),
               .Cin(carries[i]),
                  .Cout(carries[i+1]),
                  .Carry(carryouts[i+1]),
               .S(P_low[i])
          );
          Zerar zera(
            .A(A[i]),
            .B(P_high[i])
           );

    end
  endgenerate
endmodule

module PP2Adder (
  input wire [63:0] A,
  input wire [63:0] B,
  output reg [63:0] S
);
  always @(*) begin
    S = A + B;
  end
endmodule

module MulSignalRegister(
  input wire Clk,
  input wire Reset,
  input wire [1:0] in_funct3, 
  input wire [4:0] in_Rd,
  input wire [15:0] in_1x,
  input wire [15:0] in_2x,
  input wire [15:0] in_neg,
  input wire [31:0] in_op,
  output reg [1:0] out_funct3,
  output reg [15:0] mul_1x,
  output reg [15:0] mul_2x,
  output reg [15:0] neg,
  output reg [31:0] op,
	output reg [4:0] Rd
);
  
  always @(posedge Clk or posedge Reset) begin
    if (Reset == 1) begin
      mul_1x <= 16'b0;
      mul_2x <= 16'b0;
      neg <= 16'b0;
      op <= 32'b0;
	Rd <= 5'b0;
     out_funct3 <= 2'b0;
    end
    
    else begin
      mul_1x <= in_1x;
      mul_2x <= in_2x;
      neg <= in_neg;
      op <= in_op;
	Rd <= in_Rd;
      out_funct3 <= in_funct3;
    end
  end
endmodule
  module PPRegister(
  input wire Clk,
  input wire Reset,
  input wire [63:0] in_op,
  input wire [1:0] in_funct3,
  input wire [4:0] in_Rd,
  input wire [63:0] in_pp [0:15],
  output reg [1:0] out_funct3,
  output reg [63:0] pp [0:15],
  output reg [4:0] Rd,
  output reg [63:0] pp_op
);
  
  integer i;
  
  always @(posedge Clk or posedge Reset) begin
    if (Reset) begin
     for (i = 0; i < 16; i = i + 1)
        pp[i] <= 64'b0;
      Rd <= 5'b0;
      out_funct3 <= 2'b0;
      pp_op <= 64'b0;
    end
    
    else begin
      for (i = 0; i < 16; i = i + 1)
        pp[i] <= in_pp[i];
      Rd <= in_Rd;
      out_funct3 <= in_funct3;
      pp_op <= in_op;
    end
  end
endmodule
      module FirstBlockRegister (
  input wire Clk,
  input wire Reset,
        input wire [63:0] pp_op,
  input wire [1:0] in_funct3,
  input wire [4:0] in_Rd,
  input wire [63:0] in_first [7:0],
  output reg [1:0] out_funct3,
  output reg [63:0] first [7:0],
        output reg [4:0] Rd,
        output reg [63:0] first_op
);
  
  integer i;
  
  always @(posedge Clk or posedge Reset) begin
    if (Reset == 1) begin
      Rd <= 5'b0;
      out_funct3 <= 2'b0;
      first_op <= 64'b0;
      for (i = 0; i < 8; i= i + 1) 
        first[i] <= 64'b0;
    end
    
    else begin
      Rd <= in_Rd;
      out_funct3 <= in_funct3;
      first_op <= pp_op;
      for (i = 0; i < 8; i= i + 1) 
        first[i] <= in_first[i];
    end
  end
endmodule
module SecondBlockRegister (
  input wire Clk,
  input wire Reset,
  input wire [63:0] first_op,
  input wire [1:0] in_funct3,
  input wire [4:0] in_Rd,
  input wire [63:0] in_second [3:0],
  output reg [1:0] out_funct3,
  output reg [63:0] second [3:0],
  output reg [4:0] Rd,
  output reg [63:0] second_op
);
  
  integer i;
  
  always @(posedge Clk or posedge Reset) begin
    if (Reset == 1) begin
      Rd <= 5'b0;
      out_funct3 <= 2'b0;
      second_op <= 64'b0;
      for (i = 0; i < 4; i= i + 1) 
        second[i] <= 64'b0;
    end
    
    else begin
      Rd <= in_Rd;
      out_funct3 <= in_funct3;
      second_op <= first_op;
      for (i = 0; i < 4; i= i + 1) 
        second[i] <= in_second[i];
    end
  end
endmodule
module ThirdBlockRegister (
  input wire Clk,
  input wire Reset,
  input wire [63:0] second_op,
  input wire [1:0] in_funct3,
  input wire [4:0] in_Rd,
  input wire [63:0] in_third [1:0],
  output reg [1:0] out_funct3,
  output reg [63:0] third [1:0],
  output reg [4:0] Rd,
  output reg [63:0] third_op
);
  
  integer i;
  
  always @(posedge Clk or posedge Reset) begin
    if (Reset == 1) begin
      Rd <= 5'b0;
      out_funct3 <= 2'b0;
      third_op <= 64'b0;
      for (i = 0; i < 2; i= i + 1) 
        third[i] <= 64'b0;
    end
    
    else begin
      Rd <= in_Rd;
      out_funct3 <= in_funct3;
      third_op <= second_op;
      for (i = 0; i < 2; i= i + 1) 
        third[i] <= in_third[i];
    end
  end
endmodule
module ResultBlockRegister (
  input wire Clk,
  input wire Reset,
  input wire [63:0] third_op,
  input wire [1:0] in_funct3,
  input wire [4:0] in_Rd,
  input wire [63:0] in_res,
  output reg [1:0] out_funct3,
  output reg [63:0] res,
  output reg [4:0] Rd,
  output reg [63:0] almost_op
);
 

  always @(posedge Clk or posedge Reset) begin
    if (Reset == 1) begin
      Rd <= 5'b0;
      res <= 64'b0;
      almost_op <= 64'b0;
      out_funct3 <= in_funct3;
    end
    
    else begin
      Rd <= in_Rd;
      res <= in_res;
      out_funct3 <= in_funct3;
      almost_op <= third_op;
    end
  end
endmodule

module MulPipelined32Bits (
  input wire Clk,
  input wire Reset,
  input wire mul,
  input wire [1:0] funct3,
  input wire [31:0] A,
  input wire [31:0] B,
  input wire [4:0] Rd,
  output reg [2:0] counter,
  output reg [31:0] regularS,
  output reg [31:0] unsignedS,
  output reg [63:0] tempS,
  output reg [63:0] tempU
);
  
  always @(posedge Clk or posedge Reset) begin
    if (Reset) begin
      counter <= 3'b0;
    end 
	 else if (mul == 1'b0 || (counter == 3'b110 && funct3[1] == 1'b0)) begin
		counter <= 3'b0;
	end
    else begin
      counter <= counter + 1;
    end
  end
      
    wire [15:0] mul_1x, mul_2x, neg;
  wire [15:0] mul_1x_pre, mul_2x_pre, neg_pre;
  wire [31:0] op;
  wire [4:0] signal_rd;
        wire [1:0] signal_funct3;
  wire temp;
  assign temp = 0;
  genvar i;
  generate
    //1º Estágio: Geração dos sinais 
    for (i = 0; i < 16; i= i + 1) begin : signals
      if (i == 0) begin
        Encoder_Radix_4 encoder(
          .yi({B[1:0], temp}),
          .neg(neg_pre[i]),
          .mul_2x(mul_2x_pre[i]),
          .mul_1x(mul_1x_pre[i])
        );
      end
      
      else begin
        Encoder_Radix_4 encoder(
          .yi(B[2*i+1:2*i-1]),
          .neg(neg_pre[i]),
          .mul_2x(mul_2x_pre[i]),
          .mul_1x(mul_1x_pre[i])
               );
      end
    end
  endgenerate
  
      MulSignalRegister signalreg (
      .Clk(Clk),
      .Reset(Reset),
      .in_funct3(funct3),
      .in_Rd(Rd),
      .in_1x(mul_1x_pre),
      .in_2x(mul_2x_pre),
      .in_neg(neg_pre),
      .in_op(A),
      .out_funct3(signal_funct3),
      .mul_1x(mul_1x),
      .mul_2x(mul_2x),
      .neg(neg),
      .op(op),
        .Rd(signal_rd)
    );
  
  wire [63:0] partialUnused [15:0];
  wire [63:0] partials [15:0];
  genvar j;
  generate
    //2º Estágio: Geração dos produtos parciais
    for (j = 0; j < 16; j= j + 1) begin : pps
      Decoder_64 decoder (
        .y(op),
        .mul_1x(mul_1x[j]),
        .mul_2x(mul_2x[j]),
        .neg(neg[j]),
        .nosignal(funct3[1] & funct3[0]),
        .partial(partialUnused[j]),
        .partial_ext(partials[j])
      );
    end
  endgenerate
  
  wire [63:0] pp_shifted [15:0];
  wire [63:0] shifted_extra;
  assign pp_shifted[0] = partials[0];
  assign pp_shifted[1] = {partials[1][61:0], 2'b0};
  assign pp_shifted[2] = {partials[2][59:0], 4'b0};
  assign pp_shifted[3] = {partials[3][57:0], 6'b0};
  assign pp_shifted[4] = {partials[4][55:0], 8'b0};
  assign pp_shifted[5] = {partials[5][53:0], 10'b0};
  assign pp_shifted[6] = {partials[6][51:0], 12'b0};
  assign pp_shifted[7] = {partials[7][49:0], 14'b0};
  assign pp_shifted[8] = {partials[8][47:0], 16'b0};
  assign pp_shifted[9] = {partials[9][45:0], 18'b0};
  assign pp_shifted[10] = {partials[10][43:0], 20'b0};
  assign pp_shifted[11] = {partials[11][41:0], 22'b0};
  assign pp_shifted[12] = {partials[12][39:0], 24'b0};
  assign pp_shifted[13] = {partials[13][37:0], 26'b0};
  assign pp_shifted[14] = {partials[14][35:0], 28'b0};
  assign pp_shifted[15] = {partials[15][33:0], 30'b0};
  assign shifted_extra = {op, 32'b0};
  
  wire [63:0] pp_def [15:0];
  wire [4:0] pp_rd;
        wire [1:0] pp_funct3;
  wire [63:0] pp_op;
  
  PPRegister ppreg (
    .Clk(Clk),
    .Reset(Reset),
    .in_op(shifted_extra),
    .in_funct3(signal_funct3),
    .in_Rd(signal_rd),
    .in_pp(pp_shifted),
    .out_funct3(pp_funct3),
    .pp(pp_def),
    .Rd(pp_rd),
    .pp_op(pp_op)
  );
  
  wire [4:0] first_rd;
        wire [1:0] first_funct3;
  wire [63:0] Firstpre [7:0];
  wire [63:0] First [7:0];
  wire [63:0] first_op;
  genvar k;
  generate
    //3º Estágio: Primeiro bloco de somas (4 adder)
    for (k = 0; k < 4; k= k+1) begin : first_level
      PP4Adder firstAdder (
        .A(pp_def[k*4]),
        .B(pp_def[k*4+1]),
        .C(pp_def[k*4+2]),
        .D(pp_def[k*4+3]),
        .P_low(Firstpre[k*2]),
        .P_high(Firstpre[k*2+1])
      );
    end
  endgenerate
  
  FirstBlockRegister firstreg (
    .Clk(Clk),
    .Reset(Reset),
    .pp_op(pp_op),
    .in_funct3(pp_funct3),
    .in_Rd(pp_rd),
    .in_first(Firstpre),
    .out_funct3(first_funct3),
    .first(First),
    .Rd(first_rd),
    .first_op(first_op)
  );
  
  wire [4:0] second_rd;
        wire [1:0] second_funct3;
  wire [63:0] Secondpre [3:0];
  wire [63:0] Second [3:0];
  wire [63:0] second_op;
  
  genvar l;
  generate
    //4º Estágio: Segundo bloco de somas (2 adder)
    for (l = 0; l < 4; l=l+1) begin : second_level
      PP2Adder secondAdder (
        .A(First[l*2]),
        .B(First[l*2+1]),
        .S(Secondpre[l])
      );
    end
  endgenerate
  
  SecondBlockRegister secondreg (
    .Clk(Clk),
    .Reset(Reset),
    .first_op(first_op),
    .in_funct3(first_funct3),
    .in_Rd(first_rd),
    .in_second(Secondpre),
    .out_funct3(second_funct3),
    .second(Second),
    .Rd(second_rd),
    .second_op(second_op)
  );
  
  wire [4:0] third_rd;
        wire [1:0] third_funct3;
  wire [63:0] Thirdpre [1:0];
  wire [63:0] Third [1:0];
  wire [63:0] third_op;
    //5º Estágio: Terceiro bloco de soma (4 adder)
  PP4Adder third_level (
    .A(Second[0]),
    .B(Second[1]),
    .C(Second[2]),
    .D(Second[3]),
    .P_low(Thirdpre[0]),
    .P_high(Thirdpre[1])
  );
  
  ThirdBlockRegister thirdreg(
  	.Clk(Clk),
    .Reset(Reset),
    .second_op(second_op),
    .in_funct3(second_funct3),
    .in_Rd(second_rd),
    .in_third(Thirdpre),
    .out_funct3(third_funct3),
    .third(Third),
    .Rd(third_rd),
    .third_op(third_op)
);
  
        //6º Estágio (Último para mul com sinal): Quarto bloco de soma (4 adder)
  wire [4:0] fourth_rd;
        wire [1:0] fourth_funct3;
  wire [63:0] preResult;
  PP2Adder fourth_level (
    .A(Third[0]),
    .B(Third[1]),
    .S(preResult)
  );
  
  wire [63:0] preS;
  wire [63:0] pre_op;
  ResultBlockRegister lastreg (
    .Clk(Clk),
    .Reset(Reset),
    .third_op(third_op),
    .in_funct3(third_funct3),
    .in_Rd(third_rd),
    .in_res(preResult),
    .out_funct3(fourth_funct3),
    .res(preS),
    .Rd(fourth_rd),
    .almost_op(pre_op)
  );
  
  always @(*) begin
    if (fourth_funct3 == 2'b01) begin
      regularS = preS[63:32];
    end
    else if (fourth_funct3 == 2'b00) begin
        regularS = preS[31:0];
    end
    else begin
      regularS = 0;
    end
  end
  
        //7º Estágio (Com sinal): Quinto bloco de soma com produto parcial, caso B tenha MSB = 1
  
        wire [4:0] fifth_rd;
        wire [1:0] fifth_funct3;
        wire [63:0] mulRes;
        wire [63:0] preUnsigned;
  wire [63:0] real_op;
   
        PP2Adder fifth_level (
          .A(preS),
          .B(pre_op),
          .S(preUnsigned)
        );
        
        ResultBlockRegister unsignedRes (
              .Clk(Clk),
    .Reset(Reset),
          .third_op(pre_op),
          .in_funct3(fourth_funct3),
          .in_Rd(fourth_rd),
          .in_res(preUnsigned),
          .out_funct3(fifth_funct3),
          .res(mulRes),
          .Rd(fifth_rd),
          .almost_op(real_op)
        );
        
   always @(*) begin
     tempS = preS;
     if (B[31]) begin
     	unsignedS = mulRes[63:32];
       tempU = mulRes;
     end
     
     else begin
       unsignedS = preS[63:32];
       tempU = 0;
     end
   end
       
endmodule
  
    
    
  
  