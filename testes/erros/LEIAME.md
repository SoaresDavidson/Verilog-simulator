# ZIPs de erro do Verilog Simulator

Cada ZIP provoca um caso de erro (ou de borda) numa etapa. O resultado abaixo foi conferido contra a API real (`main`, commit 5ba50d2).

## Etapa 1: upload

| ZIP | Resultado na API |
|---|---|
| u01-nao-e-zip | 400 INVALID_UPLOAD: não é um ZIP válido ou está corrompido |
| u02-zip-vazio | 400 INVALID_UPLOAD: o arquivo ZIP está vazio |
| u03-sem-verilog | 400 INVALID_UPLOAD: nenhum arquivo .v ou .sv |
| u04-caminho-com-ponto-ponto | 400 INVALID_UPLOAD: caminhos fora da pasta do projeto (`../fora.v`) |
| u05-caminho-absoluto | 400 INVALID_UPLOAD: caminhos fora da pasta do projeto (`/tmp/absoluto.v`) |
| u06-muitos-arquivos | 413 UPLOAD_TOO_LARGE: mais de 500 arquivos |
| u07-pastas-profundas | 400 INVALID_UPLOAD: mais de 8 níveis de pastas |
| u08-zip-bomb | 400 INVALID_UPLOAD: taxa de compressão suspeita (5 MB de espaços num .v) |
| u09-caminho-longo | 400 INVALID_UPLOAD: caminho com mais de 255 caracteres |
| u10-caractere-invalido | 400 INVALID_UPLOAD: caractere inválido no nome (`soma:dor.v`) |
| u11-arquivos-duplicados | 400 INVALID_UPLOAD: arquivos duplicados |
| u12-maior-que-10mb | 413 UPLOAD_TOO_LARGE: acima de 10 MB |
| u13-protegido-por-senha | 400 INVALID_UPLOAD: corrompido, protegido por senha ou formato não suportado |

Alguns destes o navegador barra antes de enviar: u01, u02, u03, u04, u05 e u12. Para ver a resposta do backend nesses casos, envie com `curl -F file=@<zip> http://localhost:8000/api/v1/verilog/upload-projeto-zip`.

## Etapa 2: síntese

| ZIP | Resultado na API |
|---|---|
| s01-erro-de-sintaxe | síntese `success: false`, "syntax error, unexpected TOK_ENDMODULE" |
| s02-so-testbench | 404 NO_VERILOG_SOURCES: só há testbench, nada sintetizável |
| s03-modulo-inexistente | síntese `success: true` (o Yosys trata o módulo que falta como caixa-preta); a simulação falha |
| s04-hierarquia-para-escolher-top | sucesso, top `cpu`; serve para testar a escolha de `alu` ou `regfile` como top |

## Etapa 4: simulação

| ZIP | Resultado na API |
|---|---|
| m01-erro-no-testbench | simulação `success: false` (erro de compilação no iverilog) |
| m02-sem-vcd | simulação `success: true`, sem VCD: não há formas de onda |
| m03-loop-infinito | 408 ICARUS_TIMEOUT depois de 30 s (testbench sem `$finish`) |
| m04-fatal | simulação `success: false` (`$fatal` no testbench) |
| m05-estouro-de-memoria | 422 RESOURCE_LIMIT_EXCEEDED: passou de 512 MB |
| m06-vcd-truncado | simulação `success: true`, VCD truncado (`max_timestamps`, mais de 50 mil instantes) |
| m07-sem-testbench | simulação `success: true`, sem VCD (só o design, nada a executar) |
