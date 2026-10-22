/**
 * Retrait des métadonnées SANS perte de génération (#11258).
 *
 * Le retrait d'EXIF/GPS (#3627) ré-encodait chaque photo : JPEG en q80, profil
 * ICC jeté, WebP sans perte rendu avec perte, PNG à palette gonflé en RVB. Ces
 * témoins tiennent la loi inverse : les octets d'image ne bougent pas, seuls
 * les blocs de métadonnées partent, et le profil de couleur reste.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import sharp from 'sharp';
import { isExifStrippable, stripExifFromImageBuffer } from '../ExifStrip';

const SECRET = 'gps-holder-secret';
const XMP = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:creator="${SECRET}-xmp"/></rdf:RDF></x:xmpmeta>`;

const canvas = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } } });

type JpegSegment = { readonly marker: number; readonly start: number; readonly end: number };

function jpegHeaderSegments(buffer: Buffer): readonly JpegSegment[] {
  const walk = (offset: number, found: readonly JpegSegment[]): readonly JpegSegment[] => {
    const marker = buffer[offset + 1];
    const end = offset + 2 + buffer.readUInt16BE(offset + 2);
    const next = [...found, { marker, start: offset, end }];
    return marker === 0xda ? next : walk(end, next);
  };
  return walk(2, []);
}

function withoutSegments(buffer: Buffer, markers: readonly number[]): Buffer {
  const dropped = jpegHeaderSegments(buffer).filter((segment) => markers.includes(segment.marker));
  const kept = dropped.reduce<{ readonly parts: readonly Buffer[]; readonly from: number }>(
    (acc, segment) => ({ parts: [...acc.parts, buffer.subarray(acc.from, segment.start)], from: segment.end }),
    { parts: [], from: 0 },
  );
  return Buffer.concat([...kept.parts, buffer.subarray(kept.from)]);
}

async function jpegWithIccExifGpsXmp(): Promise<Buffer> {
  return canvas(40, 20)
    .withIccProfile('p3')
    .withExif({ IFD0: { Copyright: SECRET }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 51/1 24/1' } })
    .withXmp(XMP)
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function pixels(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).ensureAlpha().raw().toBuffer();
}

describe('stripExifFromImageBuffer — JPEG sans ré-encodage (#11258)', () => {
  it('rend les octets d’entrée moins les segments APP1 (EXIF et XMP) quand l’orientation vaut 1', async () => {
    const original = await jpegWithIccExifGpsXmp();
    expect(original.toString('latin1')).toContain(SECRET);

    const stripped = await stripExifFromImageBuffer(original, 'image/jpeg');

    expect(stripped.equals(withoutSegments(original, [0xe1]))).toBe(true);
    expect(stripped.toString('latin1')).not.toContain(SECRET);
  });

  it('garde le profil ICC et retire EXIF, GPS et XMP', async () => {
    const original = await jpegWithIccExifGpsXmp();

    const after = await sharp(await stripExifFromImageBuffer(original, 'image/jpeg')).metadata();

    expect(after.icc).toBeDefined();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
  });

  it('retire tout ce qui suit la fin de l’image (images MPF annexées et leur EXIF)', async () => {
    const appended = await canvas(8, 8).withExif({ IFD0: { Copyright: `${SECRET}-mpf` } }).jpeg().toBuffer();
    const original = Buffer.concat([await jpegWithIccExifGpsXmp(), appended]);

    const stripped = await stripExifFromImageBuffer(original, 'image/jpeg');

    expect(stripped.toString('latin1')).not.toContain(SECRET);
    expect(stripped.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
  });

  it('retire les commentaires et les blocs IPTC, garde les pixels à l’identique', async () => {
    const base = await canvas(16, 16).jpeg({ quality: 95 }).toBuffer();
    const comment = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 2 + SECRET.length]), Buffer.from(SECRET, 'latin1')]);
    const iptc = Buffer.concat([Buffer.from([0xff, 0xed, 0x00, 2 + SECRET.length]), Buffer.from(SECRET, 'latin1')]);
    const original = Buffer.concat([base.subarray(0, 2), comment, iptc, base.subarray(2)]);

    const stripped = await stripExifFromImageBuffer(original, 'image/jpeg');

    expect(stripped.equals(base)).toBe(true);
  });

  it('applique une orientation ≠ 1 en gardant le profil ICC', async () => {
    const rotated = await canvas(100, 50).withIccProfile('p3').jpeg().withMetadata({ orientation: 6 }).toBuffer();

    const after = await sharp(await stripExifFromImageBuffer(rotated, 'image/jpeg')).metadata();

    expect([after.width, after.height]).toEqual([50, 100]);
    expect(after.icc).toBeDefined();
    expect(after.exif).toBeUndefined();
  });
});

describe('stripExifFromImageBuffer — WebP et PNG sans perte (#11258)', () => {
  it('garde un WebP sans perte sans perte : mêmes pixels, ICC conservé, EXIF absent', async () => {
    const original = await canvas(24, 12).withIccProfile('p3').withExif({ IFD0: { Copyright: SECRET } })
      .webp({ lossless: true }).toBuffer();

    const stripped = await stripExifFromImageBuffer(original, 'image/webp');
    const after = await sharp(stripped).metadata();

    expect(stripped.includes(Buffer.from('VP8L'))).toBe(true);
    expect((await pixels(stripped)).equals(await pixels(original))).toBe(true);
    expect(after.icc).toBeDefined();
    expect(after.exif).toBeUndefined();
    expect(stripped.toString('latin1')).not.toContain(SECRET);
  });

  it('pivote un WebP sans perte orienté sans le rendre avec perte', async () => {
    const original = await canvas(24, 12).webp({ lossless: true }).withMetadata({ orientation: 6 }).toBuffer();

    const stripped = await stripExifFromImageBuffer(original, 'image/webp');
    const after = await sharp(stripped).metadata();

    expect([after.width, after.height]).toEqual([12, 24]);
    expect(stripped.includes(Buffer.from('VP8L'))).toBe(true);
    expect(after.exif).toBeUndefined();
  });

  it('ne gonfle pas un PNG à palette : il reste à palette, pas plus lourd, ICC conservé', async () => {
    const original = await canvas(32, 32).withIccProfile('p3').withExif({ IFD0: { Copyright: SECRET } })
      .png({ palette: true }).toBuffer();
    expect((await sharp(original).metadata()).isPalette).toBe(true);

    const stripped = await stripExifFromImageBuffer(original, 'image/png');
    const after = await sharp(stripped).metadata();

    expect(after.isPalette).toBe(true);
    expect(stripped.length).toBeLessThan(original.length);
    expect(after.icc).toBeDefined();
    expect(after.exif).toBeUndefined();
    expect((await pixels(stripped)).equals(await pixels(original))).toBe(true);
  });
});

function gifBlock(label: number, ...subBlocks: readonly Buffer[]): Buffer {
  return Buffer.concat([
    Buffer.from([0x21, label]),
    ...subBlocks.map((block) => Buffer.concat([Buffer.from([block.length]), block])),
    Buffer.from([0x00]),
  ]);
}

describe('stripExifFromImageBuffer — GIF et HEIC sans ré-encodage (#11258, contre-analyse W4)', () => {
  it.each(['image/gif', 'image/heic', 'image/heif', 'image/avif'])('%s est couvert', (mimeType) => {
    expect(isExifStrippable(mimeType)).toBe(true);
  });

  it('retire d’un GIF ses commentaires et blocs XMP, garde ses octets d’image', async () => {
    const base = await canvas(20, 10).gif().toBuffer();
    const header = 13 + 3 * 2 ** ((base[10] & 0x07) + 1);
    const comment = gifBlock(0xfe, Buffer.from(SECRET, 'latin1'));
    const xmp = gifBlock(0xff, Buffer.from('XMP DataXMP', 'latin1'), Buffer.from(`${SECRET}-xmp`, 'latin1'));
    const original = Buffer.concat([base.subarray(0, header), comment, xmp, base.subarray(header), Buffer.from(SECRET)]);

    const stripped = await stripExifFromImageBuffer(original, 'image/gif');

    expect(stripped.equals(base)).toBe(true);
  });

  it('garde le profil de couleur d’un GIF (extension ICCRGBG1012)', async () => {
    const base = await canvas(20, 10).gif().toBuffer();
    const header = 13 + 3 * 2 ** ((base[10] & 0x07) + 1);
    const icc = gifBlock(0xff, Buffer.from('ICCRGBG1012', 'latin1'), Buffer.from('icc-profile-bytes', 'latin1'));
    const original = Buffer.concat([base.subarray(0, header), icc, base.subarray(header)]);

    const stripped = await stripExifFromImageBuffer(original, 'image/gif');

    expect(stripped.equals(original)).toBe(true);
  });

  it('remet à zéro l’item EXIF d’un HEIF sans toucher aux pixels ni aux décalages', async () => {
    const original = await canvas(20, 10).withExif({ IFD0: { Copyright: SECRET } }).heif({ compression: 'av1', lossless: true })
      .toBuffer();
    expect(original.toString('latin1')).toContain(SECRET);

    const stripped = await stripExifFromImageBuffer(original, 'image/heic');

    expect(stripped.length).toBe(original.length);
    expect(stripped.toString('latin1')).not.toContain(SECRET);
    expect((await pixels(stripped)).equals(await pixels(original))).toBe(true);
  });

  it('rend inchangé un HEIC dont la structure ne se lit pas', async () => {
    const garbage = Buffer.from('not-an-isobmff-file');

    expect((await stripExifFromImageBuffer(garbage, 'image/heic')).equals(garbage)).toBe(true);
  });
});

describe('stripExifFromImageBuffer — une structure abîmée perd quand même ses métadonnées (#11258)', () => {
  it('referme un JPEG tronqué (sans fin d’image) au lieu de laisser partir son EXIF', async () => {
    const complete = await jpegWithIccExifGpsXmp();
    const truncated = complete.subarray(0, complete.length - 2);

    const stripped = await stripExifFromImageBuffer(truncated, 'image/jpeg');

    expect(stripped.toString('latin1')).not.toContain(SECRET);
    expect(stripped.equals(withoutSegments(complete, [0xe1]))).toBe(true);
  });

  it('retire l’EXIF d’un JPEG tronqué ORIENTÉ même quand sa rotation échoue', async () => {
    const complete = await canvas(64, 32).withExif({ IFD0: { Copyright: SECRET } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const truncated = complete.subarray(0, complete.length - 2);

    const stripped = await stripExifFromImageBuffer(truncated, 'image/jpeg');

    expect(stripped.toString('latin1')).not.toContain(SECRET);
    expect(stripped.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
  });

  it('ré-encode un PNG dont un chunk incohérent précède les pixels, au lieu de le rendre vide', async () => {
    const original = await canvas(16, 16).withExif({ IFD0: { Copyright: SECRET } }).png().toBuffer();
    const headerEnd = 8 + 25;
    const lyingGamma = Buffer.from([0, 0, 0, 5, 0x67, 0x41, 0x4d, 0x41, 0, 0, 0xb1, 0x8f, 0, 0, 0, 0, 0]);
    const odd = Buffer.concat([original.subarray(0, headerEnd), lyingGamma, original.subarray(headerEnd)]);

    const stripped = await stripExifFromImageBuffer(odd, 'image/png');

    expect((await pixels(stripped)).equals(await pixels(original))).toBe(true);
    expect(stripped.toString('latin1')).not.toContain(SECRET);
  });

  it('retire la vignette d’un segment JFIF, image de la photo d’avant toute retouche', async () => {
    const base = await canvas(16, 16).jpeg().toBuffer();
    const thumbnail = Buffer.alloc(2 * 2 * 3, 0x41);
    const jfif = Buffer.concat([Buffer.from('JFIF\0', 'latin1'), Buffer.from([1, 2, 0, 0, 1, 0, 1, 2, 2]), thumbnail]);
    const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, jfif.length + 2]), jfif]);
    const headerSegments = jpegHeaderSegments(base);
    const original = Buffer.concat([base.subarray(0, 2), app0, base.subarray(headerSegments[0].marker === 0xe0 ? headerSegments[0].end : 2)]);

    const stripped = await stripExifFromImageBuffer(original, 'image/jpeg');

    expect(stripped.includes(thumbnail)).toBe(false);
    expect((await pixels(stripped)).equals(await pixels(original))).toBe(true);
  });
});
