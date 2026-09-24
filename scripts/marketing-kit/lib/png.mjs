import { deflateSync, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 }

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = ([type, data]) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

const fromChunks = (chunks) => Buffer.concat([SIGNATURE, ...chunks.map(chunk)])

const readChunks = (png) => {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('PNG : signature invalide')
  const chunks = []
  let offset = 8
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    chunks.push([type, png.subarray(offset + 8, offset + 8 + length)])
    offset += 12 + length
  }
  return chunks
}

export const pngInfo = (png) => {
  const [type, ihdr] = readChunks(png)[0]
  if (type !== 'IHDR') throw new Error('PNG : IHDR absent')
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colorType: ihdr[9],
  }
}

const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

const unfilter = (raw, width, height, bpp) => {
  const stride = width * bpp
  const out = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const dst = y * stride
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[dst + x - bpp] : 0
      const b = y > 0 ? out[dst - stride + x] : 0
      const c = x >= bpp && y > 0 ? out[dst - stride + x - bpp] : 0
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]
      if (predictor === undefined) throw new Error(`PNG : filtre ${filter} inconnu`)
      out[dst + x] = (raw[src + x] + predictor) & 0xff
    }
  }
  return out
}

export const readPixels = (png) => {
  const { width, height, bitDepth, colorType } = pngInfo(png)
  const channels = CHANNELS_BY_COLOR_TYPE[colorType]
  if (bitDepth !== 8 || !channels) throw new Error(`PNG : format ${colorType}/${bitDepth} non géré`)
  const idat = Buffer.concat(readChunks(png).filter(([type]) => type === 'IDAT').map(([, data]) => data))
  return { width, height, channels, data: unfilter(inflateSync(idat), width, height, channels) }
}

export const encodePng = ({ width, height, channels, data }) => {
  const colorType = Object.entries(CHANNELS_BY_COLOR_TYPE).find(([, n]) => n === channels)?.[0]
  if (colorType === undefined) throw new Error(`PNG : ${channels} canaux non gérés`)
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, Number(colorType), 0, 0, 0], 8)
  return fromChunks([
    ['IHDR', ihdr],
    ['IDAT', deflateSync(raw, { level: 9 })],
    ['IEND', Buffer.alloc(0)],
  ])
}
encodePng.fromChunks = fromChunks

export const stripAlpha = (png) => {
  const { colorType } = pngInfo(png)
  if (colorType === 2) return png
  const { width, height, channels, data } = readPixels(png)
  if (channels !== 4) throw new Error(`PNG : type ${colorType} non convertible`)
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i += 1) {
    const alpha = data[i * 4 + 3] / 255
    for (let c = 0; c < 3; c += 1) {
      rgb[i * 3 + c] = Math.round(data[i * 4 + c] * alpha + 255 * (1 - alpha))
    }
  }
  return encodePng({ width, height, channels: 3, data: rgb })
}
