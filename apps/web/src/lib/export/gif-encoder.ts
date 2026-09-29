/**
 * **UN ENCODEUR GIF MINIMAL** (#8693) — pour « Imager » un message vidéo en
 * GIF animé, sans dépendance : une palette FIXE de 252 couleurs (6 rouges × 7
 * verts × 6 bleus, le vert mieux servi parce que l'œil y est plus sensible),
 * un tramage ordonné 4×4 qui efface les aplats des dégradés, la compression
 * LZW du format, et la boucle infinie de l'extension NETSCAPE.
 *
 * Une palette fixe plutôt qu'une quantification par image : l'encodeur reste
 * court, déterministe, et une carte d'export — des dégradés et un visuel — y
 * perd moins que ce qu'une palette adaptative coûterait en temps sur un
 * téléphone. Chargé à la demande, avec l'export animé.
 */

const LEVELS_R = 6;
const LEVELS_G = 7;
const LEVELS_B = 6;

/** La palette : 256 entrées RVB, les 252 du cube puis du noir. */
export const GIF_PALETTE: Uint8Array = (() => {
  const palette = new Uint8Array(256 * 3);
  let i = 0;
  for (let r = 0; r < LEVELS_R; r += 1) {
    for (let g = 0; g < LEVELS_G; g += 1) {
      for (let b = 0; b < LEVELS_B; b += 1) {
        palette[i * 3] = Math.round((r * 255) / (LEVELS_R - 1));
        palette[i * 3 + 1] = Math.round((g * 255) / (LEVELS_G - 1));
        palette[i * 3 + 2] = Math.round((b * 255) / (LEVELS_B - 1));
        i += 1;
      }
    }
  }
  return palette;
})();

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

const level = (value: number, levels: number, threshold: number): number => {
  const scaled = (value / 255) * (levels - 1) + threshold;
  return Math.min(levels - 1, Math.max(0, Math.floor(scaled)));
};

/** Les pixels RVBA d'une image, ramenés aux indices de la palette, tramés. */
export function quantize(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      const threshold = ((BAYER[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
      const r = level(rgba[p * 4] ?? 0, LEVELS_R, threshold);
      const g = level(rgba[p * 4 + 1] ?? 0, LEVELS_G, threshold);
      const b = level(rgba[p * 4 + 2] ?? 0, LEVELS_B, threshold);
      indices[p] = r * LEVELS_G * LEVELS_B + g * LEVELS_B + b;
    }
  }
  return indices;
}

class ByteSink {
  private chunks: number[] = [];
  push(...bytes: number[]): void {
    for (const byte of bytes) this.chunks.push(byte & 0xff);
  }
  word(value: number): void {
    this.push(value & 0xff, (value >> 8) & 0xff);
  }
  bytes(values: ArrayLike<number>): void {
    for (let i = 0; i < values.length; i += 1) this.chunks.push((values[i] ?? 0) & 0xff);
  }
  toUint8Array(): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(this.chunks);
  }
}

/** La compression LZW d'un GIF — codes de 9 à 12 bits, remise à zéro quand la table est pleine. */
export function lzwEncode(indices: ArrayLike<number>, minCodeSize = 8): Uint8Array {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out: number[] = [];
  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let buffer = 0;
  let bits = 0;
  const dictionary = new Map<number, number>();
  const write = (code: number) => {
    buffer |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      out.push(buffer & 0xff);
      buffer >>>= 8;
      bits -= 8;
    }
  };
  write(clear);
  if (indices.length === 0) {
    write(end);
    if (bits > 0) out.push(buffer & 0xff);
    return Uint8Array.from(out);
  }
  let prefix = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i += 1) {
    const symbol = indices[i] ?? 0;
    const key = prefix * 256 + symbol;
    const known = dictionary.get(key);
    if (known !== undefined) {
      prefix = known;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      dictionary.set(key, next);
      next += 1;
      if (next > 1 << codeSize && codeSize < 12) codeSize += 1;
    } else {
      write(clear);
      dictionary.clear();
      codeSize = minCodeSize + 1;
      next = end + 1;
    }
    prefix = symbol;
  }
  write(prefix);
  write(end);
  if (bits > 0) out.push(buffer & 0xff);
  return Uint8Array.from(out);
}

export type GifFrame = { readonly indices: Uint8Array; readonly delayMs: number };

/** Un GIF89a animé, en boucle, de frames déjà ramenées à `GIF_PALETTE`. */
export function encodeGif(width: number, height: number, frames: readonly GifFrame[]): Uint8Array<ArrayBuffer> {
  const sink = new ByteSink();
  sink.bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  sink.word(width);
  sink.word(height);
  sink.push(0xf7, 0, 0);
  sink.bytes(GIF_PALETTE);
  sink.push(0x21, 0xff, 0x0b);
  sink.bytes(Array.from('NETSCAPE2.0', (c) => c.charCodeAt(0)));
  sink.push(0x03, 0x01, 0x00, 0x00, 0x00);
  for (const frame of frames) {
    sink.push(0x21, 0xf9, 0x04, 0x00);
    sink.word(Math.max(2, Math.round(frame.delayMs / 10)));
    sink.push(0x00, 0x00);
    sink.push(0x2c);
    sink.word(0);
    sink.word(0);
    sink.word(width);
    sink.word(height);
    sink.push(0x00, 0x08);
    const data = lzwEncode(frame.indices, 8);
    for (let offset = 0; offset < data.length; offset += 255) {
      const block = data.subarray(offset, offset + 255);
      sink.push(block.length);
      sink.bytes(block);
    }
    sink.push(0x00);
  }
  sink.push(0x3b);
  return sink.toUint8Array();
}
