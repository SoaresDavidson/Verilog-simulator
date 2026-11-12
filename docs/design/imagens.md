# Imagens do Verilog Classroom

Briefs para gerar as ilustrações no ChatGPT. Cada imagem tem um encaixe pronto no app: basta salvar o
arquivo com o nome indicado em `frontend/public/assets/img/` e ela substitui o desenho provisório em
SVG. Enquanto o arquivo não existir, o app mostra o provisório.

Formato de entrega: **WebP com fundo transparente** (peça PNG transparente ao ChatGPT e converta, por
exemplo em squoosh.app). Nomes em minúsculas, exatamente como abaixo.

## Estilo comum (cole no início de TODO prompt)

> Ilustração vetorial plana em estilo adesivo (sticker), para a interface de um app educacional de
> eletrônica digital. Contorno grosso e uniforme na cor roxo-tinta #1A1238, com cantos e pontas
> arredondados, espessura igual em todos os objetos. Preenchimentos chapados, sem degradê, sem
> textura, sem brilho, sem sombra projetada. Paleta fechada, use somente estas cores: amarelo
> #FFD23F (cor principal dos objetos), rosa #E11D5B (detalhes de ação), verde #0FB66B (sinal em 1),
> azul #3D6BFF (sinal em 0), lavanda claro #F1EEFB, branco #FFFFFF e roxo-tinta #1A1238. Formas
> geométricas simples e amigáveis, levemente inclinadas (3 a 6 graus) para dar movimento. Sem texto,
> sem letras, sem números, sem marcas, sem pessoas, sem mãos. Fundo 100% transparente. Composição
> centralizada com margem livre de 8% em volta.

Regras para manter a família:

- Gere a imagem 2 (os quatro passos) primeiro. Nas seguintes, anexe a imagem 2 e escreva "mesmo
  estilo, mesmo contorno e mesma paleta desta referência".
- Portas lógicas são sempre amarelas com contorno roxo-tinta. Fio verde carrega 1, fio azul carrega 0.
  Não use verde ou azul em mais nada.
- Se sair degradê, sombra, texto ou cor fora da paleta, peça: "refaça sem degradê, sem sombra, sem
  texto, somente as cores da lista".

## 1. Logo e ícone do app (uma imagem com 4 variações)

Arquivo: `logo-folha.png` (só para escolha; a versão escolhida eu redesenho em SVG).
Tamanho: 2048 x 2048, grade 2 x 2.

> [estilo comum] Folha com quatro variações de um símbolo de marca, em grade 2 por 2, cada uma dentro
> de um quadrado amarelo #FFD23F de cantos bem arredondados. Em todas, o desenho interno é roxo-tinta
> #1A1238 e representa uma porta lógica AND (forma de letra D: lado esquerdo reto, lado direito em
> semicírculo) com dois fios curtos entrando pela esquerda e um fio saindo pela direita.
> Variação 1: a porta AND simples e sólida. Variação 2: a mesma porta com o fio de saída em verde
> #0FB66B terminando numa bolinha. Variação 3: a porta AND com um sinal de onda quadrada recortado em
> negativo dentro dela. Variação 4: a porta AND formada pelo sinal de "menor que" e "maior que" de
> código (< >) encaixados. Símbolos grandes, legíveis em 32 pixels, sem nenhum texto.

## 2. Os quatro passos (uma imagem, 4 cenas, depois recortar)

Arquivos após recortar: `passo-1-codigo.webp`, `passo-2-portas.webp`, `passo-3-circuito.webp`,
`passo-4-sinais.webp`. Tamanho da folha: 2048 x 2048 em grade 2 x 2 (cada cena 1024 x 1024, com o
objeto ocupando a metade de baixo para "pousar" no fio da página).

> [estilo comum] Folha com quatro ilustrações independentes em grade 2 por 2, mesmo tamanho e mesmo
> peso visual, que contam uma sequência.
> Cena 1 (canto superior esquerdo), "enviar o projeto": uma pasta zipada amarela com zíper roxo-tinta
> na frente, e saindo dela duas folhas de código brancas com linhas horizontais curtas coloridas
> (rosa, verde, azul, roxo-tinta) imitando linhas de programa. Uma seta rosa grossa apontando para
> cima ao lado.
> Cena 2 (canto superior direito), "o código vira portas": uma folha de código branca à esquerda se
> desfazendo em três portas lógicas amarelas à direita (uma AND em forma de D, uma OR em forma de
> escudo pontudo, uma NOT em forma de triângulo com bolinha na ponta), como se as linhas do código
> estivessem se transformando nas portas.
> Cena 3 (canto inferior esquerdo), "ver o circuito": três portas lógicas amarelas ligadas por fios
> grossos em ângulos retos, com bolinhas roxo-tinta nas junções, e uma lupa grande com aro rosa
> sobre uma das portas.
> Cena 4 (canto inferior direito), "simular": a mesma ideia de circuito, agora com fios verdes e
> azuis, bolinhas brancas correndo sobre os fios verdes, e por cima uma onda quadrada verde grossa
> subindo e descendo. Uma lâmpada pequena amarela acesa na saída.

## 3. Arte da área de envio

Arquivo: `upload-zip.webp`. Tamanho: 768 x 768 (aparece em 96 px, precisa ser simples).

> [estilo comum] Um único objeto: uma pasta zipada amarela #FFD23F vista de frente, cantos
> arredondados, com um zíper roxo-tinta vertical no meio e o puxador do zíper em rosa #E11D5B. Uma
> seta rosa grossa e curta apontando para cima, sobreposta ao canto inferior direito da pasta. Sem
> mais nada. Deve continuar legível reduzida a 96 pixels.

## 4. Ilustração de fechamento

Arquivo: `fechamento.webp`. Tamanho: 1600 x 1000, paisagem.

> [estilo comum] Cena larga e horizontal: à esquerda uma folha de código branca levemente inclinada;
> do lado direito dela sai um fio grosso verde que entra numa porta AND amarela grande no centro; da
> porta sai outro fio verde que, à direita, se transforma numa onda quadrada grossa (sobe, anda,
> desce, anda) e termina numa lâmpada amarela acesa com três tracinhos de brilho em rosa. Por baixo,
> em paralelo, um segundo fio azul liso. Bolinhas brancas com contorno verde espaçadas sobre o fio
> verde, sugerindo movimento da esquerda para a direita. Bastante respiro em cima e embaixo.

## 5. Mascote "Bit" (opcional, uma imagem com 6 poses)

Arquivo: `bit-folha.png` (ainda sem encaixe no app; se você gostar do resultado, eu ligo nas telas de
espera, erro e nas explicações). Tamanho: 2048 x 1365, grade 3 x 2.

> [estilo comum, mas aqui o personagem é permitido] Folha de personagem com seis poses do mesmo
> mascote, em grade 3 por 2. O mascote é um chip de circuito integrado: corpo retangular amarelo
> #FFD23F de cantos arredondados, quatro perninhas metálicas roxo-tinta de cada lado, um entalhe em
> meia-lua no topo, dois olhos redondos roxo-tinta grandes e uma boca simples. Braços e pernas são
> fios finos roxo-tinta. Proporção atarracada e simpática, sem dentes, sem sobrancelhas complexas.
> Pose 1: acenando. Pose 2: apontando para a direita com um braço. Pose 3: segurando uma lupa rosa.
> Pose 4: pensando, com uma mão no queixo e um ponto de interrogação desenhado como fio enrolado (não
> como letra). Pose 5: comemorando com os dois braços para cima e faíscas rosa. Pose 6: confuso, com
> um olho em X e um fio solto soltando uma faísca laranja. Mesmo tamanho e mesma espessura de
> contorno em todas as poses.

## Conferência antes de salvar

- Fundo transparente de verdade (abra sobre um fundo escuro para ver).
- Nenhum texto ou letra dentro da imagem.
- Só as cores da paleta.
- Contorno com a mesma espessura das outras imagens.
