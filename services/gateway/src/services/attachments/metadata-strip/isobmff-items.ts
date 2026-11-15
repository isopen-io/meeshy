/**
 * Retrait des métadonnées d'une image HEIF (HEIC, AVIF) sans ré-encodage
 * (#11258, contre-analyse W4) — `sharp` ne décode pas le HEIC.
 *
 * L'EXIF (GPS compris) et le XMP y sont des ITEMS de la boîte `meta` : `Exif`,
 * `mime` (XMP, C2PA…) et `uri `. Leurs octets, localisés par `iloc` (dans le
 * fichier ou dans `idat`), sont remis à ZÉRO EN PLACE : aucun décalage ne
 * bouge, donc aucune référence de la structure ne se casse, et les pixels
 * restent ceux qui sont entrés. L'orientation d'un HEIF vit dans ses
 * propriétés (`irot`, `imir`), pas dans l'EXIF : elle est conservée.
 *
 * Exception, la carte de gain HDR d'un iPhone (#11840) : un item `mime` dont
 * le XMP la décrit (`HDRGainMap:`, `apdi:`, `hdrgm:`) est RÉÉCRIT en place par
 * ce seul XMP reconstruit (`gain-map-xmp.ts`), complété d'espaces ; un item
 * `Exif` qui porte la marge HDR d'Apple (MakerNote, balises 33 et 48) l'est
 * par un EXIF qui ne porte qu'elle (`apple-hdr-headroom.ts`), complété de
 * zéros. Un contenu qui ne tient pas dans l'item, ou un item en plusieurs
 * morceaux, est remis à zéro comme les autres. L'item `tmap` (ISO 21496-1)
 * et l'image de la carte ne sont pas des métadonnées : ils restent.
 *
 * Une structure illisible rend le fichier INCHANGÉ.
 */
import { appleHeadroomTagsOfTiff, appleHeadroomTiff } from './apple-hdr-headroom';
import { gainMapProperties, gainMapXmpPacket } from './gain-map-xmp';

const BLANKED_ITEM_TYPES = new Set(['Exif', 'mime', 'uri ']);

type Box = { readonly type: string; readonly start: number; readonly payload: number; readonly end: number };
type Extent = { readonly itemId: number; readonly start: number; readonly length: number };
type Cursor = { readonly buffer: Buffer; offset: number; readonly end: number };

function readBoxes(buffer: Buffer, from: number, to: number): readonly Box[] {
  const boxes: Box[] = [];
  let offset = from;
  while (offset + 8 <= to) {
    const size32 = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const large = size32 === 1 && offset + 16 <= to;
    const size = large ? Number(buffer.readBigUInt64BE(offset + 8)) : size32 === 0 ? to - offset : size32;
    const header = large ? 16 : 8;
    if (size < header || offset + size > to) break;
    boxes.push({ type, start: offset, payload: offset + header, end: offset + size });
    offset += size;
  }
  return boxes;
}

function readUInt(cursor: Cursor, bytes: number): number {
  if (bytes === 0) return 0;
  if (cursor.offset + bytes > cursor.end) throw new RangeError('isobmff: truncated');
  const value = bytes === 8 ? Number(cursor.buffer.readBigUInt64BE(cursor.offset)) : cursor.buffer.readUIntBE(cursor.offset, bytes);
  cursor.offset += bytes;
  return value;
}

function blankedItemIds(buffer: Buffer, iinf: Box): ReadonlyMap<number, string> {
  const version = buffer[iinf.payload];
  const entriesStart = iinf.payload + 4 + (version === 0 ? 2 : 4);
  const ids = readBoxes(buffer, entriesStart, iinf.end)
    .filter((box) => box.type === 'infe' && buffer[box.payload] >= 2 && box.payload + 4 <= box.end)
    .map((box) => {
      const idLength = buffer[box.payload] === 2 ? 2 : 4;
      const typeOffset = box.payload + 4 + idLength + 2;
      if (typeOffset + 4 > box.end) return null;
      const type = buffer.toString('latin1', typeOffset, typeOffset + 4);
      return BLANKED_ITEM_TYPES.has(type) ? ([buffer.readUIntBE(box.payload + 4, idLength), type] as const) : null;
    })
    .filter((entry): entry is readonly [number, string] => entry !== null);
  return new Map(ids);
}

function blankedExtents(buffer: Buffer, iloc: Box, ids: ReadonlyMap<number, string>, idatStart: number | null): readonly Extent[] {
  const cursor: Cursor = { buffer, offset: iloc.payload, end: iloc.end };
  const version = readUInt(cursor, 1);
  readUInt(cursor, 3);
  const sizes = readUInt(cursor, 2);
  const offsetSize = sizes >> 12;
  const lengthSize = (sizes >> 8) & 0x0f;
  const baseOffsetSize = (sizes >> 4) & 0x0f;
  const indexSize = version === 1 || version === 2 ? sizes & 0x0f : 0;
  const itemCount = readUInt(cursor, version < 2 ? 2 : 4);
  const extents: Extent[] = [];
  for (let item = 0; item < itemCount; item += 1) {
    const itemId = readUInt(cursor, version < 2 ? 2 : 4);
    const method = version === 1 || version === 2 ? readUInt(cursor, 2) & 0x0f : 0;
    readUInt(cursor, 2);
    const baseOffset = readUInt(cursor, baseOffsetSize);
    const extentCount = readUInt(cursor, 2);
    for (let extent = 0; extent < extentCount; extent += 1) {
      readUInt(cursor, indexSize);
      const extentOffset = readUInt(cursor, offsetSize);
      const length = readUInt(cursor, lengthSize);
      const origin = method === 0 ? 0 : method === 1 ? idatStart : null;
      if (ids.has(itemId) && origin !== null && length > 0) {
        extents.push({ itemId, start: origin + baseOffset + extentOffset, length });
      }
    }
  }
  return extents;
}

const EXIF_HEADER = Buffer.from('Exif\0\0', 'latin1');

function fitted(content: Buffer, length: number, filler: number): Buffer | null {
  if (content.length > length) return null;
  return Buffer.concat([content, Buffer.alloc(length - content.length, filler)]);
}

function keptXmp(item: Buffer): Buffer | null {
  const properties = gainMapProperties(item.toString('utf8'));
  return properties.length === 0 ? null : fitted(Buffer.from(gainMapXmpPacket(properties), 'utf8'), item.length, 0x20);
}

function keptExif(item: Buffer): Buffer | null {
  if (item.length < 4) return null;
  const at = 4 + item.readUInt32BE(0);
  const tiff = item.subarray(item.subarray(at, at + EXIF_HEADER.length).equals(EXIF_HEADER) ? at + EXIF_HEADER.length : at);
  const tags = appleHeadroomTagsOfTiff(tiff);
  if (tags.length === 0) return null;
  const offset = Buffer.alloc(4);
  offset.writeUInt32BE(EXIF_HEADER.length, 0);
  return fitted(Buffer.concat([offset, EXIF_HEADER, appleHeadroomTiff(tags)]), item.length, 0);
}

function keptContent(type: string | undefined, item: Buffer): Buffer | null {
  if (type === 'mime') return keptXmp(item);
  if (type === 'Exif') return keptExif(item);
  return null;
}

export function blankIsobmffMetadataItems(buffer: Buffer): Buffer {
  const meta = readBoxes(buffer, 0, buffer.length).find((box) => box.type === 'meta');
  if (!meta) return buffer;
  const children = readBoxes(buffer, meta.payload + 4, meta.end);
  const iinf = children.find((box) => box.type === 'iinf');
  const iloc = children.find((box) => box.type === 'iloc');
  if (!iinf || !iloc) return buffer;
  const ids = blankedItemIds(buffer, iinf);
  if (ids.size === 0) return buffer;
  const idat = children.find((box) => box.type === 'idat');
  try {
    const extents = blankedExtents(buffer, iloc, ids, idat ? idat.payload : null);
    const blanked = Buffer.from(buffer);
    extents.forEach(({ itemId, start, length }) => {
      const from = Math.min(start, blanked.length);
      const to = Math.min(start + length, blanked.length);
      const single = extents.filter((extent) => extent.itemId === itemId).length === 1;
      const kept = single ? keptContent(ids.get(itemId), buffer.subarray(from, to)) : null;
      if (kept === null) blanked.fill(0, from, to);
      else kept.copy(blanked, from);
    });
    return blanked;
  } catch {
    return buffer;
  }
}
