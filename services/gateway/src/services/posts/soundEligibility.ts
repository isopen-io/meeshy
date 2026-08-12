import { PostVisibility } from '@meeshy/shared/prisma/client';

/**
 * Un contenu alimente-t-il la bibliothèque de sons ?
 *
 * Règle produit (2026-07-31) : **PUBLIC ou COMMUNITY**. Un post réservé à une
 * communauté produit donc un son réutilisable PUBLIQUEMENT, crédité à son
 * auteur — c'est une décision assumée, pas un effet de bord : le son est
 * indépendant de son contenu source dès sa naissance, et l'audience du post ne
 * se propage pas à lui. `FRIENDS`, `PRIVATE`, `EXCEPT` et `ONLY` restent hors
 * bibliothèque.
 *
 * `repostOfId` est rédhibitoire quelle que soit la visibilité : `repostPost`
 * duplique les médias de la source SOUS le reposteur, donc republier créerait
 * un `Sound` crédité au reposteur avec l'audio d'autrui. C'est LE piège
 * d'attribution, et il a trois portes — création, édition, repost.
 *
 * Fonction PURE et partagée : la condition vivait dupliquée sur deux sites de
 * `PostService`, où l'une des deux avait déjà été oubliée une fois.
 */
export function feedsSoundLibrary(input: {
  visibility: PostVisibility | string | null | undefined;
  repostOfId?: string | null;
}): boolean {
  if (input.repostOfId) return false;
  return input.visibility === PostVisibility.PUBLIC
    || input.visibility === PostVisibility.COMMUNITY;
}
