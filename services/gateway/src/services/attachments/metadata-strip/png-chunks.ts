/**
 * Retrait des métadonnées d'un PNG — fixe ou animé (APNG, #10639) — au niveau
 * des CHUNKS (#11258) : les pixels ne sont jamais ré-encodés, donc un PNG à
 * palette reste à palette et ne gonfle pas.
 *
 * Liste BLANCHE de chunks d'image, lus jusqu'au premier chunk incohérent puis
 * refermés par un `IEND` : aucun chunk de texte (`tEXt`, `zTXt`, `iTXt` — où
 * vit le XMP), `eXIf`, `tIME`, chunk privé, manifeste C2PA, octet après `IEND`
 * ou longueur mensongère ne survit. Le profil de couleur `iCCP` reste, mais
 * son NOM — texte libre — est remplacé, et il n'est gardé que s'il se
 * décompresse vraiment (borné) : un profil illisible part.
 *
 * Quand la lecture s'arrête avant le premier `IDAT`, le résultat n'a aucun
 * pixel : `hasPngPixels` le dit, et l'appelant tente d'abord un ré-encodage
 * plutôt que de remplacer une photo lisible par un fichier vide.
 */
import { crc32, inflateSync } from 'zlib';

const PNG_SIGNATURE_LENGTH = 8;
const PNG_IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const PNG_IMAGE_CHUNKS = new Set([
  'IHDR', 'PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'bKGD', 'hIST', 'pHYs', 'cICP', 'mDCv', 'cLLi',
  'acTL', 'fcTL', 'IDAT', 'fdAT', 'IEND',
]);
const PNG_FIXED_LENGTHS: Readonly<Record<string, number>> = {
  IHDR: 13, acTL: 8, fcTL: 26, IEND: 0, gAMA: 4, cHRM: 32, sRGB: 1, pHYs: 9, cICP: 4, mDCv: 24, cLLi: 8,
};
const ICC_PROFILE_NAME = Buffer.from('ICC Profile', 'latin1');
const ICC_PROFILE_MAX_BYTES = 4 * 1024 * 1024;
const ICC_NAME_MAX_LENGTH = 79;

type PngChunk = { readonly type: string; readonly bytes: Buffer };
type PngRead = { readonly chunks: readonly PngChunk[]; readonly complete: boolean };

export function readPngChunks(buffer: Buffer): PngRead {
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE_LENGTH;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const end = offset + 12 + length;
    const fixed = PNG_FIXED_LENGTHS[type];
    if (end > buffer.length || (fixed !== undefined && fixed !== length)) break;
    chunks.push({ type, bytes: buffer.subarray(offset, end) });
    if (type === 'IEND') return { chunks, complete: true };
    offset = end;
  }
  return { chunks, complete: false };
}

export function isAnimatedPng(chunks: readonly PngChunk[]): boolean {
  const types = chunks.map((chunk) => chunk.type);
  const animation = types.indexOf('acTL');
  const pixels = types.indexOf('IDAT');
  return animation >= 0 && (pixels < 0 || animation < pixels);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function anonymousIccProfile(chunk: PngChunk): Buffer | null {
  const data = chunk.bytes.subarray(8, chunk.bytes.length - 4);
  const nameEnd = data.indexOf(0);
  if (nameEnd < 1 || nameEnd > ICC_NAME_MAX_LENGTH || data[nameEnd + 1] !== 0) return null;
  const profile = data.subarray(nameEnd + 2);
  try {
    inflateSync(profile, { maxOutputLength: ICC_PROFILE_MAX_BYTES });
  } catch {
    return null;
  }
  return pngChunk('iCCP', Buffer.concat([ICC_PROFILE_NAME, Buffer.from([0, 0]), profile]));
}

function keptChunk(chunk: PngChunk): Buffer | null {
  if (PNG_IMAGE_CHUNKS.has(chunk.type)) return chunk.bytes;
  return chunk.type === 'iCCP' ? anonymousIccProfile(chunk) : null;
}

export function hasPngPixels(read: PngRead): boolean {
  return read.chunks.some((chunk) => chunk.type === 'IDAT');
}

export function stripPngMetadataChunks(buffer: Buffer, read: PngRead = readPngChunks(buffer)): Buffer {
  const kept = read.chunks.map(keptChunk).filter((bytes): bytes is Buffer => bytes !== null);
  return Buffer.concat([buffer.subarray(0, PNG_SIGNATURE_LENGTH), ...kept, ...(read.complete ? [] : [PNG_IEND])]);
}
