module cpu (
  input        clk,
  input  [3:0] a,
  input  [3:0] b,
  output [3:0] result,
  output       zero,
  output [3:0] konst,
  inout        bus_z
);
  wire [3:0] alu_y;
  alu #(.WIDTH(4)) u_alu (.a(a), .b(b), .op(2'b01), .y(alu_y), .zero(zero));
  inc4 u_inc (.d(alu_y), .q(result));
  assign konst = 4'b10x0;
  assign bus_z = 1'bz;
endmodule
