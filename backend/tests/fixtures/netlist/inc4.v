module inc4 (
  input  [3:0] d,
  output [3:0] q
);
  assign q = d + 4'd1;
endmodule
