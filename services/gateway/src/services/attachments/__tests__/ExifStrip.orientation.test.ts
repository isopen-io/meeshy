/**
 * Une photo orientée n'est plus réencodée par la passerelle quand elle perd
 * son EXIF (#11841).
 *
 * Une orientation EXIF ≠ 1 s'applique aux pixels avant que l'EXIF ne parte —
 * sans quoi les trois clients et les rendus serveur (vignette, thumbhash,
 * dimensions persistées) afficheraient la photo couchée. Pour un JPEG, cette
 * rotation est désormais SANS PERTE : une transformation des coefficients DCT
 * (jpegtran), qui garde les tables de quantification d'origine — aucune
 * génération d'encodage. Quand les dimensions ne tombent pas sur la grille des
 * blocs (MCU), la transformation parfaite est impossible : la passerelle
 * retombe alors sur le réencodage fidèle d'avant, et la photo ressort droite
 * et sans GPS dans les deux cas.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { stripExifFromImageBuffer } from '../ExifStrip';

const SECRET = 'gps-holder-secret';
const DQT = 0xdb;

type Segment = { readonly marker: number; readonly start: number; readonly end: number };

function headerSegments(buffer: Buffer): readonly Segment[] {
  const walk = (offset: number, found: readonly Segment[]): readonly Segment[] => {
    const marker = buffer[offset + 1];
    const end = offset + 2 + buffer.readUInt16BE(offset + 2);
    const next = [...found, { marker, start: offset, end }];
    return marker === 0xda ? next : walk(end, next);
  };
  return walk(2, []);
}

/**
 * Les tables de quantification, chacune réduite à ses valeurs TRIÉES : une
 * rotation de 90° transpose une table (ses valeurs changent de case, pas de
 * valeur), un réencodage la remplace.
 */
function quantisationTables(buffer: Buffer): readonly (readonly number[])[] {
  const payloads = headerSegments(buffer).filter((s) => s.marker === DQT).map((s) => buffer.subarray(s.start + 4, s.end));
  return payloads.flatMap((payload) => {
    const tables: number[][] = [];
    let at = 0;
    while (at < payload.length) {
      const wide = payload[at] >> 4 === 1;
      const values = Array.from({ length: 64 }, (_, i) => (wide ? payload.readUInt16BE(at + 1 + i * 2) : payload[at + 1 + i]));
      tables.push([payload[at] & 0x0f, ...[...values].sort((a, b) => a - b)]);
      at += 1 + (wide ? 128 : 64);
    }
    return tables;
  });
}

async function photo(width: number, height: number, orientation: number): Promise<Buffer> {
  const gradient = Buffer.from(
    Array.from({ length: width * height * 3 }, (_, i) => {
      const pixel = Math.floor(i / 3);
      const [x, y, channel] = [pixel % width, Math.floor(pixel / width), i % 3];
      return (x * 7 + y * 3 + channel * 60) % 256;
    }),
  );
  return sharp(gradient, { raw: { width, height, channels: 3 } })
    .withExif({ IFD0: { Copyright: SECRET }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 24/1' } })
    .withMetadata({ orientation })
    .jpeg({ quality: 70 })
    .toBuffer();
}

async function decoded(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).raw().toBuffer();
}

function meanAbsoluteError(a: Buffer, b: Buffer): number {
  const total = a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0);
  return total / a.length;
}

describe('stripExifFromImageBuffer — rotation JPEG sans perte (#11841)', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])('orientation %i : la photo ressort droite, sans EXIF, avec ses tables de quantification d’origine (transposées au plus)', async (orientation) => {
    const original = await photo(64, 48, orientation);
    const upright = await sharp(original).autoOrient().raw().toBuffer({ resolveWithObject: true });

    const stripped = await stripExifFromImageBuffer(original, 'image/jpeg');
    const after = await sharp(stripped).metadata();

    expect(after.exif).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    expect([after.width, after.height]).toEqual([upright.info.width, upright.info.height]);
    expect(stripped.toString('latin1')).not.toContain(SECRET);
    expect(quantisationTables(stripped)).toEqual(quantisationTables(original));
    expect(meanAbsoluteError(await decoded(stripped), upright.data)).toBeLessThan(0.5);
  });

  it('une photo dont les dimensions sortent de la grille des blocs ressort quand même droite et sans GPS', async () => {
    const original = await photo(30, 20, 6);

    const stripped = await stripExifFromImageBuffer(original, 'image/jpeg');
    const after = await sharp(stripped).metadata();

    expect([after.width, after.height]).toEqual([20, 30]);
    expect(after.exif).toBeUndefined();
    expect(stripped.toString('latin1')).not.toContain(SECRET);
  });

  it.each([
    ['carte hors de la grille des blocs, réencodée seule', 'ultra-hdr-xmp-and-iso.jpg'],
    ['carte pivotée sans perte elle aussi', 'apple-gain-map-xmp-headroom.jpg'],
  ])('une photo HDR orientée pivote SANS PERTE avec sa carte de gain (%s)', async (_label, name) => {
    const hdr = readFileSync(join(__dirname, 'fixtures', 'gain-map', name));
    const before = await sharp(hdr).metadata();
    const carrier = await photo(16, 16, 6);
    const exif = headerSegments(carrier).find((s) => s.marker === 0xe1);
    if (!exif) throw new Error('fixture: no EXIF');
    const oriented = Buffer.concat([hdr.subarray(0, 2), carrier.subarray(exif.start, exif.end), hdr.subarray(2)]);
    expect((await sharp(oriented).metadata()).orientation).toBe(6);

    const stripped = await stripExifFromImageBuffer(oriented, 'image/jpeg');
    const after = await sharp(stripped).metadata();

    expect(after.gainMap).toBeDefined();
    expect([after.width, after.height]).toEqual([before.height, before.width]);
    expect(quantisationTables(stripped)).toEqual(quantisationTables(hdr));
    expect(stripped.toString('latin1')).not.toContain(SECRET);
  });
});

/**
 * #12278 — ce qui reste réencodé UNE fois (JPEG hors de la grille des blocs,
 * WebP avec perte : aucune rotation sans perte n'existe) l'est au plus près de
 * la source. Mesuré (PSNR contre l'original redressé) : JPEG q92 4:4:4 →
 * 43,2 dB, q95 au sous-échantillonnage de la source → 45,5 dB ; WebP q90 →
 * 40,8 dB, q95 → 44,3 dB. Le WebP sans perte (∞ dB) pèserait 6,5 fois la
 * source : écarté.
 */
function psnr(a: Buffer, b: Buffer): number {
  const squared = a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
  return 10 * Math.log10((255 * 255) / (squared / a.length));
}

function texture(width: number, height: number): Buffer {
  return Buffer.from(
    Array.from({ length: width * height * 3 }, (_, i) => {
      const pixel = Math.floor(i / 3);
      const [x, y] = [pixel % width, Math.floor(pixel / width)];
      return Math.round(Math.sin(x / 7 + (i % 3)) * 60 + Math.cos(y / 5) * 50 + 128 + ((x * y) % 17)) & 255;
    }),
  );
}

describe('stripExifFromImageBuffer — le réencodage inévitable perd le moins possible (#12278)', () => {
  it('un JPEG hors grille ressort à plus de 45 dB de l’original redressé, au sous-échantillonnage de sa source', async () => {
    const original = await sharp(texture(301, 203), { raw: { width: 301, height: 203, channels: 3 } })
      .jpeg({ quality: 80 }).withMetadata({ orientation: 6 }).toBuffer();
    const reference = await sharp(original).autoOrient().raw().toBuffer();

    const stripped = await stripExifFromImageBuffer(original, 'image/jpeg');

    expect(psnr(await decoded(stripped), reference)).toBeGreaterThan(45);
    expect((await sharp(stripped).metadata()).chromaSubsampling).toBe((await sharp(original).metadata()).chromaSubsampling);
  });

  it('un WebP avec perte orienté ressort à plus de 44 dB de l’original redressé', async () => {
    const original = await sharp(texture(301, 203), { raw: { width: 301, height: 203, channels: 3 } })
      .webp({ quality: 80 }).withMetadata({ orientation: 6 }).toBuffer();
    const reference = await sharp(original).autoOrient().raw().toBuffer();

    const stripped = await stripExifFromImageBuffer(original, 'image/webp');

    expect((await sharp(stripped).metadata()).orientation).toBeUndefined();
    expect(psnr(await decoded(stripped), reference)).toBeGreaterThan(44);
  });
});
