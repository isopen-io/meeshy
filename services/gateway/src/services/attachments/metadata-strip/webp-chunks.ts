/**
 * Retrait des métadonnées d'un WebP — fixe ou animé — au niveau des chunks
 * RIFF (#11258) : un WebP sans perte (`VP8L`) le reste, un WebP animé garde
 * toutes ses images, et le profil `ICCP` reste.
 *
 * Liste BLANCHE : `VP8X` (drapeaux EXIF et XMP baissés), `ICCP`, `ANIM`,
 * `ANMF`, `ALPH`, `VP8 `, `VP8L`. `EXIF`, `XMP ` et tout chunk inconnu partent,
 * comme tout octet au-delà de la taille RIFF déclarée.
 *
 * Rend `null` quand le conteneur ne se lit pas ou ne porte aucune image :
 * l'appelant ré-encode alors plutôt que de laisser partir l'original.
 */

const RIFF_HEADER_LENGTH = 12;
const CHUNK_HEADER_LENGTH = 8;
const KEPT_CHUNKS = new Set(['VP8X', 'ICCP', 'ANIM', 'ANMF', 'ALPH', 'VP8 ', 'VP8L']);
const IMAGE_CHUNKS = new Set(['ANMF', 'VP8 ', 'VP8L']);
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

type WebpChunk = { readonly type: string; readonly bytes: Buffer };

function readWebpChunks(buffer: Buffer): readonly WebpChunk[] | null {
  if (buffer.length < RIFF_HEADER_LENGTH) return null;
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WEBP') return null;
  const riffEnd = Math.min(buffer.length, 8 + buffer.readUInt32LE(4));
  const chunks: WebpChunk[] = [];
  let offset = RIFF_HEADER_LENGTH;
  while (offset + CHUNK_HEADER_LENGTH <= riffEnd) {
    const size = buffer.readUInt32LE(offset + 4);
    const end = offset + CHUNK_HEADER_LENGTH + size + (size & 1);
    if (offset + CHUNK_HEADER_LENGTH + size > riffEnd) break;
    chunks.push({ type: buffer.toString('latin1', offset, offset + 4), bytes: buffer.subarray(offset, Math.min(end, riffEnd)) });
    offset = end;
  }
  return chunks;
}

function withoutMetadataFlags(chunk: WebpChunk): Buffer {
  if (chunk.type !== 'VP8X') return chunk.bytes;
  const copy = Buffer.from(chunk.bytes);
  copy[CHUNK_HEADER_LENGTH] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
  return copy;
}

function evenPadded(bytes: Buffer): Buffer {
  return bytes.length % 2 === 0 ? bytes : Buffer.concat([bytes, Buffer.alloc(1)]);
}

export function isLosslessWebp(buffer: Buffer): boolean {
  return (readWebpChunks(buffer) ?? []).some((chunk) => chunk.type === 'VP8L');
}

export function stripWebpMetadataChunks(buffer: Buffer): Buffer | null {
  const chunks = readWebpChunks(buffer);
  if (!chunks || !chunks.some((chunk) => IMAGE_CHUNKS.has(chunk.type))) return null;
  const kept = chunks.filter((chunk) => KEPT_CHUNKS.has(chunk.type)).map(withoutMetadataFlags).map(evenPadded);
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), ...kept]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
