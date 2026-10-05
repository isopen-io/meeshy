import { describe, expect, test } from 'bun:test';

import { GIF_PALETTE, encodeGif, lzwEncode, quantize } from './gif-encoder';

/** Un décodeur LZW de GIF écrit à part, d'après le format — le témoin ne relit pas l'encodeur. */
function lzwDecode(data: Uint8Array, minCodeSize: number): number[] {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let codeSize = minCodeSize + 1;
  let table: number[][] = [];
  const reset = () => {
    table = Array.from({ length: clear + 2 }, (_, i) => [i]);
    codeSize = minCodeSize + 1;
  };
  reset();
  const out: number[] = [];
  let bitPos = 0;
  let previous: number[] | null = null;
  const read = (): number => {
    let code = 0;
    for (let i = 0; i < codeSize; i += 1) {
      const byte = data[(bitPos + i) >> 3] ?? 0;
      code |= ((byte >> ((bitPos + i) & 7)) & 1) << i;
    }
    bitPos += codeSize;
    return code;
  };
  for (;;) {
    const code = read();
    if (code === clear) {
      reset();
      previous = null;
      continue;
    }
    if (code === end) break;
    const entry: number[] = table[code] ?? (previous === null ? [] : [...previous, previous[0] ?? 0]);
    out.push(...entry);
    if (previous !== null && table.length < 4096) table.push([...previous, entry[0] ?? 0]);
    if (table.length === 1 << codeSize && codeSize < 12) codeSize += 1;
    previous = entry;
  }
  return out;
}

const pseudoRandom = (length: number, seed: number): number[] => {
  let state = seed;
  return Array.from({ length }, () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % 7 === 0 ? state % 256 : state % 5;
  });
};

describe('l’encodeur GIF de « Imager »', () => {
  test('la compression LZW se relit à l’identique — y compris au-delà d’une table pleine', () => {
    for (const input of [[1], [3, 3, 3, 3, 3, 3], pseudoRandom(20_000, 7), Array.from({ length: 9000 }, (_, i) => i % 256)]) {
      expect(lzwDecode(lzwEncode(input, 8), 8)).toEqual(input);
    }
  });

  test('la palette est un cube de 252 couleurs, noir et blanc aux extrémités', () => {
    expect(GIF_PALETTE.length).toBe(768);
    expect([...GIF_PALETTE.subarray(0, 3)]).toEqual([0, 0, 0]);
    expect([...GIF_PALETTE.subarray(251 * 3, 252 * 3)]).toEqual([255, 255, 255]);
  });

  test('un pixel blanc tombe sur le blanc, un pixel noir sur le noir', () => {
    const rgba = Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 255]);
    expect([...quantize(rgba, 2, 1)]).toEqual([251, 0]);
  });

  test('un GIF89a animé, en boucle, fermé par son terminateur', () => {
    const frame = { indices: new Uint8Array(4 * 3).fill(5), delayMs: 100 };
    const gif = encodeGif(4, 3, [frame, frame]);
    expect(String.fromCharCode(...gif.subarray(0, 6))).toBe('GIF89a');
    expect(gif[6]).toBe(4);
    expect(gif[8]).toBe(3);
    expect(String.fromCharCode(...gif.subarray(13 + 768 + 3, 13 + 768 + 14))).toBe('NETSCAPE2.0');
    expect(gif[gif.length - 1]).toBe(0x3b);
    const controls = [...gif].filter((byte, i) => byte === 0x21 && gif[i + 1] === 0xf9).length;
    expect(controls).toBe(2);
  });
});
