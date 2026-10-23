/**
 * Une photo HDR garde sa carte de gain après le retrait de ses métadonnées
 * (#11840) — sur des fichiers RÉELS (fixtures/gain-map/NOTICE).
 *
 * Le décodeur de référence est libultrahdr, embarqué par sharp
 * (`sharp.versions.uhdr`) : `withGainMap()` applique la carte de gain et rend
 * l'image HDR en flottants. Le rendu HDR d'après le retrait doit être
 * identique, au bit près, à celui de l'original — et le GPS, l'EXIF et le XMP
 * hors carte de gain doivent être partis, de l'image principale comme de la
 * carte. (Les typages de sharp 0.35.5 omettent `withGainMap`, que la
 * bibliothèque expose : d'où `GainMapAware`.)
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import sharp, { type Sharp } from 'sharp';
import { stripExifFromImageBuffer } from '../ExifStrip';

const FIXTURES = join(__dirname, 'fixtures', 'gain-map');
const fixture = (name: string): Buffer => readFileSync(join(FIXTURES, name));

const SECRET = 'gps-holder-secret';
const APP1 = 0xe1;

type Segment = { readonly marker: number; readonly start: number; readonly end: number };

function headerSegments(buffer: Buffer, from: number): readonly Segment[] {
  const walk = (offset: number, found: readonly Segment[]): readonly Segment[] => {
    const marker = buffer[offset + 1];
    const end = offset + 2 + buffer.readUInt16BE(offset + 2);
    const next = [...found, { marker, start: offset, end }];
    return marker === 0xda ? next : walk(end, next);
  };
  return walk(from + 2, []);
}

function imageStarts(buffer: Buffer): readonly number[] {
  const starts: number[] = [];
  let at = buffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  while (at !== -1) {
    starts.push(at);
    at = buffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]), at + 3);
  }
  return starts;
}

function segment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt8(0xff, 0);
  header.writeUInt8(marker, 1);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

async function exifWithGps(): Promise<Buffer> {
  const carrier = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000' } })
    .withExif({ IFD0: { Copyright: SECRET }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 24/1' } })
    .jpeg()
    .toBuffer();
  const exif = headerSegments(carrier, 0).find((s) => s.marker === APP1);
  if (!exif) throw new Error('fixture: no EXIF');
  return carrier.subarray(exif.start, exif.end);
}

const XMP_SECRET = segment(
  APP1,
  Buffer.from(
    `http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="${SECRET}-xmp"/></rdf:RDF></x:xmpmeta>`,
    'latin1',
  ),
);

/** Glisse un EXIF à GPS et un XMP nominatif dans CHAQUE image du fichier, juste avant ses tables. */
async function withSecretsInEveryImage(buffer: Buffer): Promise<Buffer> {
  const exif = await exifWithGps();
  const cuts = imageStarts(buffer).map((start) => headerSegments(buffer, start).find((s) => s.marker === 0xdb)?.start ?? start + 2);
  const parts = cuts.reduce<{ readonly parts: readonly Buffer[]; readonly from: number }>(
    (acc, cut) => ({ parts: [...acc.parts, buffer.subarray(acc.from, cut), exif, XMP_SECRET], from: cut }),
    { parts: [], from: 0 },
  );
  return Buffer.concat([...parts.parts, buffer.subarray(parts.from)]);
}

type GainMapAware = Sharp & { readonly withGainMap: () => Sharp };

async function hdrRendition(buffer: Buffer): Promise<Buffer> {
  return (sharp(buffer) as GainMapAware).withGainMap().raw({ depth: 'float' }).toBuffer();
}

async function sdrRendition(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).raw().toBuffer();
}

const JPEG_FIXTURES = [
  ['ISO 21496-1 (libultrahdr)', 'iso-21496-gain-map.jpg'],
  ['Apple, marge HDR dans le XMP de la carte', 'apple-gain-map-xmp-headroom.jpg'],
  ['Apple, marge HDR dans le MakerNote de l’EXIF', 'apple-gain-map-makernote-headroom.jpg'],
] as const;

describe('stripExifFromImageBuffer — carte de gain HDR d’un JPEG (#11840)', () => {
  it.each(JPEG_FIXTURES)('%s : le fichier de référence porte bien une carte de gain qui change le rendu', async (_label, name) => {
    const original = fixture(name);

    const [hdr, withoutGainMap] = await Promise.all([
      hdrRendition(original),
      hdrRendition(await sdrRenditionAsJpeg(original)),
    ]);

    expect((await sharp(original).metadata()).gainMap).toBeDefined();
    expect(hdr.equals(withoutGainMap)).toBe(false);
  });

  it.each(JPEG_FIXTURES)('%s : le rendu HDR est identique avant et après le retrait', async (_label, name) => {
    const original = fixture(name);

    const stripped = await stripExifFromImageBuffer(await withSecretsInEveryImage(original), 'image/jpeg');

    expect((await sharp(stripped).metadata()).gainMap).toBeDefined();
    expect((await hdrRendition(stripped)).equals(await hdrRendition(original))).toBe(true);
    expect((await sdrRendition(stripped)).equals(await sdrRendition(original))).toBe(true);
  });

  it.each(JPEG_FIXTURES)('%s : ni GPS, ni EXIF nominatif, ni XMP hors carte de gain, dans aucune des deux images', async (_label, name) => {
    const original = await withSecretsInEveryImage(fixture(name));
    expect(original.toString('latin1')).toContain(SECRET);

    const stripped = await stripExifFromImageBuffer(original, 'image/jpeg');
    const text = stripped.toString('latin1');
    const metadata = await sharp(stripped).metadata();
    const gainMap = metadata.gainMap?.image ?? Buffer.alloc(0);

    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('iPhone');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('dc:creator');
    expect(gainMap.toString('latin1')).not.toContain(SECRET);
    expect((await sharp(gainMap).metadata()).exif).toBeUndefined();
  });

  it('une image annexée qui n’est PAS une carte de gain part toujours, avec son EXIF', async () => {
    const appended = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123' } })
      .withExif({ IFD0: { Copyright: `${SECRET}-annexe` } })
      .jpeg()
      .toBuffer();
    const original = Buffer.concat([fixture('iso-21496-gain-map.jpg'), appended]);

    const stripped = await stripExifFromImageBuffer(original, 'image/jpeg');

    expect(stripped.toString('latin1')).not.toContain(`${SECRET}-annexe`);
    expect((await hdrRendition(stripped)).equals(await hdrRendition(fixture('iso-21496-gain-map.jpg')))).toBe(true);
  });
});

describe('stripExifFromImageBuffer — carte de gain HDR d’une photo orientée (#11840)', () => {
  it('une photo HDR d’orientation 6 est redressée SANS perdre sa carte de gain', async () => {
    const original = fixture('iso-21496-gain-map.jpg');
    const before = await sharp(original).metadata();
    const carrier = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000' } })
      .withExif({ IFD0: { Copyright: SECRET } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const exif = headerSegments(carrier, 0).find((s) => s.marker === APP1);
    if (!exif) throw new Error('fixture: no EXIF');
    const oriented = Buffer.concat([original.subarray(0, 2), carrier.subarray(exif.start, exif.end), original.subarray(2)]);
    expect((await sharp(oriented).metadata()).orientation).toBe(6);

    const stripped = await stripExifFromImageBuffer(oriented, 'image/jpeg');
    const after = await sharp(stripped).metadata();

    expect(after.gainMap).toBeDefined();
    expect([after.width, after.height]).toEqual([before.height, before.width]);
    expect(stripped.toString('latin1')).not.toContain(SECRET);
  });
});

describe('stripExifFromImageBuffer — carte de gain HDR d’un HEIF (#11840)', () => {
  it('un HEIF ISO 21496-1 (item `tmap` et image de la carte) ressort octet pour octet hors métadonnées', async () => {
    const original = fixture('iso-21496-gain-map.heic');

    const stripped = await stripExifFromImageBuffer(original, 'image/heic');

    expect(stripped.length).toBe(original.length);
    expect(stripped.includes(Buffer.from('tmap', 'latin1'))).toBe(true);
    expect(stripped.equals(original)).toBe(true);
  });
});

async function sdrRenditionAsJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).jpeg({ quality: 100 }).toBuffer();
}
