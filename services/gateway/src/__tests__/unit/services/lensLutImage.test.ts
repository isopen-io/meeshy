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

  it('une LUT marquée Display P3 garde ses valeurs : aucune conversion de profil (contre-audit de #12293)', async () => {
    const tagged = await sharp(gradient(64, 8), { raw: { width: 64, height: 8, channels: 3 } }).withIccProfile('p3').png().toBuffer();
    const values = await sharp(tagged, { ignoreIcc: true }).raw().toBuffer();

    const outcome = await normalizeLensLut(tagged);

    if (!outcome.ok) throw new Error('refused');
    expect(Buffer.compare(await sharp(outcome.image.bytes, { ignoreIcc: true }).raw().toBuffer(), values)).toBe(0);
  });

  it('une LUT 16 bits sort en 16 bits, chaque valeur intacte', async () => {
    const width = 32;
    const height = 8;
    const raw16 = Buffer.alloc(width * height * 3 * 2);
    for (let index = 0; index < width * height * 3; index += 1) raw16.writeUInt16LE((index * 977) % 65_536, index * 2);
    const source = await sharp(raw16, { raw: { width, height, channels: 3, depth: 'ushort' } }).toColourspace('rgb16').png().toBuffer();

    const outcome = await normalizeLensLut(source);

    if (!outcome.ok) throw new Error('refused');
    expect((await sharp(outcome.image.bytes).metadata()).depth).toBe('ushort');
    const out = await sharp(outcome.image.bytes).raw({ depth: 'ushort' }).toBuffer();
    const expected = await sharp(source).raw({ depth: 'ushort' }).toBuffer();
    expect(Buffer.compare(out, expected)).toBe(0);
  });

  it('une source CMYK est refusée : la convertir en RVB changerait chaque valeur de la table (#12329 R4)', async () => {
    const cmyk = await sharp(gradient(64, 8), { raw: { width: 64, height: 8, channels: 3 } }).toColourspace('cmyk').jpeg({ quality: 100 }).toBuffer();
    expect((await sharp(cmyk).metadata()).space).toBe('cmyk');
    expect(await normalizeLensLut(cmyk)).toEqual({ ok: false, reason: 'not-an-image' });
  });

  it('une table en niveaux de gris reste acceptée', async () => {
    const grey = await sharp(gradient(64, 8), { raw: { width: 64, height: 8, channels: 3 } }).toColourspace('b-w').png().toBuffer();
    expect((await normalizeLensLut(grey)).ok).toBe(true);
  });
});
