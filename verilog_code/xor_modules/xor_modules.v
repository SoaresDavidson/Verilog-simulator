module and_gate (
    input  A,
    input  B,
    output Y
);
    assign Y = A & B;
endmodule

module or_gate (
    input  A,
    input  B,
    output Y
);
    assign Y = A | B;
endmodule

// XOR via AND/OR modules: A^B = (A | B) & ~(A & B)
module xor_ (
    input  A,
    input  B,
    output C
);
    wire and_out[1:0];
    wire or_out;

    and_gate u_and (.A(A), .B(~B), .Y(and_out[0]));
    and_gate u_and (.A(~A), .B(B), .Y(and_out[1]));
    or_gate  u_or  (.A(and_out[0]), .B(and_out[1]), .Y(or_out));

    assign C = or_out;
endmodule
