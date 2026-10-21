/**
 * Retrait des métadonnées d'un JPEG au niveau des SEGMENTS (#11258) : les
 * octets d'image ressortent tels qu'ils sont entrés, aucune génération perdue.
 *
 * Liste BLANCHE : ce qui décode l'image (tables, trames, balayages, données
 * entropiques) et ce qui la colore (APP2 `ICC_PROFILE`, APP14 `Adobe`, APP0
 * `JFIF`) reste ; tout le reste part — APP1 (EXIF, GPS, XMP), APP2 MPF, APP3 à
 * APP13 (IPTC), APP15, commentaires, et TOUT octet après la fin de l'image :
 * c'est là que les appareils annexent leurs images secondaires (MPF, carte de
 * gain), qui portent chacune leur propre EXIF.
 *
 * Rend `null` quand la structure ne se lit pas jusqu'à la fin de l'image :
 * l'appelant ré-encode alors plutôt que de laisser partir l'original.
 */

const MARKER = 0xff;
const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const DECODING_MARKERS = new Set([0xdb, 0xdc, 0xdd, 0xde, 0xdf, SOS]);
const COLOUR_SEGMENTS: ReadonlyMap<number, Buffer> = new Map([
  [0xe0, Buffer.from('JFIF\0', 'latin1')],
  [0xe2, Buffer.from('ICC_PROFILE\0', 'latin1')],
  [0xee, Buffer.from('Adobe', 'latin1')],
]);

const isStandalone = (marker: number): boolean => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

function keepsSegment(marker: number, payload: Buffer): boolean {
  if ((marker >= 0xc0 && marker <= 0xcf) || DECODING_MARKERS.has(marker)) return true;
  const signature = COLOUR_SEGMENTS.get(marker);
  return signature !== undefined && payload.subarray(0, signature.length).equals(signature);
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

export function stripJpegMetadataSegments(buffer: Buffer): Buffer | null {
  if (buffer.length < 4 || buffer[0] !== MARKER || buffer[1] !== SOI) return null;
  const kept: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== MARKER) return null;
    const marker = buffer[offset + 1];
    if (marker === MARKER) {
      offset += 1;
    } else if (marker === EOI) {
      kept.push(buffer.subarray(offset, offset + 2));
      return Buffer.concat(kept);
    } else if (isStandalone(marker)) {
      kept.push(buffer.subarray(offset, offset + 2));
      offset += 2;
    } else {
      if (offset + 4 > buffer.length) return null;
      const length = buffer.readUInt16BE(offset + 2);
      const end = offset + 2 + length;
      if (length < 2 || end > buffer.length) return null;
      if (keepsSegment(marker, buffer.subarray(offset + 4, end))) kept.push(buffer.subarray(offset, end));
      offset = marker === SOS ? entropyEnd(buffer, end) : end;
      if (marker === SOS) kept.push(buffer.subarray(end, offset));
    }
  }
  return null;
}
