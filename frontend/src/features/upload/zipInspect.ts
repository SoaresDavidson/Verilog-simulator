/**
 * Leitura do diretório central de um ZIP no navegador, sem descompactar.
 * Serve só para validação prévia e preview; o backend é a fonte da verdade
 * (limites, Zip Slip e Zip Bomb — #9, #18).
 */

export interface ZipEntry {
  path: string
  /** Tamanho descompactado declarado no diretório central. */
  size: number
  isDirectory: boolean
}

export class ZipFormatError extends Error {
  constructor(message = 'O arquivo não é um ZIP válido.') {
    super(message)
    this.name = 'ZipFormatError'
  }
}

const LOCAL_HEADER_SIG = 0x04034b50
const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const EOCD_MIN = 22
const MAX_COMMENT = 0xffff
/** Limite de entradas lidas para o preview. */
export const MAX_PREVIEW_ENTRIES = 5000

async function readBytes(blob: Blob, start: number, end: number): Promise<DataView> {
  const buffer = await blob.slice(start, end).arrayBuffer()
  return new DataView(buffer)
}

export async function readZipEntries(blob: Blob): Promise<ZipEntry[]> {
  if (blob.size < EOCD_MIN) throw new ZipFormatError()

  const head = await readBytes(blob, 0, 4)
  const headSig = head.getUint32(0, true)
  if (headSig === EOCD_SIG) return [] // ZIP vazio
  if (headSig !== LOCAL_HEADER_SIG) throw new ZipFormatError()

  const tailStart = Math.max(0, blob.size - (EOCD_MIN + MAX_COMMENT))
  const tail = await readBytes(blob, tailStart, blob.size)
  let eocd = -1
  for (let i = tail.byteLength - EOCD_MIN; i >= 0; i -= 1) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new ZipFormatError()

  const total = tail.getUint16(eocd + 10, true)
  const cdSize = tail.getUint32(eocd + 12, true)
  const cdOffset = tail.getUint32(eocd + 16, true)
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ZipFormatError('Formato ZIP64 não é suportado. Compacte o projeto novamente.')
  }
  if (cdOffset + cdSize > blob.size) throw new ZipFormatError()

  const cd = await readBytes(blob, cdOffset, cdOffset + cdSize)
  const decoder = new TextDecoder('utf-8')
  const entries: ZipEntry[] = []
  let p = 0
  for (let i = 0; i < total && i < MAX_PREVIEW_ENTRIES; i += 1) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== CENTRAL_SIG) throw new ZipFormatError()
    const size = cd.getUint32(p + 24, true)
    const nameLength = cd.getUint16(p + 28, true)
    const extraLength = cd.getUint16(p + 30, true)
    const commentLength = cd.getUint16(p + 32, true)
    const nameStart = p + 46
    if (nameStart + nameLength > cd.byteLength) throw new ZipFormatError()
    const path = decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + nameStart, nameLength)).replace(/\\/g, '/')
    entries.push({ path, size, isDirectory: path.endsWith('/') })
    p = nameStart + nameLength + extraLength + commentLength
  }
  return entries
}
