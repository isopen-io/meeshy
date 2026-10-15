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
 * **Une image ANIMÉE garde toutes ses images (#10639).** C'est la forme
 * sous laquelle un sticker Mee part dans une story ; ré-encodée sans elles,
 * elle arrivait figée chez tous les lecteurs.
 * - Un WEBP animé se relit avec `{ animated: true }`, sans `.rotate()` : sur
 *   plusieurs pages, sharp le refuse, et l'appelant garderait alors l'original
 *   AVEC son EXIF (audit adversarial).
 * - Un PNG animé (APNG, `acTL` avant `IDAT`) ne passe pas par sharp, dont le
 *   décodeur PNG ne lit que la première image. On n'en garde qu'une LISTE
 *   BLANCHE de chunks d'image, lus jusqu'au premier chunk incohérent puis
 *   refermés par un `IEND` : aucun chunk privé, C2PA, profil nommé, octet
 *   après `IEND` ou longueur mensongère ne survit. Chaque chunk porte sa
 *   propre somme de contrôle, ceux qui restent sont valides.
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

  if (normalized === 'image/png') {
    const read = readPngChunks(buffer);
    if (isAnimatedPng(read.chunks)) return animatedPngImageOnly(buffer, read);
    return sharp(buffer).rotate().png().toBuffer();
  }
  if (normalized === 'image/webp') {
    const { pages = 1 } = await sharp(buffer).metadata();
    return pages > 1
      ? sharp(buffer, { animated: true }).webp().toBuffer()
      : sharp(buffer).rotate().webp().toBuffer();
  }
  return sharp(buffer).rotate().jpeg().toBuffer();
}

const PNG_SIGNATURE_LENGTH = 8;
const PNG_IEND = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const PNG_IMAGE_CHUNKS = new Set([
  'IHDR', 'PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'pHYs', 'acTL', 'fcTL', 'IDAT', 'fdAT', 'IEND',
]);
const PNG_FIXED_LENGTHS: Readonly<Record<string, number>> = {
  IHDR: 13, acTL: 8, fcTL: 26, IEND: 0, gAMA: 4, cHRM: 32, sRGB: 1, pHYs: 9,
};

type PngChunk = { readonly type: string; readonly bytes: Buffer };
type PngRead = { readonly chunks: readonly PngChunk[]; readonly complete: boolean };

function readPngChunks(buffer: Buffer): PngRead {
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

function isAnimatedPng(chunks: readonly PngChunk[]): boolean {
  const types = chunks.map((chunk) => chunk.type);
  const animation = types.indexOf('acTL');
  const pixels = types.indexOf('IDAT');
  return animation >= 0 && (pixels < 0 || animation < pixels);
}

function animatedPngImageOnly(buffer: Buffer, read: PngRead): Buffer {
  const kept = read.chunks.filter((chunk) => PNG_IMAGE_CHUNKS.has(chunk.type)).map((chunk) => chunk.bytes);
  return Buffer.concat([buffer.subarray(0, PNG_SIGNATURE_LENGTH), ...kept, ...(read.complete ? [] : [PNG_IEND])]);
}
