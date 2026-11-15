/**
 * Retrait des métadonnées d'un JPEG au niveau des SEGMENTS (#11258) : les
 * octets d'image ressortent tels qu'ils sont entrés, aucune génération perdue.
 *
 * Liste BLANCHE : ce qui décode l'image (tables, trames, balayages, données
 * entropiques) et ce qui la colore (APP2 `ICC_PROFILE`, APP14 `Adobe`, APP0
 * `JFIF`) reste ; tout le reste part — APP1 (EXIF, GPS, XMP), APP2 MPF, APP3 à
 * APP13 (IPTC), APP15, commentaires, et TOUT octet après la fin de l'image :
 * c'est là que les appareils annexent leurs images secondaires (MPF, carte de
 * gain), qui portent chacune leur propre EXIF. Le segment `JFIF` perd sa
 * vignette : une image de la photo d'avant toute retouche.
 *
 * Une structure qui cesse de se lire APRÈS un premier balayage est refermée là
 * où elle cesse (fin d'image ajoutée) : un JPEG tronqué perd ses métadonnées
 * comme les autres. Rend `null` quand elle cesse avant toute donnée d'image :
 * l'appelant ré-encode alors plutôt que de laisser partir l'original.
 */

const MARKER = 0xff;
const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const END_OF_IMAGE = Buffer.from([MARKER, EOI]);
const SEGMENT_HEADER_LENGTH = 4;
const JFIF_HEADER_LENGTH = 14;
const JFIF_THUMBNAIL_SIZE_OFFSET = 12;
const DECODING_MARKERS = new Set([0xdb, 0xdc, 0xdd, 0xde, 0xdf, SOS]);
const COLOUR_SEGMENTS: ReadonlyMap<number, Buffer> = new Map([
  [APP0, Buffer.from('JFIF\0', 'latin1')],
  [0xe2, Buffer.from('ICC_PROFILE\0', 'latin1')],
  [0xee, Buffer.from('Adobe', 'latin1')],
]);

const isStandalone = (marker: number): boolean => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

function withoutJfifThumbnail(segment: Buffer): Buffer {
  if (segment.length <= SEGMENT_HEADER_LENGTH + JFIF_HEADER_LENGTH) return segment;
  const header = Buffer.from(segment.subarray(0, SEGMENT_HEADER_LENGTH + JFIF_HEADER_LENGTH));
  header.writeUInt16BE(2 + JFIF_HEADER_LENGTH, 2);
  header.fill(0, SEGMENT_HEADER_LENGTH + JFIF_THUMBNAIL_SIZE_OFFSET);
  return header;
}

function keptSegment(marker: number, segment: Buffer): Buffer | null {
  if ((marker >= 0xc0 && marker <= 0xcf) || DECODING_MARKERS.has(marker)) return segment;
  const signature = COLOUR_SEGMENTS.get(marker);
  if (signature === undefined) return null;
  if (!segment.subarray(SEGMENT_HEADER_LENGTH, SEGMENT_HEADER_LENGTH + signature.length).equals(signature)) return null;
  return marker === APP0 ? withoutJfifThumbnail(segment) : segment;
}

function entropyEnd(buffer: Buffer, from: number): number {
  let cursor = buffer.indexOf(MARKER, from);
  while (cursor !== -1 && cursor + 1 < buffer.length) {
    const next = buffer[cursor + 1];
    if (next === MARKER) cursor += 1;
    else if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) cursor = buffer.indexOf(MARKER, cursor + 2);
    else return cursor;
  }
  return buffer.length;
}

/** Un segment d'en-tête que la liste blanche n'a PAS gardé, avec ses octets. */
export type DroppedSegment = { readonly marker: number; readonly bytes: Buffer };

/**
 * Une image JPEG lue à partir de `start` : ce que la liste blanche garde (SOI
 * et EOI compris), les segments qu'elle écarte, et l'offset qui suit sa fin
 * d'image dans `buffer` (`end`), là où commence ce que l'appareil a annexé.
 */
export type JpegImage = { readonly kept: readonly Buffer[]; readonly dropped: readonly DroppedSegment[]; readonly end: number };

export function readJpegImage(buffer: Buffer, start: number): JpegImage | null {
  if (buffer.length < start + 4 || buffer[start] !== MARKER || buffer[start + 1] !== SOI) return null;
  const kept: Buffer[] = [buffer.subarray(start, start + 2)];
  const dropped: DroppedSegment[] = [];
  let scanned = false;
  const closed = (end: number): JpegImage | null => (scanned ? { kept: [...kept, END_OF_IMAGE], dropped, end } : null);
  let offset = start + 2;
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== MARKER) return closed(offset);
    const marker = buffer[offset + 1];
    if (marker === MARKER) {
      offset += 1;
    } else if (marker === EOI) {
      kept.push(buffer.subarray(offset, offset + 2));
      return { kept, dropped, end: offset + 2 };
    } else if (isStandalone(marker)) {
      kept.push(buffer.subarray(offset, offset + 2));
      offset += 2;
    } else {
      if (offset + SEGMENT_HEADER_LENGTH > buffer.length) return closed(buffer.length);
      const length = buffer.readUInt16BE(offset + 2);
      const end = offset + 2 + length;
      if (length < 2 || end > buffer.length) return closed(buffer.length);
      const bytes = buffer.subarray(offset, end);
      const segment = keptSegment(marker, bytes);
      if (segment !== null) kept.push(segment);
      else dropped.push({ marker, bytes });
      offset = marker === SOS ? entropyEnd(buffer, end) : end;
      if (marker === SOS) {
        kept.push(buffer.subarray(end, offset));
        scanned = true;
      }
    }
  }
  return closed(buffer.length);
}

export function stripJpegMetadataSegments(buffer: Buffer): Buffer | null {
  const image = readJpegImage(buffer, 0);
  return image === null ? null : Buffer.concat(image.kept);
}
