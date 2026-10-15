import type { MessageSticker } from '@meeshy/shared/types/message-sticker';
import { parseStickerPackTemplateId } from '@meeshy/shared/types/sticker-pack';
import type { StickerDefinition } from '@meeshy/shared/types/sticker-definition';

import { attachmentSrc } from '@/lib/api/media-url';

/**
 * **LE STICKER REÇU SE RANGE DANS « MES STICKERS »** (#10630) — la loi PURE de
 * « Ajouter à mes stickers » et de « Dans mes stickers ✓ ».
 *
 * Un sticker de bibliothèque envoyé porte `stickerId` : s'il figure dans la
 * bibliothèque du lecteur, il y est déjà (le sien renvoyé, ou un déjà ajouté).
 * Un sticker reçu n'a pas d'identifiant chez le lecteur : l'ajout relit
 * l'image jointe et la dépose avec l'origine `received` (la passerelle la
 * normalise et la déduplique ; l'origine n'ouvre aucun crédit de création).
 * Les ajouts de la session sont retenus par CLÉ de pièce jointe, parce que la
 * bibliothèque servie a un autre identifiant que celui de l'expéditeur.
 */

type Picture = { readonly fileUrl: string } | undefined;

export const stickerKeyOf = (sticker: MessageSticker, picture: Picture): string | null => {
  if (picture !== undefined && picture.fileUrl !== '') return picture.fileUrl;
  return sticker.stickerId ?? null;
};

/** Seule une image jointe se dépose en bibliothèque : un sticker sans elle (glyphe emoji, gabarit seul) n'offre aucun ajout. */
export const stickerAddable = (picture: Picture): boolean => picture !== undefined && picture.fileUrl !== '';

/** Le pack d'où vient le sticker, quand son gabarit le dit (`pack.<slug>.<clé>`). */
export const stickerPackSlugOf = (sticker: MessageSticker): string | null => parseStickerPackTemplateId(sticker.templateId)?.slug ?? null;

export function stickerInLibrary(params: {
  readonly sticker: MessageSticker;
  readonly picture: Picture;
  readonly library: readonly Pick<StickerDefinition, 'id'>[];
  readonly added: ReadonlySet<string>;
}): boolean {
  const { sticker, picture, library, added } = params;
  if (sticker.stickerId !== undefined && library.some((owned) => owned.id === sticker.stickerId)) return true;
  const key = stickerKeyOf(sticker, picture);
  return key !== null && added.has(key);
}

const addedKeys = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

export const subscribeAdded = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const addedSnapshot = (): ReadonlySet<string> => snapshot;

export function noteStickerAdded(key: string): void {
  if (addedKeys.has(key)) return;
  addedKeys.add(key);
  snapshot = new Set(addedKeys);
  listeners.forEach((listener) => listener());
}

/** TÉMOIN SEUL. */
export function resetAddedStickersForTests(): void {
  addedKeys.clear();
  snapshot = new Set();
}

type Fetcher = (url: string) => Promise<Response>;

/** L'image jointe, relue pour être déposée en bibliothèque ; `null` : elle ne se relit pas, rien ne part. */
export async function receivedStickerFile(fileUrl: string, fetcher: Fetcher = fetch): Promise<File | null> {
  try {
    const response = await fetcher(attachmentSrc(fileUrl));
    if (!response.ok) return null;
    const blob = await response.blob();
    const type = blob.type === '' ? 'image/png' : blob.type;
    return new File([blob], 'sticker', { type });
  } catch {
    return null;
  }
}
