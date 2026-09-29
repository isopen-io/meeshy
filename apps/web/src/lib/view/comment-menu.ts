import type { PostComment } from '@/lib/api/publication-comments';
import { commentCardSubjectOf } from '@/lib/export/comment-card-subject';
import { maskedByEffects } from '@/lib/export/message-card-subject';

/**
 * **LE MENU « … » D'UN COMMENTAIRE — LOI PURE** (#8734, jumelle web de #8709)
 * — miroir de `CommentRowView.swift` (`hasMoreOptions`, le `Menu` de la
 * rangée) : la MÊME rangée sert le détail d'une publication, la feuille des
 * stories et celle des Réels, donc le même menu, décidé ici une seule fois.
 *
 * - **Copier** : le texte que la rangée AFFICHE (le Prisme, ou l'original
 *   demandé) — jamais un commentaire flouté ou à vue unique : ce qui est
 *   masqué à l'écran ne part pas en clair dans le presse-papiers.
 * - **Imager** : la garde est celle de la carte (`commentCardSubjectOf`) — une
 *   seule loi dit ce qui se peint. Une RACINE qui a des réponses offre aussi
 *   « avec les réponses » ; une RÉPONSE emporte déjà sa racine en citation.
 * - **Modifier / Supprimer** : à l'AUTEUR seul, reflet de la passerelle
 *   (`PATCH`/`DELETE` gardés par le contrôle d'auteur).
 * - **Signaler** : aux AUTRES seuls — se signaler soi-même n'a aucun sens.
 *
 * Une rangée EN VOL n'a pas d'adresse chez la passerelle : aucune entrée.
 */
export type CommentMenuEntry = 'copy' | 'image' | 'imageWithReplies' | 'edit' | 'delete' | 'report';

export function commentMenuEntries(params: {
  readonly comment: PostComment;
  readonly viewerId: string;
  /** Le texte que la rangée affiche en ce moment. */
  readonly servedText: string;
  readonly canImage: boolean;
  readonly canReport: boolean;
}): readonly CommentMenuEntry[] {
  const { comment, viewerId, servedText, canImage, canReport } = params;
  if (comment.pending === true) return [];
  const isMine = viewerId !== '' && comment.author.id === viewerId;
  const copyable = !maskedByEffects(comment.effectFlags) && servedText.trim() !== '';
  const imageable = canImage && commentCardSubjectOf({ comment, servedText, parent: null }) !== null;
  const isRoot = typeof comment.parentId !== 'string' || comment.parentId === '';
  const hasReplies = typeof comment.replyCount === 'number' && comment.replyCount > 0;
  return [
    ...(copyable ? (['copy'] as const) : []),
    ...(imageable ? (['image'] as const) : []),
    ...(imageable && isRoot && hasReplies ? (['imageWithReplies'] as const) : []),
    ...(isMine ? (['edit', 'delete'] as const) : []),
    ...(!isMine && canReport ? (['report'] as const) : []),
  ];
}
