import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { contentExitLaw } from '@meeshy/shared/utils/content-exit-law';

import type { FeedCardMedia, FeedCardModel, FeedCardProtection } from './card-model';

/**
 * **UNE PUBLICATION S'IMAGE-T-ELLE ?** (#16166, #16393) — le prédicat LÉGER que
 * les rails lisent pour poser leur baguette, et que la loi complète
 * (`publication-imaging.ts`) applique avant de composer la carte : un seul
 * verdict, deux poids.
 *
 * GARDE : la loi de sortie (`contentExitLaw`, #9573) sur la protection
 * déclarée et sur chaque pièce — un contenu qui disparaît, à vue unique,
 * flouté ou chiffré ne s'image pas. Sinon : une scène, un texte, ou un média
 * qu'une carte sait peindre (photo, vidéo, son).
 */
export type PublicationPiece = FeedCardMedia & {
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly isEncrypted?: boolean | null;
  readonly effectFlags?: number | null;
};

export type PublicationImageable = Pick<FeedCardModel, 'text' | 'scene' | 'protection'> & { readonly media: readonly PublicationPiece[] };

const veiled = (carrier: FeedCardProtection | PublicationPiece): boolean =>
  carrier.isEncrypted === true || carrier.isBlurred === true || ((carrier.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.BLURRED) !== 0;

export function publicationLeaves(input: PublicationImageable): boolean {
  const protection = input.protection ?? {};
  return contentExitLaw({ ...protection, attachments: input.media }).exportable && !veiled(protection) && !input.media.some(veiled);
}

const PAINTABLE: ReadonlySet<FeedCardMedia['kind']> = new Set(['image', 'video', 'audio']);

export const publicationImageable = (input: PublicationImageable): boolean =>
  publicationLeaves(input) && (input.scene !== undefined || (input.text?.full.trim() ?? '') !== '' || input.media.some((piece) => PAINTABLE.has(piece.kind)));
