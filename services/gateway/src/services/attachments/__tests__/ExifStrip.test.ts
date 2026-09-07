/**
 * Retrait d'EXIF/GPS des images uploadées (#3627).
 *
 * `sharp` réel — pas de double — pour prouver que la métadonnée est
 * effectivement retirée, pas seulement que la fonction a été appelée
 * (patron déjà en place pour `mediaWatermark.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import sharp from 'sharp';
import { isExifStrippable, stripExifFromImageBuffer } from '../ExifStrip';

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 10, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'gps-holder-secret', Make: 'TestCam' } })
    .toBuffer();
}

async function pngWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .withExif({ IFD0: { Copyright: 'gps-holder-secret' } })
    .toBuffer();
}

async function webpWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 10, channels: 3, background: { r: 4, g: 5, b: 6 } } })
    .webp()
    .withExif({ IFD0: { Copyright: 'gps-holder-secret' } })
    .toBuffer();
}

describe('isExifStrippable', () => {
  it.each([
    ['image/jpeg', true],
    ['image/jpg', true],
    ['image/png', true],
    ['image/webp', true],
    ['IMAGE/JPEG', true],
    ['image/gif', false],
    ['image/svg+xml', false],
    ['video/mp4', false],
    ['audio/mp4', false],
    ['application/pdf', false],
  ])('%s → %s', (mimeType, expected) => {
    expect(isExifStrippable(mimeType)).toBe(expected);
  });
});

describe('stripExifFromImageBuffer', () => {
  it('retire l’EXIF (dont un GPS/Copyright) d’un JPEG', async () => {
    const withExif = await jpegWithExif();
    const before = await sharp(withExif).metadata();
    expect(before.exif).toBeDefined();
    expect(before.exif!.toString('latin1')).toContain('gps-holder-secret');

    const stripped = await stripExifFromImageBuffer(withExif, 'image/jpeg');
    const after = await sharp(stripped).metadata();

    expect(after.exif).toBeUndefined();
    expect(after.format).toBe('jpeg');
  });

  it('retire l’EXIF d’un PNG', async () => {
    const withExif = await pngWithExif();
    const stripped = await stripExifFromImageBuffer(withExif, 'image/png');
    const after = await sharp(stripped).metadata();

    expect(after.exif).toBeUndefined();
    expect(after.format).toBe('png');
  });

  it('retire l’EXIF d’un WEBP', async () => {
    const withExif = await webpWithExif();
    const stripped = await stripExifFromImageBuffer(withExif, 'image/webp');
    const after = await sharp(stripped).metadata();

    expect(after.exif).toBeUndefined();
    expect(after.format).toBe('webp');
  });

  it('applique l’orientation EXIF avant de la perdre (rotate baked in)', async () => {
    // Portrait logique (100x50 stocké en paysage) + Orientation=6 (90° CW) —
    // sans `.rotate()` avant la perte de l’EXIF, l’image ressortirait dans
    // ses dimensions de stockage brutes plutôt que son orientation affichée.
    const raw = await sharp({ create: { width: 100, height: 50, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'x' } })
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const stripped = await stripExifFromImageBuffer(raw, 'image/jpeg');
    const after = await sharp(stripped).metadata();

    expect(after.exif).toBeUndefined();
    // Orientation 6 = rotation 90° : largeur/hauteur inversées après bake-in.
    expect(after.width).toBe(50);
    expect(after.height).toBe(100);
  });

  it('rend le buffer INCHANGÉ pour un type non couvert (gif, svg, autre)', async () => {
    const gifLike = Buffer.from('GIF89a-not-a-real-gif-but-thats-fine-here');
    const result = await stripExifFromImageBuffer(gifLike, 'image/gif');
    expect(result).toBe(gifLike);

    const svgLike = Buffer.from('<svg></svg>');
    const resultSvg = await stripExifFromImageBuffer(svgLike, 'image/svg+xml');
    expect(resultSvg).toBe(svgLike);
  });
});
