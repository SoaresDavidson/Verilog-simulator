/** Realce de sintaxe de Verilog/SystemVerilog para o editor. Só classifica; não valida. */

export type TokenKind = 'comment' | 'string' | 'number' | 'system' | 'directive' | 'keyword' | 'ident' | 'op' | 'text'
export interface Token {
  kind: TokenKind
  text: string
}

const KEYWORDS = new Set(
  (
    'module endmodule input output inout wire reg logic assign always always_ff always_comb always_latch begin end ' +
    'if else case casez casex endcase default for while repeat forever initial posedge negedge parameter localparam ' +
    'integer genvar generate endgenerate function endfunction task endtask signed unsigned or and not xor nand nor xnor ' +
    'typedef enum struct packed bit int real time'
  ).split(' '),
)

const PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|(\d*'[sS]?[bBhHdDoO][0-9a-fA-FxXzZ_?]+|\b\d[\d_]*(?:\.\d+)?\b)|(\$[A-Za-z_]\w*)|(`[A-Za-z_]\w*)|([A-Za-z_]\w*)|([~^&|!<>=+\-*/%?:]+)/g

const KINDS: TokenKind[] = ['comment', 'string', 'number', 'system', 'directive', 'ident', 'op']

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  for (const match of source.matchAll(PATTERN)) {
    const index = match.index ?? 0
    if (index > last) tokens.push({ kind: 'text', text: source.slice(last, index) })
    const group = match.slice(1).findIndex((g) => g !== undefined)
    let kind = KINDS[group] ?? 'text'
    if (kind === 'ident' && KEYWORDS.has(match[0])) kind = 'keyword'
    tokens.push({ kind, text: match[0] })
    last = index + match[0].length
  }
  if (last < source.length) tokens.push({ kind: 'text', text: source.slice(last) })
  return tokens
}
