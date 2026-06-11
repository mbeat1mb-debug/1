// Generates the PWA icons (dark square with a teal recovery ring).
// Pure Node — no image libraries needed. Run: node scripts/generate-icons.mjs
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// CRC32 (PNG chunk checksums)
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const BG = [10, 10, 12]
const TEAL = [0, 201, 167]

function makeIcon(size) {
  const stride = size * 4 + 1 // +1 = filter byte per scanline
  const raw = Buffer.alloc(size * stride)
  const c = size / 2
  const rOuter = size * 0.36
  const rInner = size * 0.24

  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c + 0.5, y - c + 0.5)
      // Coverage of the ring band with ~1px anti-aliased edges
      const edge = Math.min(rOuter - d, d - rInner)
      const t = Math.max(0, Math.min(1, edge + 0.5))
      const px = y * stride + 1 + x * 4
      raw[px] = Math.round(BG[0] + (TEAL[0] - BG[0]) * t)
      raw[px + 1] = Math.round(BG[1] + (TEAL[1] - BG[1]) * t)
      raw[px + 2] = Math.round(BG[2] + (TEAL[2] - BG[2]) * t)
      raw[px + 3] = 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type: RGBA
  // bytes 10-12: compression / filter / interlace = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of [180, 192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, makeIcon(size))
  console.log(`wrote ${file}`)
}
