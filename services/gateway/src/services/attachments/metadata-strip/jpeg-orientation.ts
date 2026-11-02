/**
 * Une photo JPEG orientée redressée SANS génération perdue (#11841).
 *
 * L'image principale pivote par `jpegtran` (coefficients DCT permutés, tables
 * de quantification d'origine). Sa carte de gain HDR, quand elle en porte une
 * (#11840), pivote avec elle : sans perte si ses dimensions le permettent,
 * sinon réencodée SEULE en qualité 95 — elle est une donnée auxiliaire basse
 * définition, l'image que l'on voit reste intacte — et ses segments de
 * métadonnées d'origine (ISO 21496-1, XMP, ICC) lui sont rendus pour que la
 * liste blanche les retrouve.
 *
 * Rend `null` quand l'image principale ne peut pas pivoter sans perte (bord
 * hors de la grille des blocs, `jpegtran` absent) : `ExifStrip` retombe alors
 * sur son réencodage fidèle. Le résultat garde ses métadonnées : c'est
 * `stripJpegKeepingGainMap` qui les trie ensuite.
 */
import sharp from 'sharp';
import { findGainMap } from './jpeg-gain-map';
import { readJpegImage } from './jpeg-segments';
import { losslesslyOriented, runJpegtran, type JpegtranRunner } from './jpegtran';

const MARKER = 0xff;
const SOS = 0xda;
const GAIN_MAP_QUALITY = 95;

const isApp = (marker: number): boolean => marker >= 0xe0 && marker <= 0xef;

type Header = { readonly apps: readonly Buffer[]; readonly others: readonly Buffer[]; readonly scanAt: number };

function header(jpeg: Buffer): Header {
  const apps: Buffer[] = [];
  const others: Buffer[] = [];
  let offset = 2;
  while (offset + 4 <= jpeg.length && jpeg[offset] === MARKER && jpeg[offset + 1] !== SOS) {
    const end = offset + 2 + jpeg.readUInt16BE(offset + 2);
    (isApp(jpeg[offset + 1]) ? apps : others).push(jpeg.subarray(offset, end));
    offset = end;
  }
  return { apps, others, scanAt: offset };
}

function orientationExif(orientation: number): Buffer {
  const segment = Buffer.alloc(4 + 6 + 8 + 2 + 12 + 4);
  segment.writeUInt16BE(0xffe1, 0);
  segment.writeUInt16BE(segment.length - 2, 2);
  segment.write('Exif\0\0', 4, 'latin1');
  segment.write('MM\0*', 10, 'latin1');
  segment.writeUInt32BE(8, 14);
  segment.writeUInt16BE(1, 18);
  segment.writeUInt16BE(0x0112, 20);
  segment.writeUInt16BE(3, 22);
  segment.writeUInt32BE(1, 24);
  segment.writeUInt16BE(orientation, 28);
  return segment;
}

async function reencodedGainMap(gainMap: Buffer, orientation: number): Promise<Buffer> {
  const source = header(gainMap);
  const tagged = Buffer.concat([gainMap.subarray(0, 2), orientationExif(orientation), gainMap.subarray(2)]);
  const { channels } = await sharp(gainMap).metadata();
  const image = sharp(tagged).autoOrient();
  const pixels = await (channels === 1 ? image.toColourspace('b-w') : image).jpeg({ quality: GAIN_MAP_QUALITY }).toBuffer();
  const rotated = header(pixels);
  return Buffer.concat([pixels.subarray(0, 2), ...source.apps, ...rotated.others, pixels.subarray(rotated.scanAt)]);
}

export async function losslesslyOrientedJpeg(buffer: Buffer, orientation: number, run: JpegtranRunner = runJpegtran): Promise<Buffer | null> {
  const primary = readJpegImage(buffer, 0);
  if (primary === null) return null;
  const rotated = await losslesslyOriented(buffer.subarray(0, primary.end), orientation, run);
  if (rotated === null) return null;
  const gainMap = findGainMap(buffer, primary.end);
  if (gainMap === null) return rotated;
  const gainMapBytes = buffer.subarray(gainMap.start, gainMap.image.end);
  const rotatedGainMap = (await losslesslyOriented(gainMapBytes, orientation, run)) ?? (await reencodedGainMap(gainMapBytes, orientation));
  return Buffer.concat([rotated, rotatedGainMap]);
}
