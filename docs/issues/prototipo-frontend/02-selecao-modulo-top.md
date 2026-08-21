## Título

Selecionar módulo top para síntese

## Labels sugeridas

`frontend`, `feature`, `prioridade:alta`

## Contexto

No protótipo, após o upload, a tela de Seleção exibe a árvore de arquivos do
projeto e uma lista de rádio com os arquivos de `src/` para o usuário
escolher qual módulo é o topo do design. O botão "Iniciar Síntese" só é
habilitado depois que um módulo top é escolhido.

A issue #22 (fluxo de síntese) descreve o cliente para
`POST /api/v1/verilog/mapear-processador`, mas não especifica como o módulo
top é informado nem cobre a interface de escolha. Esta issue cobre
especificamente essa lacuna: a UI de seleção e o envio do módulo escolhido
na requisição de síntese.

## Objetivo

Permitir que o usuário escolha explicitamente o módulo raiz do design antes
de iniciar a síntese, evitando depender apenas da inferência automática do
Yosys (`hierarchy -auto-top`, ver #20).

## Requisitos relacionados

- `RF04 - Mapear hardware`
- `RN05 - Pré-condição do mapeamento`

## Etapas de implementação

- Listar apenas arquivos-fonte (excluir testbenches) como candidatos a
  módulo top.
- Implementar seleção única (radio) com o caminho do arquivo como valor.
- Manter botão de síntese desabilitado até um módulo ser selecionado.
- Persistir o módulo escolhido no estado da sessão e reenviar corretamente
  se o usuário voltar e trocar a seleção antes de sintetizar novamente.
- Incluir o módulo selecionado no corpo da requisição de síntese (alinhar
  com o contrato definido em #22/#20; se a API atual não aceitar esse
  campo, registrar a lacuna de contrato como bloqueio para o backend).
- Exibir claramente qual módulo foi usado como top após a síntese concluir
  (ex.: no cabeçalho do diagrama de caminho de dados, issue 4 deste
  conjunto).

## Critérios de aceite

- [ ] Apenas arquivos de código-fonte aparecem como opção de módulo top.
- [ ] Botão de síntese permanece desabilitado sem seleção de módulo.
- [ ] Módulo selecionado é enviado corretamente na requisição de síntese.
- [ ] Trocar a seleção antes de sintetizar atualiza o valor enviado.
- [ ] Resultado da síntese exibe qual módulo foi tratado como top.
- [ ] Testes cobrem: nenhuma seleção, seleção única, troca de seleção antes
      do envio.
- [ ] `npm run build` e `npm run lint` passam.

## Dependências

- #22 para o cliente de síntese existente.
- Confirmar com o backend se `POST /api/v1/verilog/mapear-processador`
  aceita módulo top explícito; caso não aceite, esta issue inclui abrir
  uma issue de backend complementar.
