/**
 * La marge HDR d'une photo d'iPhone, seule rescapée de son EXIF (#11840).
 *
 * Avant iOS 18, la carte de gain d'Apple ne dit pas elle-même de combien elle
 * éclaire : la marge (« headroom ») vit dans le MakerNote de l'EXIF de l'image
 * principale, balises 33 et 48 (deux rationnels). Retirer l'EXIF en entier —
 * ce qu'exige le GPS — rend la carte inapplicable. On relit donc ces deux
 * valeurs, et seulement elles, pour les reposer dans un EXIF MINIMAL :
 * IFD0 → IFD Exif → MakerNote `Apple iOS` → balises 33 et 48. Aucun autre
 * champ n'y entre — ni appareil, ni date, ni position.
 *
 * La lecture suit celle de libultrahdr (`getExifAppleHeadroom`) : décalages
 * bornés, au plus trois IFD parcourus, MakerNote toujours gros-boutiste.
 */

const EXIF_HEADER = Buffer.from('Exif\0\0', 'latin1');
const APPLE_MAKER_NOTE_HEADER = Buffer.from([0x41, 0x70, 0x70, 0x6c, 0x65, 0x20, 0x69, 0x4f, 0x53, 0x00, 0x00, 0x01, 0x4d, 0x4d]);
const EXIF_IFD_POINTER = 0x8769;
const MAKER_NOTE = 0x927c;
const HEADROOM_TAGS = new Set([33, 48]);
const SRATIONAL = 10;
const MAX_IFDS = 3;

/** Une balise de marge HDR, gardée telle qu'écrite (numérateur et dénominateur bruts). */
export type AppleHeadroomTag = { readonly tag: number; readonly numerator: number; readonly denominator: number };

type Reader = { readonly bytes: Buffer; readonly bigEndian: boolean };

const u16 = (r: Reader, at: number): number => (r.bigEndian ? r.bytes.readUInt16BE(at) : r.bytes.readUInt16LE(at));
const u32 = (r: Reader, at: number): number => (r.bigEndian ? r.bytes.readUInt32BE(at) : r.bytes.readUInt32LE(at));
const fits = (r: Reader, at: number, length: number): boolean => at >= 0 && at + length <= r.bytes.length;

type Entry = { readonly tag: number; readonly type: number; readonly value: number };

function entries(r: Reader, at: number): readonly Entry[] | null {
  if (!fits(r, at, 2)) return null;
  const count = u16(r, at);
  if (!fits(r, at + 2, count * 12)) return null;
  return Array.from({ length: count }, (_, i) => {
    const base = at + 2 + i * 12;
    return { tag: u16(r, base), type: u16(r, base + 2), value: u32(r, base + 8) };
  });
}

function headroomTags(tiff: Buffer, makerNoteOffset: number): readonly AppleHeadroomTag[] {
  if (!tiff.subarray(makerNoteOffset, makerNoteOffset + APPLE_MAKER_NOTE_HEADER.length).equals(APPLE_MAKER_NOTE_HEADER)) return [];
  const r: Reader = { bytes: tiff, bigEndian: true };
  const found = entries(r, makerNoteOffset + APPLE_MAKER_NOTE_HEADER.length) ?? [];
  return found
    .filter((entry) => HEADROOM_TAGS.has(entry.tag) && entry.type === SRATIONAL && fits(r, makerNoteOffset + entry.value, 8))
    .map((entry) => ({
      tag: entry.tag,
      numerator: tiff.readInt32BE(makerNoteOffset + entry.value),
      denominator: tiff.readUInt32BE(makerNoteOffset + entry.value + 4),
    }))
    .filter((entry) => entry.denominator !== 0);
}

/** Les balises de marge HDR d'Apple portées par un segment APP1 EXIF, ou `[]`. */
export function appleHeadroomTags(segment: Buffer): readonly AppleHeadroomTag[] {
  const payload = segment.subarray(4);
  if (!payload.subarray(0, EXIF_HEADER.length).equals(EXIF_HEADER)) return [];
  return appleHeadroomTagsOfTiff(payload.subarray(EXIF_HEADER.length));
}

/** Les balises de marge HDR d'Apple portées par un TIFF EXIF, ou `[]`. */
export function appleHeadroomTagsOfTiff(tiff: Buffer): readonly AppleHeadroomTag[] {
  if (tiff.length < 8) return [];
  const order = tiff.toString('latin1', 0, 2);
  if (order !== 'MM' && order !== 'II') return [];
  const r: Reader = { bytes: tiff, bigEndian: order === 'MM' };
  let ifd = u32(r, 4);
  for (let walked = 0; walked < MAX_IFDS && ifd !== 0; walked += 1) {
    const found = entries(r, ifd);
    if (found === null) return [];
    const makerNote = found.find((entry) => entry.tag === MAKER_NOTE);
    if (makerNote) return headroomTags(tiff, makerNote.value);
    const exifIfd = found.find((entry) => entry.tag === EXIF_IFD_POINTER);
    ifd = exifIfd ? exifIfd.value : fits(r, ifd + 2 + found.length * 12, 4) ? u32(r, ifd + 2 + found.length * 12) : 0;
  }
  return [];
}

function ifd(entriesToWrite: readonly (readonly [number, number, number, number])[]): Buffer {
  const out = Buffer.alloc(2 + entriesToWrite.length * 12 + 4);
  out.writeUInt16BE(entriesToWrite.length, 0);
  entriesToWrite.forEach(([tag, type, count, value], i) => {
    out.writeUInt16BE(tag, 2 + i * 12);
    out.writeUInt16BE(type, 4 + i * 12);
    out.writeUInt32BE(count, 6 + i * 12);
    out.writeUInt32BE(value, 10 + i * 12);
  });
  return out;
}

/** Le TIFF minimal (gros-boutiste) qui ne porte que la marge HDR d'Apple. */
export function appleHeadroomTiff(tags: readonly AppleHeadroomTag[]): Buffer {
  const sorted = [...tags].sort((a, b) => a.tag - b.tag);
  const makerIfdLength = 2 + sorted.length * 12 + 4;
  const makerNote = Buffer.concat([
    APPLE_MAKER_NOTE_HEADER,
    ifd(sorted.map((t, i) => [t.tag, SRATIONAL, 1, APPLE_MAKER_NOTE_HEADER.length + makerIfdLength + i * 8] as const)),
    ...sorted.map((t) => {
      const rational = Buffer.alloc(8);
      rational.writeInt32BE(t.numerator, 0);
      rational.writeUInt32BE(t.denominator, 4);
      return rational;
    }),
  ]);
  const ifd0At = 8;
  const exifIfdAt = ifd0At + 18;
  const makerNoteAt = exifIfdAt + 18;
  return Buffer.concat([
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, ifd0At]),
    ifd([[EXIF_IFD_POINTER, 4, 1, exifIfdAt]]),
    ifd([[MAKER_NOTE, 7, makerNote.length, makerNoteAt]]),
    makerNote,
  ]);
}

/** Le segment APP1 EXIF minimal qui ne porte que la marge HDR d'Apple. */
export function appleHeadroomExifSegment(tags: readonly AppleHeadroomTag[]): Buffer {
  const payload = Buffer.concat([EXIF_HEADER, appleHeadroomTiff(tags)]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}
