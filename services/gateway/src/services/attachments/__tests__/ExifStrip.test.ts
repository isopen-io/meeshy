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

const CRC_TABLE = Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce<number>((c) => (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1), n),
);

function crc32(bytes: Buffer): number {
  return (bytes.reduce((c, byte) => CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function pngChunkTypes(buffer: Buffer): readonly string[] {
  const walk = (offset: number, types: readonly string[]): readonly string[] =>
    offset + 8 > buffer.length
      ? types
      : walk(offset + 12 + buffer.readUInt32BE(offset), [...types, buffer.toString('latin1', offset + 4, offset + 8)]);
  return walk(8, []);
}

function pngChunkData(buffer: Buffer, type: string): Buffer {
  const walk = (offset: number): Buffer => {
    const length = buffer.readUInt32BE(offset);
    return buffer.toString('latin1', offset + 4, offset + 8) === type
      ? buffer.subarray(offset + 8, offset + 8 + length)
      : walk(offset + 12 + length);
  };
  return walk(8);
}

function frameControl(sequence: number): Buffer {
  const control = Buffer.alloc(26);
  control.writeUInt32BE(sequence, 0);
  control.writeUInt32BE(8, 4);
  control.writeUInt32BE(8, 8);
  control.writeUInt16BE(1, 20);
  control.writeUInt16BE(10, 22);
  return control;
}

async function apngWithMetadata(): Promise<Buffer> {
  const still = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer();
  const pixels = pngChunkData(still, 'IDAT');
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(2, 0);
  return Buffer.concat([
    still.subarray(0, 8),
    pngChunk('IHDR', pngChunkData(still, 'IHDR')),
    pngChunk('acTL', animation),
    pngChunk('eXIf', Buffer.from('MM\0*gps-holder-secret', 'latin1')),
    pngChunk('tEXt', Buffer.from('Comment\0gps-holder-secret', 'latin1')),
    pngChunk('fcTL', frameControl(0)),
    pngChunk('IDAT', pixels),
    pngChunk('fcTL', frameControl(1)),
    pngChunk('fdAT', Buffer.concat([Buffer.from([0, 0, 0, 2]), pixels])),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function animatedWebpWithExif(): Promise<Buffer> {
  const frame = (r: number) =>
    sharp({ create: { width: 8, height: 8, channels: 4, background: { r, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  return sharp([await frame(255), await frame(0)], { join: { animated: true } })
    .webp({ loop: 0, delay: [100, 100] })
    .withExif({ IFD0: { Copyright: 'gps-holder-secret' } })
    .toBuffer();
}

async function apngWith(...extra: readonly Buffer[]): Promise<Buffer> {
  const still = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer();
  const pixels = pngChunkData(still, 'IDAT');
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(1, 0);
  return Buffer.concat([
    still.subarray(0, 8),
    pngChunk('IHDR', pngChunkData(still, 'IHDR')),
    pngChunk('acTL', animation),
    ...extra,
    pngChunk('fcTL', frameControl(0)),
    pngChunk('IDAT', pixels),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function animatedWebpRotatedWithSecret(): Promise<Buffer> {
  const frame = (r: number) =>
    sharp({ create: { width: 8, height: 4, channels: 4, background: { r, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  return sharp([await frame(255), await frame(0)], { join: { animated: true } })
    .webp({ loop: 0, delay: [100, 100] })
    .withExif({ IFD0: { Artist: 'gps-holder-secret', Orientation: '6' } })
    .toBuffer();
}

describe('isExifStrippable', () => {
  it.each([
    ['image/jpeg', true],
    ['image/jpg', true],
    ['image/png', true],
    ['image/webp', true],
    ['IMAGE/JPEG', true],
    ['image/gif', true],
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

  it('garde CHAQUE image d’un PNG animé et en retire les métadonnées (#10639)', async () => {
    const apng = await apngWithMetadata();
    expect(apng.toString('latin1')).toContain('gps-holder-secret');

    const stripped = await stripExifFromImageBuffer(apng, 'image/png');

    expect(pngChunkTypes(stripped)).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'IEND']);
    expect(stripped.toString('latin1')).not.toContain('gps-holder-secret');
    expect((await sharp(stripped).metadata()).format).toBe('png');
  });

  it('garde CHAQUE image d’un WEBP animé et en retire l’EXIF (#10639)', async () => {
    const animated = await animatedWebpWithExif();
    expect((await sharp(animated).metadata()).pages).toBe(2);

    const stripped = await stripExifFromImageBuffer(animated, 'image/webp');
    const after = await sharp(stripped).metadata();

    expect(after.pages).toBe(2);
    expect(after.delay).toEqual([100, 100]);
    expect(after.exif).toBeUndefined();
  });

  it('ne garde JAMAIS l’EXIF d’un WEBP animé qui porte une orientation (audit #10639)', async () => {
    const animated = await animatedWebpRotatedWithSecret();
    expect(animated.toString('latin1')).toContain('gps-holder-secret');

    const stripped = await stripExifFromImageBuffer(animated, 'image/webp');

    expect(stripped.toString('latin1')).not.toContain('gps-holder-secret');
    expect((await sharp(stripped).metadata()).pages).toBe(2);
  });

  it.each([
    ['un chunk privé', () => pngChunk('prVt', Buffer.from('gps-holder-secret', 'latin1'))],
    ['un manifeste C2PA', () => pngChunk('caBX', Buffer.from('gps-holder-secret', 'latin1'))],
    ['un EXIF ImageMagick', () => pngChunk('zxIf', Buffer.from('gps-holder-secret', 'latin1'))],
    ['un profil ICC nommé', () => pngChunk('iCCP', Buffer.from('gps-holder-secret\0\0', 'latin1'))],
  ])('ne garde d’un PNG animé que les chunks d’image : %s part (audit #10639)', async (_, extra) => {
    const apng = await apngWith(extra());

    const stripped = await stripExifFromImageBuffer(apng, 'image/png');

    expect(stripped.toString('latin1')).not.toContain('gps-holder-secret');
    expect(pngChunkTypes(stripped)).toEqual(['IHDR', 'acTL', 'fcTL', 'IDAT', 'IEND']);
  });

  it('ne garde rien de ce qui suit IEND dans un PNG animé (audit #10639)', async () => {
    const apng = Buffer.concat([await apngWith(), Buffer.from('gps-holder-secret', 'latin1')]);

    const stripped = await stripExifFromImageBuffer(apng, 'image/png');

    expect(stripped.toString('latin1')).not.toContain('gps-holder-secret');
  });

  it('ne rend d’un PNG animé MAL FORMÉ que ses chunks d’image valides, refermés (audit #10639)', async () => {
    const giant = Buffer.alloc(4);
    giant.writeUInt32BE(0x7fffffff);
    const apng = await apngWith(Buffer.concat([giant, Buffer.from('tEXtgps-holder-secret', 'latin1')]));

    const stripped = await stripExifFromImageBuffer(apng, 'image/png');

    expect(stripped.toString('latin1')).not.toContain('gps-holder-secret');
    expect(pngChunkTypes(stripped)).toEqual(['IHDR', 'acTL', 'IEND']);
  });

  it('lit en temps linéaire un PNG forgé de 200 000 chunks vides', async () => {
    const still = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png()
      .toBuffer();
    const filler = pngChunk('tEXt', Buffer.alloc(0));
    const forged = Buffer.concat([
      still.subarray(0, 8),
      pngChunk('IHDR', pngChunkData(still, 'IHDR')),
      pngChunk('acTL', Buffer.alloc(8)),
      ...Array.from({ length: 200_000 }, () => filler),
      pngChunk('IDAT', pngChunkData(still, 'IDAT')),
      pngChunk('IEND', Buffer.alloc(0)),
    ]);
    const started = Date.now();

    const stripped = await stripExifFromImageBuffer(forged, 'image/png');

    expect(Date.now() - started).toBeLessThan(2_000);
    expect(pngChunkTypes(stripped)).toEqual(['IHDR', 'acTL', 'IDAT', 'IEND']);
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

  it('rend le buffer INCHANGÉ pour un type non couvert (svg, autre) — le GIF est couvert depuis #11258', async () => {
    const pdfLike = Buffer.from('%PDF-1.4 not-an-image');
    const result = await stripExifFromImageBuffer(pdfLike, 'application/pdf');
    expect(result).toBe(pdfLike);

    const svgLike = Buffer.from('<svg></svg>');
    const resultSvg = await stripExifFromImageBuffer(svgLike, 'image/svg+xml');
    expect(resultSvg).toBe(svgLike);
  });
});
