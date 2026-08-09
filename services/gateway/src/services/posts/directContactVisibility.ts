import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * La seule surface Prisma que la résolution touche. Déclarée en `Pick` plutôt
 * qu'en `PrismaClient` entier — même raison que `CommunityVisibilityPrisma` :
 * les appelants qui ne portent qu'une tranche du client la passent sans
 * assertion de type.
 */
export type DirectContactPrisma = Pick<PrismaClient, 'participant'>;

/**
 * Vrai ssi `a` et `b` sont tous deux membres ACTIFS d'une même conversation
 * directe.
 *
 * Pendant pairwise de `getDirectConversationContactIds` (PostService /
 * PostFeedService), exactement comme `doUsersShareCommunity` est le pendant
 * pairwise de `getCommunityCoMemberIds` : pour trancher l'accès d'UN
 * utilisateur à UN post, matérialiser toute la liste de contacts DM coûterait
 * une lecture proportionnelle au carnet d'adresses là où deux requêtes bornées
 * suffisent.
 *
 * La définition d'un « contact DM » est celle du feed, mot pour mot —
 * `conversation.type === 'direct'` et `isActive` des deux côtés. C'est ce qui
 * garantit que ce qu'un viewer peut VOIR dans son feed et ce qu'il peut lire du
 * fil de commentaires du même post restent le même ensemble.
 *
 * **En panne, on REFUSE.** Même politique que `doUsersShareCommunity` et que
 * `filterPostAudience` : un graphe illisible n'ouvre rien.
 */
export async function doUsersShareDirectConversation(
  prisma: DirectContactPrisma,
  a: string,
  b: string,
): Promise<boolean> {
  try {
    const aMemberships = await prisma.participant.findMany({
      where: { userId: a, isActive: true, conversation: { type: 'direct' } },
      select: { conversationId: true },
    });
    if (aMemberships.length === 0) return false;
    const shared = await prisma.participant.findFirst({
      where: {
        userId: b,
        isActive: true,
        conversationId: { in: aMemberships.map((m) => m.conversationId) },
      },
      select: { id: true },
    });
    return shared !== null;
  } catch {
    return false;
  }
}
