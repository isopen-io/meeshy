import { describe, expect, test } from 'bun:test';

import { averageColorOfThumbHash } from './thumbhash';
import { rgbaToThumbHash, thumbHashImage, thumbHashToBase64, thumbHashToRgba } from './thumbhash-image';

/** Un hash RÉEL du corpus (fixtures du fil) — paysage, sans alpha. */
const HASH = '3nQFFAT4WIiod4WYZ6joeo+u9w==';

const bytesOf = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

describe('thumbHashToRgba — la reconstruction COMPLÈTE (DCT), pas seulement la moyenne', () => {
  test('une image d’au plus 32 px de côté, au rapport du hash', () => {
    const image = thumbHashToRgba(bytesOf(HASH))!;
    expect(Math.max(image.width, image.height)).toBe(32);
    expect(image.rgba.length).toBe(image.width * image.height * 4);
  });

  test('ses pixels ne sont PAS uniformes — c’est un sol, pas un aplat', () => {
    const { rgba } = thumbHashToRgba(bytesOf(HASH))!;
    const colors = new Set<string>();
    for (let i = 0; i < rgba.length; i += 4) colors.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
    expect(colors.size).toBeGreaterThan(8);
  });

  test('sa moyenne rejoint la couleur moyenne que le hash déclare', () => {
    const { rgba } = thumbHashToRgba(bytesOf(HASH))!;
    const pixels = rgba.length / 4;
    const mean = (offset: number) => Array.from({ length: pixels }, (_, i) => rgba[i * 4 + offset]!).reduce((a, b) => a + b, 0) / pixels / 255;
    const declared = averageColorOfThumbHash(HASH)!;
    expect(Math.abs(mean(0) - declared.r)).toBeLessThan(0.06);
    expect(Math.abs(mean(1) - declared.g)).toBeLessThan(0.06);
    expect(Math.abs(mean(2) - declared.b)).toBeLessThan(0.06);
  });

  test('un hash trop court ⇒ null', () => {
    expect(thumbHashToRgba(new Uint8Array([1, 2]))).toBeNull();
  });
});

describe('thumbHashImage — un `data:` BMP, sans canvas, identique sur les trois moteurs', () => {
  test('un BMP 24 bits aux dimensions de l’image', () => {
    const url = thumbHashImage(HASH)!;
    expect(url.startsWith('data:image/bmp;base64,')).toBe(true);
    const bytes = bytesOf(url.slice('data:image/bmp;base64,'.length));
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('BM');
    expect(view.getUint32(2, true)).toBe(bytes.length);
    const image = thumbHashToRgba(bytesOf(HASH))!;
    expect(view.getInt32(18, true)).toBe(image.width);
    expect(view.getInt32(22, true)).toBe(image.height);
    expect(view.getUint16(28, true)).toBe(24);
  });

  test('absent, vide ou illisible ⇒ undefined', () => {
    expect(thumbHashImage(undefined)).toBeUndefined();
    expect(thumbHashImage('')).toBeUndefined();
    expect(thumbHashImage('%%%')).toBeUndefined();
  });
});

/** L'ENCODEUR (#8425) — pour hacher le COMPOSITE de la scène au composer :
 * un aller-retour encodage → décodage rend l'image qu'on a donnée. */
describe('rgbaToThumbHash — encoder un rendu réduit, le relire', () => {
  const gradient = (w: number, h: number) => {
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = Math.round((255 * x) / (w - 1));
        rgba[i + 1] = 80;
        rgba[i + 2] = Math.round((255 * y) / (h - 1));
        rgba[i + 3] = 255;
      }
    }
    return rgba;
  };

  test('portrait 9:16 : le hash relu est vertical et garde la moyenne', () => {
    const rgba = gradient(56, 100);
    const decoded = thumbHashToRgba(rgbaToThumbHash(56, 100, rgba))!;
    expect(decoded.height).toBe(32);
    expect(decoded.width).toBeLessThan(decoded.height);
    const mean = (img: Uint8Array, o: number) => {
      let sum = 0;
      for (let i = o; i < img.length; i += 4) sum += img[i]!;
      return sum / (img.length / 4);
    };
    expect(Math.abs(mean(decoded.rgba, 0) - mean(rgba, 0))).toBeLessThan(16);
    expect(Math.abs(mean(decoded.rgba, 2) - mean(rgba, 2))).toBeLessThan(16);
  });

  test('le dégradé survit : la gauche reste plus sombre en rouge que la droite', () => {
    const decoded = thumbHashToRgba(rgbaToThumbHash(56, 100, gradient(56, 100)))!;
    const row = 16 * decoded.width * 4;
    expect(decoded.rgba[row]!).toBeLessThan(decoded.rgba[row + (decoded.width - 1) * 4]!);
  });

  test('au-delà de 100 px de côté, l’encodeur refuse', () => {
    expect(() => rgbaToThumbHash(101, 10, new Uint8Array(101 * 10 * 4))).toThrow();
  });

  test('le hash se sert en base64, relu par `thumbHashImage`', () => {
    expect(thumbHashImage(thumbHashToBase64(rgbaToThumbHash(56, 100, gradient(56, 100))))).toMatch(/^data:image\/bmp;base64,/);
  });
});
