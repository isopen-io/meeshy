import type { StickerDefinition, StickerMimeType } from '@meeshy/shared/types/sticker-definition';

import { attachmentSrc } from '@/lib/api/media-url';

/**
 * **UN STICKER DE LA BIBLIOTHÈQUE PART COMME L'IMAGE QU'IL EST** (#7938) — le
 * message porte le descripteur `{ stickerId }` ET l'image en pièce jointe :
 * c'est elle que tous les destinataires affichent (`StickerArtwork`), et
 * qu'ils peuvent garder à leur tour. Le fichier servi est déjà normalisé par
 * la passerelle (512 px, EXIF retiré) : il repart tel quel.
 */

const EXTENSION: Readonly<Record<StickerMimeType, string>> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

type Fetcher = (url: string) => Promise<Response>;

/** `null` quand le fichier ne se relit pas — l'écran le DIT, rien ne part. */
export async function stickerFileOf(sticker: StickerDefinition, fetcher: Fetcher = fetch): Promise<File | null> {
  try {
    const response = await fetcher(attachmentSrc(sticker.fileUrl));
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    return new File([bytes], `sticker-${sticker.id}.${EXTENSION[sticker.mimeType]}`, { type: sticker.mimeType });
  } catch {
    return null;
  }
}

export type StickerRefusalKey =
  | 'composer.sticker.error.notImage'
  | 'composer.sticker.error.tooLarge'
  | 'composer.sticker.error.full'
  | 'composer.sticker.error.failed';

/** La phrase de chaque refus de `POST /me/stickers` (`routes/me/stickers.ts`). */
export function stickerRefusalKey(code: string | undefined): StickerRefusalKey {
  if (code === 'STICKER_NOT_AN_IMAGE') return 'composer.sticker.error.notImage';
  if (code === 'STICKER_TOO_LARGE') return 'composer.sticker.error.tooLarge';
  if (code === 'STICKER_LIBRARY_FULL') return 'composer.sticker.error.full';
  return 'composer.sticker.error.failed';
}
