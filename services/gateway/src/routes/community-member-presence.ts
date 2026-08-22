/**
 * Visibilité de la présence des membres rendus dans un APERÇU de communauté.
 *
 * Ce module est délibérément un SIBLING de `routes/communities.ts` et de
 * `routes/communities/search.ts` : les deux servent la même recherche, l'un en
 * production et l'autre non (cf. `module-shadowing.test.ts`), et la loi de
 * présence doit rester la MÊME des deux côtés — sans quoi la consolidation à
 * venir devra arbitrer entre deux comportements au lieu de choisir un fichier.
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
 * Le régime se tranche par LIGNE, pas par route — même loi que le fil de
 * stories : une communauté dont le lecteur EST membre prouve un lien posé des
 * DEUX côtés (appartenance commune) et relève du contexte acquis ; une
 * communauté publique qu'il ne fait que découvrir n'en prouve aucun. La
 * recherche sert `isPrivate: false` sans aucune condition d'appartenance —
 * c'est une surface de DÉCOUVERTE, et son régime par défaut est donc strict.
 *
 * Et un membre qui prouve le lien par UNE communauté de la page le prouve pour
 * toutes : masquer sa pastille sur une ligne pendant qu'elle s'affiche sur la
 * suivante, dans la même page, ne décrirait rien.
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

  const viewer = viewerFromRequest(request);
  const viewerCommunityIds = viewer
    ? new Set(
        (
          await fastify.prisma.communityMember.findMany({
            where: {
              communityId: { in: communities.map(c => c.id) },
              userId: viewer.userId,
              isActive: true
            },
            select: { communityId: true }
          })
        ).map((row: { communityId: string }) => row.communityId)
      )
    : new Set<string>();

  const contextIds = new Set(
    communities.filter(c => viewerCommunityIds.has(c.id)).flatMap(memberIdsOf),
  );
  const strictIds = [...allIds].filter(id => !contextIds.has(id));

  const presence = getPresenceVisibilityService(fastify.prisma);
  const [contextVisibility, strictVisibility] = await Promise.all([
    contextIds.size > 0
      ? presence.resolvePrefsOnly([...contextIds])
      : new Map<string, PresenceVisibility>(),
    strictIds.length > 0
      ? presence.resolveForTargets(viewer, strictIds)
      : new Map<string, PresenceVisibility>()
  ]);

  return new Map([...contextVisibility, ...strictVisibility]);
}
