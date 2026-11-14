import type { PrismaClient } from '@meeshy/shared/prisma/client';

import type { CacheStore } from '../CacheStore';
import { blockedIdsAroundViewer } from '../ContactDirectoryService';
import { loadFeedCircles, loadFeedFriendIds } from './feedFriends';
import { loadFeedDirectContactIds } from './feedContacts';
import { getCommunityCoMemberIds, getReadableCommunityIds } from './communityVisibility';
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
 * ## Les cercles de la même façon (#13931)
 *
 * Les audiences `ACQUAINTANCES`, `CLOSE` et `BLOOD` se lisent au niveau effectif
 * de l'auteur avec le lecteur : le filtre lit lui-même les cercles du lecteur
 * (`loadFeedCircles`, cache-first), comme il lit le blocage. Les cinq sites de
 * `PostFeedService` n'ont donc qu'un argument de plus (`cache`) et aucun ne peut
 * oublier la carte par niveau. Sans `cache`, la lecture se fait en direct.
 *
 * ## Les communautés de la même façon (#16892)
 *
 * Une publication `COMMUNITY` posée DANS une communauté ne se lit que par les
 * membres de celle-ci : le filtre lit lui-même les communautés lisibles du
 * lecteur (`getReadableCommunityIds`), sans cache, pour que quitter une
 * communauté privée la ferme aussitôt.
 *
 * G5 — audience feed = friends ∪ contacts DM (divergence assumée vs
 * `PostService`, décision produit en attente — story-sota §4) : elle ne porte que
 * `FRIENDS` et `EXCEPT`, jamais les cercles, qui n'admettent aucun contact DM.
 */
export async function buildFeedVisibilityFilter(
  prisma: PrismaClient,
  viewerId: string,
  friendIds: string[],
  communityCoMemberIds: string[] = [],
  cache?: CacheStore
) {
  const [blockedAuthorIds, circles, readableCommunityIds] = await Promise.all([
    blockedIdsAroundViewer(prisma, viewerId),
    loadFeedCircles({ prisma, cache, userId: viewerId }),
    getReadableCommunityIds(prisma, viewerId),
  ]);
  return buildPostVisibilityOrFilter(viewerId, friendIds, communityCoMemberIds, blockedAuthorIds, circles, readableCommunityIds);
}

/**
 * L'audience COMPLÈTE d'un lecteur, composée depuis ses seules lectures :
 * amis ∪ contacts DM, co-membres, puis `buildFeedVisibilityFilter` (blocage,
 * cercles, communautés lisibles). Pour les listes qui n'ont pas déjà ces
 * ensembles en main — recherche globale, favoris (#17182).
 */
export async function viewerPostAudience(prisma: PrismaClient, viewerId: string, cache?: CacheStore) {
  const [friendIds, directContactIds, communityCoMemberIds] = await Promise.all([
    loadFeedFriendIds({ prisma, cache, userId: viewerId }),
    loadFeedDirectContactIds({ prisma, cache, userId: viewerId }),
    getCommunityCoMemberIds(prisma, viewerId, cache),
  ]);
  return buildFeedVisibilityFilter(prisma, viewerId, [...new Set([...friendIds, ...directContactIds])], communityCoMemberIds, cache);
}
