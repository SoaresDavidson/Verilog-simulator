`timescale 1ns/1ps

module PC (
  input wire Clk,
  input wire Reset,
  input wire [31:0] IFID_pc,
  input wire [31:0] btb_predicted_address,
  input wire btb_predicted,
  input wire branch,
  input wire IFIDpredicted,
  input wire Jump,
  input wire Enable,
  input wire PCWrite,
  input wire [31:0] Target,
  output reg [31:0] pc
);



  always @(posedge Clk or posedge Reset) begin
    if (Reset == 1) begin
      pc <= 32'b0;
    end
    else if (Enable == 1 && PCWrite == 1) begin
      if (btb_predicted == 1) begin
        pc <= btb_predicted_address;
      end else if (Jump == 1 && Target != pc) begin
        pc <= Target;
      end else if (IFIDpredicted == 1 && Jump == 0) begin
          pc <= IFID_pc + 4;
        end else begin
          pc <= pc + 4;
        end
      end
  end
endmodule
    
      

