import { describe, expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { encodePng, pngInfo, readPixels, stripAlpha } from '../lib/png.mjs'

const rgbaPng = (width, height, pixel) => {
  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i += 1) data.set(pixel, i * 4)
  return encodePng({ width, height, channels: 4, data })
}

describe('PNG App Store — aucun canal alpha', () => {
  test('encodePng rend un PNG lisible aux dimensions demandées', () => {
    const png = rgbaPng(3, 2, [99, 102, 241, 255])
    expect(pngInfo(png)).toEqual({ width: 3, height: 2, colorType: 6, bitDepth: 8 })
  })

  test('stripAlpha convertit un RGBA en RGB (type 2) sans changer les pixels opaques', () => {
    const rgb = stripAlpha(rgbaPng(4, 3, [99, 102, 241, 255]))
    expect(pngInfo(rgb)).toEqual({ width: 4, height: 3, colorType: 2, bitDepth: 8 })
    const { channels, data } = readPixels(rgb)
    expect(channels).toBe(3)
    expect([...data.subarray(0, 3)]).toEqual([99, 102, 241])
  })

  test('stripAlpha compose un pixel translucide sur du blanc', () => {
    const { data } = readPixels(stripAlpha(rgbaPng(1, 1, [0, 0, 0, 0])))
    expect([...data]).toEqual([255, 255, 255])
  })

  test('stripAlpha laisse intact un PNG déjà RGB', () => {
    const rgb = stripAlpha(rgbaPng(2, 2, [1, 2, 3, 255]))
    expect(stripAlpha(rgb).equals(rgb)).toBe(true)
  })

  test('les filtres PNG (Sub, Up, Average, Paeth) sont décodés', () => {
    const width = 2
    const rows = [
      [1, 10, 20, 30, 255, 5, 5, 5, 0],
      [2, 1, 1, 1, 0, 1, 1, 1, 0],
      [3, 2, 2, 2, 0, 2, 2, 2, 0],
      [4, 0, 0, 0, 0, 0, 0, 0, 0],
    ]
    const raw = Buffer.from(rows.flat())
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(rows.length, 4)
    ihdr.set([8, 6, 0, 0, 0], 8)
    const png = encodePng.fromChunks([
      ['IHDR', ihdr],
      ['IDAT', deflateSync(raw)],
      ['IEND', Buffer.alloc(0)],
    ])
    const { data } = readPixels(png)
    expect([...data.subarray(0, 8)]).toEqual([10, 20, 30, 255, 15, 25, 35, 255])
    expect([...data.subarray(8, 16)]).toEqual([11, 21, 31, 255, 16, 26, 36, 255])
    expect([...data.subarray(16, 24)]).toEqual([7, 12, 17, 127, 13, 21, 28, 191])
    expect([...data.subarray(24, 32)]).toEqual([7, 12, 17, 127, 13, 21, 28, 191])
  })
})
