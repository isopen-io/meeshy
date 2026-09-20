import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { blockedIdsAroundViewer } from '../ContactDirectoryService';
import { buildPostVisibilityOrFilter } from './postVisibility';

/**
 * LE FILTRE DE VISIBILITÉ DES REQUÊTES DE LISTE — fil, stories, statuts, réels,
 * publications d'un profil.
 *
 * ## Pourquoi un module, et pas une méthode privée
 *
 * Sorti de `PostFeedService` le 2026-09-20 (#7184) : le fichier était hors de
 * son budget de taille (cliquet #4426), et la règle du dépôt est qu'on
 * EXTRAIT d'abord, on ajoute ensuite. L'extraction se fait par
 * RESPONSABILITÉ — « quelle audience voit quoi » n'est pas « comment on
 * compose un fil » — jamais par tranche.
 *
 * ## Le blocage est résolu ICI, pas chez les appelants
 *
 * Les cinq sites qui composent un fil ont chacun leur `Promise.all`
 * d'audience ; y ajouter une sixième lecture aurait été cinq occasions d'en
 * oublier une — et c'est précisément l'oubli que #7184 corrige. La fonction
 * est `async` pour que la garde voyage AVEC le filtre, jamais à côté.
 *
 * G5 — audience feed = friends ∪ contacts DM (divergence assumée vs
 * `PostService`, décision produit en attente — story-sota §4).
 */
export async function buildFeedVisibilityFilter(
  prisma: PrismaClient,
  viewerId: string,
  friendIds: string[],
  communityCoMemberIds: string[] = []
) {
  const blockedAuthorIds = await blockedIdsAroundViewer(prisma, viewerId);
  return buildPostVisibilityOrFilter(viewerId, friendIds, communityCoMemberIds, blockedAuthorIds);
}
