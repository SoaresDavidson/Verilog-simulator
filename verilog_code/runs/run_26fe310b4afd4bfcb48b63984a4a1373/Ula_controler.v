`timescale 1ns/1ps

// fazer modificacoes para multiplicacao

module ULA_controler(
    input   wire rst,
    input   wire [1:0] ula_op,
    input   wire [6:0] funct7,
    input   wire [2:0] funct3,

    output  reg [3:0] operation,
    output  reg err
);

always @(*) begin
    if (rst) begin
        operation <= 4'b0000;
    end else begin
	     operation <= 4'b0000;
		  err <= 1'b0; 
        case (ula_op) 
            2'b00: operation <= 4'b0000; // ADD
            2'b01: operation <= 4'b0001; // SUB
            2'b10: begin                 // R-type
                case (funct3)
                    3'b000: begin                                               // funct3 = 0
                            if (funct7 == 7'b0100000) begin     
                                operation <= 4'b0001;                             // SUB 1
                            end else begin                              
                                operation <= 4'b0000;                             // ADD 0
                            end
                    end

                    3'b100: operation <= 4'b0010;                                 // funct3 = 4    XOR 2
                    3'b110: operation <= 4'b0011;                                 // funct3 = 6    OR 3 
                    3'b111: operation <= 4'b0100;                                 // funct3 = 7    AND 4 

                    3'b001: begin                                              // funct3 = 1
                        if (funct7 == 7'b0) begin
                            operation <= 4'b0101;  
                            err <= 1'b0;                               // SHIFT LEFT LOGICAL 5
                        end else begin
                            err <= 1'b1;
                        end   
                    end

                    3'b101: begin                                              // funct3 = 5
                        if (funct7 == 7'b0100000) begin
                            operation <= 4'b0111;                                 // SHIFT RIGHT ARITH 7
                        end else begin
                            operation <= 4'b0110;                                 // SHIFT RIGHT LOGICAL 6
                        end
                    end

                    3'b010: operation <= 4'b1000;                                    //  funct3 = 2     SET LESS THEN 8  

                    3'b011: operation <= 4'b1001;                                           // funct3 = 3    SET LESS THEN UNSIGNED 9
                endcase
            end
            default: operation <= 4'b0000;
        endcase
    end
end

endmodule