/**
 * Retrait des métadonnées d'un JPEG HDR qui GARDE sa carte de gain (#11840).
 *
 * Un JPEG Ultra HDR (Android 14+), ISO 21496-1 ou HDR d'iPhone est une image
 * SDR suivie, après sa fin d'image, d'une seconde image JPEG : la carte de
 * gain, qui dit de combien éclairer chaque zone sur un écran HDR. La liste
 * blanche de `jpeg-segments.ts` jette tout ce qui suit la fin d'image — et
 * donc l'effet HDR (verdict du porteur, #11247 : « HDR conservé »).
 *
 * Ici, quand une image annexée EST une carte de gain (XMP `hdrgm:` ou
 * `HDRGainMap:`, ou segment APP2 ISO 21496-1), on la garde, passée elle aussi
 * par la liste blanche, et on RECONSTRUIT ce qui la relie à l'image
 * principale : le répertoire MPF (tailles et décalages recalculés), le XMP
 * `GContainer` d'un Ultra HDR (`Item:Length` recalculé), le XMP de la carte
 * réduit à ses propriétés de tonalité (`gain-map-xmp.ts`) et, pour un iPhone,
 * la marge HDR seule de son MakerNote (`apple-hdr-headroom.ts`). Les segments
 * ISO 21496-1 passent tels quels : ils ne portent que des nombres de tonalité.
 * Toute autre image annexée (vignette MPF, carte de profondeur) part, avec son
 * EXIF. Aucun octet d'image n'est réencodé.
 */
import { appleHeadroomExifSegment, appleHeadroomTags, type AppleHeadroomTag } from './apple-hdr-headroom';
import { gainMapProperties, gainMapXmpSegment, xmpPacketOf, type GainMapProperty } from './gain-map-xmp';
import { readJpegImage, type DroppedSegment, type JpegImage } from './jpeg-segments';

const APP0 = 0xe0;
const APP1 = 0xe1;
const APP2 = 0xe2;
const ISO_21496_SIGNATURE = Buffer.from('urn:iso:std:iso:ts:21496:-1\0', 'latin1');
const SOI_PREFIX = Buffer.from([0xff, 0xd8, 0xff]);
const MPF_SEGMENT_LENGTH = 90;
const MP_ENTRY_PRIMARY = 0x20030000;
const MP_ENTRY_JPEG = 0x00000000;
const MPF_TIFF_OFFSET_IN_SEGMENT = 8;

type GainMapImage = { readonly image: JpegImage; readonly iso: readonly Buffer[]; readonly xmp: readonly GainMapProperty[] };

const isIso21496 = (segment: DroppedSegment): boolean =>
  segment.marker === APP2 && segment.bytes.subarray(4, 4 + ISO_21496_SIGNATURE.length).equals(ISO_21496_SIGNATURE);

const isoSegments = (image: JpegImage): readonly Buffer[] => image.dropped.filter(isIso21496).map((segment) => segment.bytes);

function xmpProperties(image: JpegImage): readonly GainMapProperty[] {
  return image.dropped
    .filter((segment) => segment.marker === APP1)
    .map((segment) => xmpPacketOf(segment.bytes))
    .filter((packet): packet is string => packet !== null)
    .flatMap(gainMapProperties);
}

function asGainMap(image: JpegImage): GainMapImage | null {
  const iso = isoSegments(image);
  const xmp = xmpProperties(image);
  const describesGain = xmp.some((property) => property.prefix === 'hdrgm' || property.prefix === 'HDRGainMap');
  return iso.length > 0 || describesGain ? { image, iso, xmp } : null;
}

function findGainMap(buffer: Buffer, from: number): GainMapImage | null {
  let at = buffer.indexOf(SOI_PREFIX, from);
  while (at !== -1) {
    const image = readJpegImage(buffer, at);
    const gainMap = image === null ? null : asGainMap(image);
    if (gainMap !== null) return gainMap;
    at = buffer.indexOf(SOI_PREFIX, image === null ? at + SOI_PREFIX.length : Math.max(image.end, at + SOI_PREFIX.length));
  }
  return null;
}

function headroomOf(primary: JpegImage): readonly AppleHeadroomTag[] {
  return primary.dropped
    .filter((segment) => segment.marker === APP1)
    .map((segment) => appleHeadroomTags(segment.bytes))
    .find((tags) => tags.length > 0) ?? [];
}

type Split = { readonly lead: readonly Buffer[]; readonly tail: readonly Buffer[] };

const byteLength = (parts: readonly Buffer[]): number => parts.reduce((sum, part) => sum + part.length, 0);

/** Coupe l'image après son SOI, et après l'APP0 JFIF qui doit rester premier. */
function splitAfterSoi(image: JpegImage): Split {
  const [soi, ...rest] = image.kept;
  const jfif = rest.length > 0 && rest[0][1] === APP0 ? 1 : 0;
  return { lead: [soi, ...rest.slice(0, jfif)], tail: rest.slice(jfif) };
}

function withHeaderSegments(image: JpegImage, segments: readonly Buffer[]): Buffer {
  const { lead, tail } = splitAfterSoi(image);
  return Buffer.concat([...lead, ...segments, ...tail]);
}

function mpfSegment(primaryLength: number, gainMapLength: number, gainMapOffset: number): Buffer {
  const segment = Buffer.alloc(MPF_SEGMENT_LENGTH);
  segment.writeUInt16BE(0xffe2, 0);
  segment.writeUInt16BE(MPF_SEGMENT_LENGTH - 2, 2);
  segment.write('MPF\0', 4, 'latin1');
  const tiff = segment.subarray(MPF_TIFF_OFFSET_IN_SEGMENT);
  tiff.write('MM\0*', 0, 'latin1');
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(3, 8);
  const entry = (index: number, tag: number, type: number, count: number, value: Buffer | number): void => {
    const base = 10 + index * 12;
    tiff.writeUInt16BE(tag, base);
    tiff.writeUInt16BE(type, base + 2);
    tiff.writeUInt32BE(count, base + 4);
    if (typeof value === 'number') tiff.writeUInt32BE(value, base + 8);
    else value.copy(tiff, base + 8);
  };
  const entriesAt = 10 + 3 * 12 + 4;
  entry(0, 0xb000, 7, 4, Buffer.from('0100', 'latin1'));
  entry(1, 0xb001, 4, 1, 2);
  entry(2, 0xb002, 7, 32, entriesAt);
  tiff.writeUInt32BE(0, 10 + 3 * 12);
  tiff.writeUInt32BE(MP_ENTRY_PRIMARY, entriesAt);
  tiff.writeUInt32BE(primaryLength, entriesAt + 4);
  tiff.writeUInt32BE(0, entriesAt + 8);
  tiff.writeUInt32BE(MP_ENTRY_JPEG, entriesAt + 16);
  tiff.writeUInt32BE(gainMapLength, entriesAt + 20);
  tiff.writeUInt32BE(gainMapOffset, entriesAt + 24);
  return segment;
}

function primaryWithMpf(primary: JpegImage, before: readonly Buffer[], gainMapLength: number): Buffer {
  const { lead, tail } = splitAfterSoi(primary);
  const mpfAt = byteLength(lead) + byteLength(before);
  const primaryLength = mpfAt + MPF_SEGMENT_LENGTH + byteLength(tail);
  const mpf = mpfSegment(primaryLength, gainMapLength, primaryLength - (mpfAt + MPF_TIFF_OFFSET_IN_SEGMENT));
  return Buffer.concat([...lead, ...before, mpf, ...tail]);
}

/**
 * Rend le JPEG sans métadonnées, carte de gain comprise quand il en porte une ;
 * `null` quand l'image principale ne se lit pas (l'appelant décide).
 */
export function stripJpegKeepingGainMap(buffer: Buffer): Buffer | null {
  const primary = readJpegImage(buffer, 0);
  if (primary === null) return null;
  const gainMap = findGainMap(buffer, primary.end);
  if (gainMap === null) return Buffer.concat(primary.kept);

  const gainMapXmp = gainMap.xmp.length > 0 ? [gainMapXmpSegment(gainMap.xmp)] : [];
  const gainMapBytes = withHeaderSegments(gainMap.image, [...gainMapXmp, ...gainMap.iso]);

  const primaryXmp = xmpProperties(primary).filter((property) => property.prefix === 'hdrgm');
  const container = primaryXmp.length > 0
    ? [gainMapXmpSegment(primaryXmp, [{ semantic: 'Primary' }, { semantic: 'GainMap', length: gainMapBytes.length }])]
    : [];
  const headroom = headroomOf(primary);
  const appleExif = headroom.length > 0 ? [appleHeadroomExifSegment(headroom)] : [];
  const before = [...container, ...appleExif, ...isoSegments(primary)];
  return Buffer.concat([primaryWithMpf(primary, before, gainMapBytes.length), gainMapBytes]);
}
