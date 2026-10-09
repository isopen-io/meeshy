import type { PostViewerRow } from '@meeshy/shared/types/publication-viewers';

/**
 * CE QUE CHAQUE PERSONNE DE LA LISTE DES VUES A FAIT (#9727) — la projection
 * d'une ligne servie en MARQUES à afficher, dans l'ordre de la feuille iOS
 * (`StoryViewersSheet`) : réactions, commentaires, réponses, republications,
 * partages.
 *
 * **Le favori ne s'y montre jamais** (décision porteur 2026-10-09) : mettre un
 * contenu de côté reste privé. Une passerelle plus ancienne qui servirait
 * encore `bookmarked` n'y gagne aucune marque.
 *
 * **Un compteur à zéro ne produit pas de marque.** La passerelle n'en sert
 * pas ; la règle est redite ici pour qu'une ligne venue d'ailleurs (un
 * bouchon, un serveur plus ancien) ne fabrique jamais « 0 commentaire ».
 *
 * **Un serveur d'avant #9727** ne sert que `reaction` (la plus récente) : elle
 * devient la seule réaction de la ligne plutôt que de disparaître.
 */
export type ViewerEngagementMark =
  | { readonly kind: 'reactions'; readonly emojis: readonly string[] }
  | { readonly kind: 'comments' | 'replies' | 'reposts' | 'shares'; readonly count: number };

const counted = (kind: 'comments' | 'replies' | 'reposts' | 'shares', count: number | undefined): readonly ViewerEngagementMark[] =>
  count !== undefined && count > 0 ? [{ kind, count }] : [];

export function viewerEngagementMarks(row: Omit<PostViewerRow, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'viewedAt'>): readonly ViewerEngagementMark[] {
  const emojis = row.reactions !== undefined && row.reactions.length > 0 ? row.reactions : row.reaction !== null ? [row.reaction] : [];
  return [
    ...(emojis.length > 0 ? [{ kind: 'reactions', emojis } as const] : []),
    ...counted('comments', row.commentCount),
    ...counted('replies', row.replyCount),
    ...counted('reposts', row.repostCount),
    ...counted('shares', row.shareCount),
  ];
}
