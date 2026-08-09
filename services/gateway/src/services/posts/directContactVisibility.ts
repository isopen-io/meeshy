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
 * `filterPostConsumers` : un graphe illisible n'ouvre rien.
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

/**
 * Lesquels, parmi `candidates`, partagent une conversation directe active avec
 * `userId`.
 *
 * Pendant BORNÉ de `getDirectConversationContactIds` : celui-ci matérialise tout
 * le carnet d'adresses, ce que `filterPostConsumers` ne peut pas se permettre
 * (un auteur à 5 000 contacts nommant une personne coûterait 5 000 lignes). La
 * borne `in` fait faire l'intersection à la base, comme `loadFriendIdsAmong`
 * pour le graphe ami.
 *
 * `doUsersShareDirectConversation` reste le pendant pairwise, pour les décisions
 * portant sur UN utilisateur — les trois formes lisent la même définition d'un
 * contact DM : `conversation.type === 'direct'` et `isActive` des deux côtés.
 *
 * Rend `null` — et non `Set()` — quand la lecture échoue, pour que l'appelant
 * distingue « aucun contact DM parmi les candidats » de « on ne sait pas ». Même
 * contrat que `loadFriendIdsAmong` : les deux mènent au refus, mais seul le
 * second est une panne, et l'appelant garde ce qu'il avait déjà établi.
 */
export async function filterDirectContactIdsAmong(
  prisma: DirectContactPrisma,
  userId: string,
  candidates: readonly string[],
): Promise<Set<string> | null> {
  if (candidates.length === 0) return new Set();
  try {
    const memberships = await prisma.participant.findMany({
      where: { userId, isActive: true, conversation: { type: 'direct' } },
      select: { conversationId: true },
    });
    if (memberships.length === 0) return new Set();

    const shared = await prisma.participant.findMany({
      where: {
        userId: { in: [...candidates] },
        isActive: true,
        conversationId: { in: memberships.map((m) => m.conversationId) },
      },
      select: { userId: true },
    });

    return new Set(
      shared.map((p) => p.userId).filter((id): id is string => typeof id === 'string')
    );
  } catch {
    return null;
  }
}
