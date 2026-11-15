import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { PostComment } from '@/lib/api/publication-comments';

/**
 * **LA CIBLE D'UNE RÉPONSE** (#8583) — ce que le composeur doit savoir quand
 * on glisse un commentaire (ou qu'on touche « Répondre ») : à QUI on répond,
 * sous quelle RACINE la réponse se range, et quelle @mention préremplir.
 * Miroir de `FeedCommentsSheet.beginReply(to:)` et de `submitComment`
 * (`parentId = replyingTo.parentId ?? replyingTo.id`).
 *
 *  - Répondre à une RACINE : la réponse s'y rattache, aucune mention.
 *  - Répondre à une RÉPONSE : le fil reste à deux niveaux — la réponse se
 *    range sous la même racine — et l'auteur visé est prévenu par une
 *    `@pseudo ` préremplie, que la passerelle transforme en notification.
 *
 * **L'EXTRAIT NE FUIT PAS UN COMMENTAIRE FLOUTÉ** — le bandeau « Répondre à
 * X » cite le texte visé ; pour un commentaire voilé, il ne cite RIEN : le
 * voile de la rangée serait levé par le bandeau posé juste en dessous (« qu'est-
 * ce qui part À CÔTÉ ? », CLAUDE.md § Prisme, cycle 123).
 */
export type CommentReplyTarget = {
  readonly commentId: string;
  readonly rootId: string;
  readonly authorName: string;
  readonly excerpt: string | null;
  readonly mention: string | null;
};

const nonEmpty = (value: string | null | undefined): value is string => typeof value === 'string' && value !== '';

export function isBlurredComment(comment: Pick<PostComment, 'effectFlags'>): boolean {
  const flags = typeof comment.effectFlags === 'number' ? comment.effectFlags : 0;
  return (flags & MESSAGE_EFFECT_FLAGS.BLURRED) !== 0;
}

export function replyTargetOf(
  comment: PostComment,
  view: { readonly authorName: string; readonly displayedText: string },
): CommentReplyTarget {
  const root = nonEmpty(comment.parentId) ? comment.parentId : null;
  const isReply = root !== null;
  const username = comment.author.username;
  return {
    commentId: comment.id,
    rootId: root ?? comment.id,
    authorName: view.authorName,
    excerpt: isBlurredComment(comment) ? null : view.displayedText.trim().slice(0, 140) || null,
    mention: isReply && nonEmpty(username) ? `@${username} ` : null,
  };
}

/**
 * LA MENTION PRÉREMPLIE SE REMPLACE, ELLE NE S'ACCUMULE PAS — changer de
 * cible sans envoyer retire d'abord la mention posée pour la précédente
 * (sinon deux auteurs seraient prévenus), et une mention déjà tapée n'est
 * jamais doublée. Comparaison en PRÉFIXE exact : `@bob` n'est pas `@bobby`.
 */
export function withReplyMention(text: string, previous: string | null, next: string | null): string {
  const stripped = previous !== null && text.startsWith(previous) ? text.slice(previous.length) : text;
  if (next === null || stripped.startsWith(next)) return stripped;
  return `${next}${stripped}`;
}
