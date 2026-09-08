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

  const oriented = sharp(buffer).rotate();
  if (normalized === 'image/png') return oriented.png().toBuffer();
  if (normalized === 'image/webp') return oriented.webp().toBuffer();
  return oriented.jpeg().toBuffer();
}
