import { authoredBy, cardMediaOf, mediaAuthorOf, type CardMediaFields, type MessageCardSubject, type MessageCardSubjectPart } from '@/lib/export/message-card-subject';

import type { FeedCardModel, FeedCardScene } from './card-model';
import { publicationImageable, type PublicationImageable, type PublicationPiece } from './publication-imageable';

/**
 * **« IMAGER » UNE PUBLICATION** (#16166, #16393, directive porteur du
 * 2026-11-05) — un post, un réel ou une story s'image dans l'ATELIER DE CARTE,
 * celui d'un message et d'un commentaire : jamais l'export de scène. Le
 * verdict est `hidden` (rien ne s'image, `publicationImageable`) ou `card` :
 * le sujet de la carte — le texte SERVI par le Prisme (`model.text.full`,
 * `resolveFeedText`), l'auteur, les médias peignables — et, pour une œuvre
 * composée, la scène dont le RENDU devient le média posé sur la carte.
 */
export type PostImagingInput = PublicationImageable & Pick<FeedCardModel, 'id' | 'author' | 'createdAt'>;

export type PostImaging =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'card'; readonly subject: MessageCardSubject; readonly scene: FeedCardScene | null };

const HIDDEN: PostImaging = { kind: 'hidden' };

const CARD_SIDE = 1000;

const cardFieldsOf = (media: PublicationPiece): CardMediaFields => ({
  id: media.id,
  fileUrl: media.src,
  mimeType: media.mimeType ?? `${media.kind}/*`,
  thumbnailUrl: media.thumbnailSrc ?? null,
  width: Math.round(CARD_SIDE * media.ratio),
  height: CARD_SIDE,
  duration: media.durationMs ?? null,
});

const signatureOf = (author: FeedCardModel['author']): Omit<MessageCardSubjectPart, 'text'> => ({
  author: author.name,
  handle: author.username?.replace(/^@+/, '') ?? null,
});

export function postImagingOf(input: PostImagingInput): PostImaging {
  if (!publicationImageable(input)) return HIDDEN;
  const scene = input.scene ?? null;
  const reply: MessageCardSubjectPart = { ...signatureOf(input.author), text: input.text?.full.trim() ?? '' };
  const media = scene === null ? authoredBy(cardMediaOf(input.media.map(cardFieldsOf)), mediaAuthorOf(reply, false)) : [];
  if (scene === null && reply.text === '' && media.length === 0) return HIDDEN;
  return { kind: 'card', subject: { quoted: null, reply, sentAt: new Date(input.createdAt), quotedAt: null, media }, scene };
}
