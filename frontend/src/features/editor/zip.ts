/**
 * Leitura e escrita do ZIP do projeto no navegador, para o editor de código.
 * Lê entradas "stored" e "deflate"; escreve sempre "stored" com CRC-32.
 * O backend continua sendo a fonte da verdade (limites, Zip Slip, Zip Bomb).
 */

export interface ZipItem {
  path: string
  bytes: Uint8Array
}

/** ZIP do projeto enviado nesta sessão; some ao recarregar a página. */
let currentZip: File | null = null
export const setProjectZip = (file: File | null) => {
  currentZip = file
}
export const getProjectZip = () => currentZip

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50

async function view(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer())
}

export async function readZip(blob: Blob): Promise<ZipItem[]> {
  const tailStart = Math.max(0, blob.size - (22 + 0xffff))
  const tail = await view(blob, tailStart, blob.size)
  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i -= 1) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('O arquivo não é um ZIP válido.')
  const total = tail.getUint16(eocd + 10, true)
  const cdSize = tail.getUint32(eocd + 12, true)
  const cdOffset = tail.getUint32(eocd + 16, true)
  const cd = await view(blob, cdOffset, cdOffset + cdSize)
  const decoder = new TextDecoder('utf-8')
  const items: ZipItem[] = []
  let p = 0
  for (let i = 0; i < total; i += 1) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== CENTRAL_SIG) throw new Error('O arquivo não é um ZIP válido.')
    const method = cd.getUint16(p + 10, true)
    const compressed = cd.getUint32(p + 20, true)
    const nameLength = cd.getUint16(p + 28, true)
    const extraLength = cd.getUint16(p + 30, true)
    const commentLength = cd.getUint16(p + 32, true)
    const localOffset = cd.getUint32(p + 42, true)
    const path = decoder.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLength)).replace(/\\/g, '/')
    p += 46 + nameLength + extraLength + commentLength
    if (path.endsWith('/')) continue

    const local = await view(blob, localOffset, localOffset + 30)
    const start = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true)
    const data = blob.slice(start, start + compressed)
    let buffer: ArrayBuffer
    if (method === 0) buffer = await data.arrayBuffer()
    else if (method === 8) buffer = await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()
    else throw new Error(`Compressão não suportada em ${path}.`)
    items.push({ path, bytes: new Uint8Array(buffer) })
  }
  return items
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function writeZip(items: ZipItem[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const item of items) {
    const name = encoder.encode(item.path)
    const crc = crc32(item.bytes)
    const size = item.bytes.length

    const local = new Uint8Array(30 + name.length + size)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // nomes em UTF-8
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(item.bytes, 30 + name.length)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, CENTRAL_SIG, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const cdSize = centrals.reduce((sum, c) => sum + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, EOCD_SIG, true)
  ev.setUint16(8, items.length, true)
  ev.setUint16(10, items.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + cdSize + 22)
  let p = 0
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, p)
    p += part.length
  }
  return out
}
