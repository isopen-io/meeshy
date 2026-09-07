/**
 * #3627 — `stripImageMetadata` retire EXIF/GPS d'une photo JPEG/PNG avant
 * qu'elle ne touche le disque. Sharp RÉEL (pas de double) — pour prouver que
 * le retrait a réellement lieu, pas seulement qu'une fonction a été appelée.
 * Patron repris de `services/media/__tests__/mediaWatermark.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import sharp from 'sharp';
import { shouldStripImageMetadata, stripImageMetadata } from '../imageMetadataStrip';

const jpegWithExif = (exif: Record<string, Record<string, string>>) =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 200, g: 50, b: 10 } } })
    .jpeg()
    .withExif(exif)
    .toBuffer();

describe('shouldStripImageMetadata', () => {
  it.each([
    ['image/jpeg', true],
    ['image/png', true],
    ['image/webp', false],
    ['image/gif', false],
    ['image/svg+xml', false],
    [undefined, false],
    [null, false],
  ])('%s → %s', (mimeType, expected) => {
    expect(shouldStripImageMetadata(mimeType as string | undefined | null)).toBe(expected);
  });
});

describe('stripImageMetadata — sharp réel', () => {
  it("retire l'EXIF (GPS compris) d'un JPEG", async () => {
    const source = await jpegWithExif({ IFD0: { Copyright: 'le-gps-de-la-prise-de-vue' } });
    const before = await sharp(source).metadata();
    expect(before.exif).toBeDefined();

    const stripped = await stripImageMetadata(source);
    const after = await sharp(stripped).metadata();

    expect(after.exif).toBeUndefined();
    expect(Buffer.from(stripped).includes('le-gps-de-la-prise-de-vue')).toBe(false);
  });

  it('préserve les dimensions et le format', async () => {
    const source = await jpegWithExif({ IFD0: { Copyright: 'x' } });
    const stripped = await stripImageMetadata(source);
    const after = await sharp(stripped).metadata();

    expect(after.width).toBe(40);
    expect(after.height).toBe(20);
    expect(after.format).toBe('jpeg');
  });

  it('produit un buffer plus petit quand la source porte de l’EXIF', async () => {
    const source = await jpegWithExif({ IFD0: { Copyright: 'x'.repeat(200) } });
    const stripped = await stripImageMetadata(source);
    expect(stripped.length).toBeLessThan(source.length);
  });

  it('fail-open : rend le buffer original si le décodage échoue', async () => {
    const garbage = Buffer.from('not-an-image');
    const result = await stripImageMetadata(garbage);
    expect(result).toBe(garbage);
  });
});
