import { contentExitLaw, type ContentExitSubject } from '@meeshy/shared/utils/content-exit-law';

import { authoredBy, cardMediaOf, mediaAuthorOf, type CardMediaFields, type MessageCardSubject, type MessageCardSubjectPart } from '@/lib/export/message-card-subject';
import { pieceIsOpen, type ExitPiece } from '@/lib/view/content-exit';

import type { FeedCardMedia, FeedCardModel, FeedCardScene } from './card-model';

/**
 * **« IMAGER » UNE PUBLICATION** (#16166, directive porteur du 2026-11-05) —
 * un post, un réel ou une story s'image dans l'ATELIER DE CARTE, celui d'un
 * message et d'un commentaire : jamais l'export de scène. Le verdict est
 * `hidden` (rien ne s'image) ou `card` : le sujet de la carte (le texte SERVI
 * par le Prisme, `model.text.full`, l'auteur, les médias peignables) et, pour
 * une œuvre composée, la scène dont le rendu est le média posé sur la carte.
 *
 * GARDE : la loi de sortie (`contentExitLaw`, #9573), lue sur la protection
 * déclarée et sur chaque pièce — un contenu qui disparaît, flouté, à vue
 * unique ou chiffré ne s'image pas.
 */
export type PublicationProtection = ContentExitSubject & { readonly isEncrypted?: boolean | null };

export type PublicationImagingMedia = FeedCardMedia & ExitPiece;

export type PostImagingInput = Pick<FeedCardModel, 'id' | 'author' | 'text' | 'createdAt' | 'scene'> & {
  readonly media: readonly PublicationImagingMedia[];
  readonly protection?: PublicationProtection;
};

export type PostImaging =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'card'; readonly subject: MessageCardSubject; readonly scene: FeedCardScene | null };

const HIDDEN: PostImaging = { kind: 'hidden' };

const CARD_SIDE = 1000;

const cardFieldsOf = (media: PublicationImagingMedia): CardMediaFields => ({
  id: media.id,
  fileUrl: media.src,
  mimeType: media.mimeType ?? `${media.kind}/*`,
  thumbnailUrl: media.thumbnailSrc ?? null,
  width: Math.round(CARD_SIDE * media.ratio),
  height: CARD_SIDE,
  duration: media.durationMs ?? null,
  isViewOnce: media.isViewOnce === true,
  isBlurred: media.isBlurred === true,
  isEncrypted: media.isEncrypted === true,
  effectFlags: media.effectFlags ?? null,
});

const exportable = (input: PostImagingInput): boolean => {
  const protection = input.protection ?? {};
  const law = contentExitLaw({ ...protection, attachments: input.media });
  return law.exportable && protection.isEncrypted !== true && input.media.every(pieceIsOpen);
};

const signatureOf = (author: FeedCardModel['author']): Omit<MessageCardSubjectPart, 'text'> => ({
  author: author.name,
  handle: author.username?.replace(/^@+/, '') ?? null,
});

export function postImagingOf(input: PostImagingInput): PostImaging {
  if (!exportable(input)) return HIDDEN;
  const text = input.text?.full.trim() ?? '';
  const scene = input.scene ?? null;
  const reply: MessageCardSubjectPart = { ...signatureOf(input.author), text };
  const media = scene === null ? authoredBy(cardMediaOf(input.media.map(cardFieldsOf)), mediaAuthorOf(reply, false)) : [];
  if (scene === null && text === '' && media.length === 0) return HIDDEN;
  return {
    kind: 'card',
    subject: { quoted: null, reply, sentAt: new Date(input.createdAt), quotedAt: null, media },
    scene,
  };
}
