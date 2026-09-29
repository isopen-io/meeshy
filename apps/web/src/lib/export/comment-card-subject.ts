import type { PostComment } from '@/lib/api/publication-comments';

import { cardMediaOf, maskedByEffects, type MessageCardSubject, type MessageCardSubjectPart } from './message-card-subject';

/**
 * **UN COMMENTAIRE S'IMAGE COMME UN MESSAGE** (#8693) — même carte, même
 * atelier : le commentaire est la « réponse », celui auquel il répond est la
 * « citation ». Les mots sont ceux que le lecteur VOIT (`resolveFeedText`, le
 * Prisme des commentaires), passés par l'hôte qui les a déjà rendus.
 *
 * GARDE : un commentaire encore EN VOL n'a pas d'existence à partager, et un
 * commentaire masqué par ses effets (vue unique, flou) ne se peint pas.
 */

const nonBlank = (value: string | null | undefined): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

const partOf = (comment: PostComment, text: string): MessageCardSubjectPart => ({
  author: nonBlank(comment.author.displayName) ?? nonBlank(comment.author.username) ?? 'Meeshy',
  text,
  handle: nonBlank(comment.author.username)?.replace(/^@+/, '') ?? null,
});

export function commentCardSubjectOf(params: {
  readonly comment: PostComment;
  /** Le texte SERVI du commentaire, tel que la rangée l'affiche. */
  readonly servedText: string;
  readonly parent: { readonly comment: PostComment; readonly servedText: string } | null;
}): MessageCardSubject | null {
  const { comment, parent } = params;
  if (comment.pending === true || maskedByEffects(comment.effectFlags)) return null;
  const text = params.servedText.trim();
  const media = cardMediaOf(comment.media);
  if (text === '' && media.length === 0) return null;
  const quotedText = parent === null || maskedByEffects(parent.comment.effectFlags) ? '' : parent.servedText.trim();
  return {
    quoted: parent === null || quotedText === '' ? null : partOf(parent.comment, quotedText),
    reply: partOf(comment, text),
    sentAt: new Date(comment.createdAt),
    quotedAt: parent === null || quotedText === '' ? null : new Date(parent.comment.createdAt),
    media,
  };
}
