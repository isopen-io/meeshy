/**
 * Une LUT de lens se garde SANS PERTE (#11271, audit de #12293) : ni
 * redimensionnée (une table de couleurs réduite ne correspond plus à rien), ni
 * ré-encodée avec perte (chaque pixel est une valeur de la table). Elle est
 * relue et ré-écrite en PNG, ce qui retire les métadonnées sans changer un pixel.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import sharp from 'sharp';
import { normalizeLensLut } from '../../../services/packs/lensLutImage';

const gradient = (width: number, height: number): Buffer =>
  Buffer.from(Array.from({ length: width * height * 3 }, (_, index) => (index * 37) % 256));

const pngOf = async (width: number, height: number) =>
  sharp(gradient(width, height), { raw: { width, height, channels: 3 } }).png().toBuffer();

const pixelsOf = async (bytes: Buffer) => sharp(bytes).removeAlpha().raw().toBuffer();

describe('normalizeLensLut', () => {
  it('garde la définition d’une LUT plus large que les stickers et chacun de ses pixels', async () => {
    const source = await pngOf(1024, 32);

    const outcome = await normalizeLensLut(source);

    expect(outcome).toMatchObject({ ok: true, image: { mimeType: 'image/png', width: 1024, height: 32, animated: false } });
    if (!outcome.ok) throw new Error('refused');
    expect(Buffer.compare(await pixelsOf(outcome.image.bytes), await pixelsOf(source))).toBe(0);
  });

  it('une LUT reçue en WebP est écrite en PNG, sans nouvelle perte', async () => {
    const source = await sharp(gradient(64, 64), { raw: { width: 64, height: 64, channels: 3 } }).webp({ lossless: true }).toBuffer();

    const outcome = await normalizeLensLut(source);

    expect(outcome).toMatchObject({ ok: true, image: { mimeType: 'image/png', width: 64, height: 64 } });
    if (!outcome.ok) throw new Error('refused');
    expect(Buffer.compare(await pixelsOf(outcome.image.bytes), await pixelsOf(source))).toBe(0);
  });

  it('ce qui n’est pas une image est refusé', async () => {
    expect(await normalizeLensLut(Buffer.from('pas une image'))).toEqual({ ok: false, reason: 'not-an-image' });
  });
});
