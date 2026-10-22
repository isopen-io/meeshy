/**
 * Retrait des métadonnées d'un GIF au niveau des BLOCS (#11258, contre-analyse
 * W4) : aucune image n'est ré-encodée, un GIF animé garde toutes les siennes.
 *
 * Liste BLANCHE : en-tête, descripteur d'écran et tables de couleurs,
 * descripteurs d'image et leurs données, extensions de contrôle graphique et
 * de texte, et les deux extensions d'application qui touchent l'image :
 * l'animation (`NETSCAPE2.0` / `ANIMEXTS1.0`) et le profil de couleur
 * (`ICCRGBG1012`). Commentaires, XMP, toute autre application et tout octet
 * après le terminateur partent. Une structure qui cesse de se
 * lire est refermée là où elle cesse.
 *
 * Rend `null` quand l'en-tête n'est pas celui d'un GIF.
 */

const HEADER_LENGTH = 13;
const EXTENSION = 0x21;
const IMAGE = 0x2c;
const TRAILER = 0x3b;
const KEPT_EXTENSIONS = new Set([0xf9, 0x01]);
const APPLICATION = 0xff;
const IMAGE_APPLICATIONS = ['NETSCAPE2.0', 'ANIMEXTS1.0', 'ICCRGBG1012'];

const colorTableLength = (flags: number): number => (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0);

function subBlocksEnd(buffer: Buffer, from: number): number | null {
  let cursor = from;
  while (cursor < buffer.length) {
    const size = buffer[cursor];
    if (size === 0) return cursor + 1;
    cursor += 1 + size;
  }
  return null;
}

function keepsExtension(buffer: Buffer, offset: number): boolean {
  const label = buffer[offset + 1];
  if (KEPT_EXTENSIONS.has(label)) return true;
  if (label !== APPLICATION) return false;
  const size = buffer[offset + 2];
  return IMAGE_APPLICATIONS.includes(buffer.toString('latin1', offset + 3, offset + 3 + Math.min(size, 11)));
}

function blockEnd(buffer: Buffer, offset: number): number | null {
  if (buffer[offset] === EXTENSION) return offset + 2 <= buffer.length ? subBlocksEnd(buffer, offset + 2) : null;
  const descriptorEnd = offset + 10;
  if (descriptorEnd > buffer.length) return null;
  const pixelsStart = descriptorEnd + colorTableLength(buffer[offset + 9]) + 1;
  return pixelsStart <= buffer.length ? subBlocksEnd(buffer, pixelsStart) : null;
}

export function stripGifMetadataBlocks(buffer: Buffer): Buffer | null {
  if (buffer.length < HEADER_LENGTH || !/^GIF8[79]a$/.test(buffer.toString('latin1', 0, 6))) return null;
  const headerEnd = Math.min(buffer.length, HEADER_LENGTH + colorTableLength(buffer[10]));
  const kept: Buffer[] = [buffer.subarray(0, headerEnd)];
  let offset = headerEnd;
  while (offset < buffer.length && (buffer[offset] === EXTENSION || buffer[offset] === IMAGE)) {
    const end = blockEnd(buffer, offset);
    if (end === null) break;
    if (buffer[offset] === IMAGE || keepsExtension(buffer, offset)) kept.push(buffer.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat([...kept, Buffer.from([TRAILER])]);
}
