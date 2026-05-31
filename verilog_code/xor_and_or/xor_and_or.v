// XOR via AND/OR: A^B = (A | B) & ~(A & B)
module xor_ (
    input  A,
    input  B,
    output C
);
    assign C = (A | B) & ~(A & B);
endmodule
