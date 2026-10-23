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

/** Retire les segments ISO 21496-1 de chaque image, en recalant le MPF et le GContainer. */
function withoutIso21496(buffer: Buffer): Buffer {
  const iso = Buffer.from('urn:iso:std:iso:ts:21496:-1\0', 'latin1');
  const images = imageStarts(buffer).map((start, i, all) => buffer.subarray(start, all[i + 1] ?? buffer.length));
  const [primary, gainMap] = images.map((image) =>
    Buffer.concat(
      headerSegments(image, 0)
        .filter((s) => !(s.marker === 0xe2 && image.subarray(s.start + 4, s.start + 4 + iso.length).equals(iso)))
        .reduce<readonly Buffer[]>((parts, s, i, kept) => [...parts, image.subarray(s.start, s.end), ...(i === kept.length - 1 ? [image.subarray(s.end)] : [])], [image.subarray(0, 2)]),
    ),
  );
  const mpfAt = primary.indexOf(Buffer.from('MPF\0', 'latin1'));
  const relinked = Buffer.from(primary);
  const tiff = mpfAt + 4;
  const entries = tiff + relinked.readUInt32BE(tiff + 4) + 2 + 3 * 12 + 4;
  relinked.writeUInt32BE(primary.length, entries + 4);
  relinked.writeUInt32BE(gainMap.length, entries + 20);
  relinked.writeUInt32BE(primary.length - tiff, entries + 24);
  const container = relinked.toString('latin1').replace(/Item:Length="\d+"/, `Item:Length="${gainMap.length}"`);
  return Buffer.concat([Buffer.from(container, 'latin1'), gainMap]);
}

async function hdrRendition(buffer: Buffer): Promise<Buffer> {
  return (sharp(buffer) as GainMapAware).withGainMap().raw({ depth: 'float' }).toBuffer();
}

async function sdrRendition(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).raw().toBuffer();
}

const JPEG_FIXTURES = [
  ['Ultra HDR v1 : XMP hdrgm, GContainer et ISO 21496-1 (libultrahdr)', 'ultra-hdr-xmp-and-iso.jpg'],
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

  it('un Ultra HDR décrit par le SEUL XMP hdrgm (Android 14) garde sa carte et son rendu HDR', async () => {
    const xmpOnly = withoutIso21496(fixture('ultra-hdr-xmp-and-iso.jpg'));
    expect(xmpOnly.includes(Buffer.from('urn:iso:std:iso:ts:21496', 'latin1'))).toBe(false);
    expect((await sharp(xmpOnly).metadata()).gainMap).toBeDefined();

    const stripped = await stripExifFromImageBuffer(await withSecretsInEveryImage(xmpOnly), 'image/jpeg');

    expect((await hdrRendition(stripped)).equals(await hdrRendition(xmpOnly))).toBe(true);
    expect(stripped.toString('latin1')).not.toContain(SECRET);
    expect(stripped.toString('latin1')).toContain('Item:Length');
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

  it('un HEIF d’iPhone garde la marge HDR de son MakerNote et le XMP de sa carte, sans GPS ni nom, octets d’image intacts', async () => {
    const original = await appleLikeHeif();
    expect(original.toString('latin1')).toContain(SECRET);

    const stripped = await stripExifFromImageBuffer(original, 'image/heic');
    const text = stripped.toString('utf8');

    expect(stripped.length).toBe(original.length);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('iPhone');
    expect(text).toContain('<HDRGainMap:HDRGainMapHeadroom>4.532783</HDRGainMap:HDRGainMapHeadroom>');
    expect(text).toContain('urn:com:apple:photo:2020:aux:hdrgainmap');
    expect(stripped.includes(Buffer.concat([Buffer.from('Apple iOS\0\0\x01MM', 'latin1')]))).toBe(true);
    expect(stripped.includes(rational(1093, 1000))).toBe(true);
    expect(stripped.includes(rational(-77, 100000))).toBe(true);
    expect((await sharp(stripped).raw().toBuffer()).equals(await sharp(original).raw().toBuffer())).toBe(true);
  });
});

const APPLE_GAIN_MAP_XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:apdi="http://ns.apple.com/pixeldatainfo/1.0/" xmlns:HDRGainMap="http://ns.apple.com/HDRGainMap/1.0/" xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="48,51.4N" xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="${SECRET}-xmp"><apdi:AuxiliaryImageType>urn:com:apple:photo:2020:aux:hdrgainmap</apdi:AuxiliaryImageType><HDRGainMap:HDRGainMapVersion>65536</HDRGainMap:HDRGainMapVersion><HDRGainMap:HDRGainMapHeadroom>4.532783</HDRGainMap:HDRGainMapHeadroom></rdf:Description></rdf:RDF></x:xmpmeta>`;

/** Un TIFF EXIF d'iPhone : IFD0 → IFD Exif → MakerNote `Apple iOS` (balises 33 et 48), suivi de GPS en clair. */
function appleExifTiff(): Buffer {
  const makerHeader = Buffer.from([0x41, 0x70, 0x70, 0x6c, 0x65, 0x20, 0x69, 0x4f, 0x53, 0, 0, 1, 0x4d, 0x4d]);
  const makerIfd = Buffer.alloc(2 + 2 * 12 + 4 + 16);
  makerIfd.writeUInt16BE(2, 0);
  [[33, 0], [48, 1]].forEach(([tag, i]) => {
    makerIfd.writeUInt16BE(tag, 2 + i * 12);
    makerIfd.writeUInt16BE(10, 4 + i * 12);
    makerIfd.writeUInt32BE(1, 6 + i * 12);
    makerIfd.writeUInt32BE(makerHeader.length + 30 + i * 8, 10 + i * 12);
  });
  makerIfd.writeInt32BE(1093, 30);
  makerIfd.writeUInt32BE(1000, 34);
  makerIfd.writeInt32BE(-77, 38);
  makerIfd.writeUInt32BE(100000, 42);
  const head = Buffer.alloc(8 + 18 + 18);
  head.write('MM\0*', 0, 'latin1');
  head.writeUInt32BE(8, 4);
  head.writeUInt16BE(1, 8);
  head.writeUInt16BE(0x8769, 10);
  head.writeUInt16BE(4, 12);
  head.writeUInt32BE(1, 14);
  head.writeUInt32BE(26, 18);
  head.writeUInt16BE(1, 26);
  head.writeUInt16BE(0x927c, 28);
  head.writeUInt16BE(7, 30);
  head.writeUInt32BE(makerHeader.length + makerIfd.length, 32);
  head.writeUInt32BE(44, 36);
  return Buffer.concat([head, makerHeader, makerIfd, Buffer.from(`GPS ${SECRET} iPhone 15 Pro`, 'latin1')]);
}

/** Un HEIF dont l'item EXIF porte la marge HDR d'un iPhone et l'item XMP celui de sa carte de gain, réécrits EN PLACE. */
async function appleLikeHeif(): Promise<Buffer> {
  const padding = 'x'.repeat(1400);
  const base = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#c82850' } })
    .withExif({ IFD0: { Copyright: padding } })
    .withXmp(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><!--${padding}--></x:xmpmeta>`)
    .heif({ compression: 'av1', lossless: true })
    .toBuffer();
  const heif = Buffer.from(base);
  const tiffAt = [heif.indexOf(Buffer.from('MM\0*', 'latin1')), heif.indexOf(Buffer.from('II*\0', 'latin1'))].filter((at) => at >= 0)[0];
  const tiffEnd = heif.indexOf(Buffer.from(padding, 'latin1'), tiffAt) + padding.length;
  heif.fill(0, tiffAt, tiffEnd);
  appleExifTiff().copy(heif, tiffAt);
  const xmpAt = heif.indexOf(Buffer.from('<x:xmpmeta', 'latin1'));
  const xmpEnd = heif.indexOf(Buffer.from('</x:xmpmeta>', 'latin1'), xmpAt) + '</x:xmpmeta>'.length;
  heif.fill(0x20, xmpAt, xmpEnd);
  Buffer.from(APPLE_GAIN_MAP_XMP, 'utf8').copy(heif, xmpAt);
  return heif;
}

const rational = (numerator: number, denominator: number): Buffer => {
  const out = Buffer.alloc(8);
  out.writeInt32BE(numerator, 0);
  out.writeUInt32BE(denominator, 4);
  return out;
};

async function sdrRenditionAsJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).jpeg({ quality: 100 }).toBuffer();
}
