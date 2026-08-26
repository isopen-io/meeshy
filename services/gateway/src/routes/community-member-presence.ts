/**
 * Visibilité de la présence des membres rendus dans un APERÇU de communauté.
 *
 * Ce module a été hoisté en SIBLING de `routes/communities.ts` et de
 * `routes/communities/search.ts` du temps où les deux servaient la même
 * recherche, l'un en production et l'autre non : la loi de présence devait
 * rester la MÊME des deux côtés, pour que la consolidation à venir ait à
 * choisir un fichier et non à arbitrer entre deux comportements.
 *
 * Cette consolidation a eu lieu (cycle 86-ter) : `routes/communities.ts` est
 * une coquille de ré-export, et `routes/communities/search.ts` est l'unique
 * appelant. Le module reste ici — le déplacer serait de la churn pure — mais sa
 * raison d'être est désormais la mutualisation ordinaire, plus l'ombrage.
 */
import { FastifyInstance, FastifyRequest } from 'fastify';
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import { getPresenceVisibilityService } from '../services/PresenceVisibilityService';
import { viewerFromRequest } from './users/presence-gate';

/**
 * Profil inline porté par un membre d'aperçu. Pas de `lastActiveAt` : l'aperçu
 * ne le charge pas, et `applyPresenceVisibilityAsOffline` ne fabrique pas la
 * clé — une réponse ne gagne pas un champ parce qu'on l'a filtrée.
 */
export type PreviewMemberProfile = { id: string; isOnline: boolean | null };
export type PreviewMemberRow = { user?: PreviewMemberProfile | null };
export type PreviewCommunityRow = { id: string; members: PreviewMemberRow[] };

/**
 * Critère STRICT pour tout id de membre rendu dans un aperçu de communauté —
 * sans condition sur la page. Avant la directive produit du 2026-08-25, la
 * co-appartenance à une communauté que le lecteur partageait ailleurs sur la
 * même page basculait ces membres-là en régime préférences-seules ; ce
 * régime PAR LIGNE a disparu avec la loi qui le fondait (« ce n'est pas
 * parce qu'on partage une communauté qu'on doit voir la présence de
 * l'autre »). Un seul appel à `resolveForTargets`, avec le viewer réel de la
 * requête, tranche désormais la page entière.
 */
export async function resolveCommunityMemberPresence(
  fastify: FastifyInstance,
  request: FastifyRequest,
  communities: PreviewCommunityRow[],
): Promise<Map<string, PresenceVisibility>> {
  const memberIdsOf = (community: PreviewCommunityRow) =>
    community.members.map(m => m.user?.id).filter((id): id is string => typeof id === 'string');

  const allIds = new Set(communities.flatMap(memberIdsOf));
  if (allIds.size === 0) return new Map();

  return getPresenceVisibilityService(fastify.prisma).resolveForTargets(viewerFromRequest(request), [...allIds]);
}
