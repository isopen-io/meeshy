/**
 * Retrait d'EXIF/GPS des images uploadées (#3627).
 *
 * `sharp` ne recopie l'EXIF/ICC/XMP d'entrée que si `.withMetadata()` est
 * appelé explicitement — sans cet appel, la ré-écriture ci-dessous les
 * supprime tous, GPS compris, sans qu'il y ait de champ à cibler un par un.
 *
 * `.rotate()` sans argument applique l'orientation EXIF AVANT que la
 * métadonnée ne soit perdue — sans lui, une photo prise en portrait sur un
 * capteur qui écrit toujours en paysage + un tag `Orientation` ressortirait
 * pivotée à l'affichage.
 *
 * JPEG/PNG/WEBP seulement : ce sont les trois formats que `sharp` réencode
 * sans perte de fonctionnalité pour ce dépôt. GIF est exclu à dessein — un
 * GIF ANIMÉ passé dans `sharp` sans `{ animated: true }` ressort figé sur sa
 * première frame, une régression fonctionnelle pire que la fuite qu'on
 * corrige. SVG est du XML, sans concept d'EXIF.
 *
 * **Une image ANIMÉE garde toutes ses images (#10639).** Un WEBP se relit
 * avec `{ animated: true }`. Un PNG animé (APNG, chunk `acTL` avant `IDAT`)
 * ne passe PAS par `sharp`, dont le décodeur PNG ne lit que la première
 * image : on en retire les chunks de métadonnées, un par un. Chaque chunk
 * porte sa propre somme de contrôle, les autres restent valides. C'est la
 * forme sous laquelle un sticker Mee part dans une story ; ré-encodé, il
 * arrivait figé chez tous les lecteurs.
 */
import sharp from 'sharp';

const STRIPPABLE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export function isExifStrippable(mimeType: string): boolean {
  return STRIPPABLE_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Réencode `buffer` sans métadonnées. Rend `buffer` INCHANGÉ si `mimeType`
 * n'est pas dans `STRIPPABLE_MIME_TYPES` — l'appelant décide s'il vaut la
 * peine d'appeler cette fonction via `isExifStrippable`, elle reste sans
 * risque à appeler sur un type non couvert.
 */
export async function stripExifFromImageBuffer(buffer: Buffer, mimeType: string): Promise<Buffer> {
  const normalized = mimeType.toLowerCase();
  if (!STRIPPABLE_MIME_TYPES.has(normalized)) return buffer;

  if (normalized === 'image/png' && isAnimatedPng(buffer)) return withoutPngMetadataChunks(buffer);
  if (normalized === 'image/webp') return sharp(buffer, { animated: true }).rotate().webp().toBuffer();

  const oriented = sharp(buffer).rotate();
  if (normalized === 'image/png') return oriented.png().toBuffer();
  return oriented.jpeg().toBuffer();
}

const PNG_SIGNATURE_LENGTH = 8;
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

type PngChunk = { readonly type: string; readonly bytes: Buffer };

function pngChunks(buffer: Buffer): readonly PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE_LENGTH;
  while (offset + 12 <= buffer.length) {
    const end = offset + 12 + buffer.readUInt32BE(offset);
    chunks.push({ type: buffer.toString('latin1', offset + 4, offset + 8), bytes: buffer.subarray(offset, end) });
    offset = end;
  }
  return chunks;
}

function isAnimatedPng(buffer: Buffer): boolean {
  const types = pngChunks(buffer).map((chunk) => chunk.type);
  const animation = types.indexOf('acTL');
  return animation >= 0 && animation < types.indexOf('IDAT');
}

function withoutPngMetadataChunks(buffer: Buffer): Buffer {
  const kept = pngChunks(buffer).filter((chunk) => !PNG_METADATA_CHUNKS.has(chunk.type));
  return Buffer.concat([buffer.subarray(0, PNG_SIGNATURE_LENGTH), ...kept.map((chunk) => chunk.bytes)]);
}
