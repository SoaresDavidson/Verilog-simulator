module alu #(parameter WIDTH = 4) (
  input  [WIDTH-1:0] a,
  input  [WIDTH-1:0] b,
  input  [1:0]       op,
  output [WIDTH-1:0] y,
  output             zero
);
  wire [WIDTH-1:0] sum  = a + b;
  wire [WIDTH-1:0] diff = a - b;
  assign y    = op[0] ? diff : sum;
  assign zero = (y == {WIDTH{1'b0}});
endmodule
