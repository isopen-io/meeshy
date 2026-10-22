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
 * Une structure illisible rend le fichier INCHANGÉ.
 */

const BLANKED_ITEM_TYPES = new Set(['Exif', 'mime', 'uri ']);

type Box = { readonly type: string; readonly start: number; readonly payload: number; readonly end: number };
type Extent = { readonly start: number; readonly length: number };
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

function blankedItemIds(buffer: Buffer, iinf: Box): ReadonlySet<number> {
  const version = buffer[iinf.payload];
  const entriesStart = iinf.payload + 4 + (version === 0 ? 2 : 4);
  const ids = readBoxes(buffer, entriesStart, iinf.end)
    .filter((box) => box.type === 'infe' && buffer[box.payload] >= 2 && box.payload + 4 <= box.end)
    .map((box) => {
      const idLength = buffer[box.payload] === 2 ? 2 : 4;
      const typeOffset = box.payload + 4 + idLength + 2;
      if (typeOffset + 4 > box.end) return null;
      const type = buffer.toString('latin1', typeOffset, typeOffset + 4);
      return BLANKED_ITEM_TYPES.has(type) ? buffer.readUIntBE(box.payload + 4, idLength) : null;
    })
    .filter((id): id is number => id !== null);
  return new Set(ids);
}

function blankedExtents(buffer: Buffer, iloc: Box, ids: ReadonlySet<number>, idatStart: number | null): readonly Extent[] {
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
        extents.push({ start: origin + baseOffset + extentOffset, length });
      }
    }
  }
  return extents;
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
    extents.forEach(({ start, length }) => blanked.fill(0, Math.min(start, blanked.length), Math.min(start + length, blanked.length)));
    return blanked;
  } catch {
    return buffer;
  }
}
