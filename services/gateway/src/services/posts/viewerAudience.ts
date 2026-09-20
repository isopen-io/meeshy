/**
 * L'audience d'un VIEWER pour la visibilité d'un post — sortie de
 * `PostService` le 2026-09-02 (le fichier avait grossi de huit lignes sur `dev`
 * au-dessus de sa dette gelée, cliquet #4426 ; on extrait par responsabilité,
 * jamais par tranche).
 *
 * Miroir de `PostFeedService.buildVisibilityFilter` : l'audience FRIENDS/EXCEPT
 * est friends ∪ contacts DM, pour que la lecture d'un post seul, l'enregistrement
 * d'une vue et le fil appliquent LA MÊME règle (G5, divergence story-sota §4).
 * Sans cet alignement, un contact DM non-ami voyait une story dans son fil mais
 * son `POST /view` était rejeté : aucun `PostView`, aucun `story:viewed`, et
 * l'auteur ne voyait jamais cette vue.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import { buildPostVisibilityOrFilter } from './postVisibility';
import { getCommunityCoMemberIds } from './communityVisibility';

/** Le fragment Prisma `where` qui impose la visibilité d'un post à un viewer. */
export async function buildViewerVisibilityFilter(prisma: PrismaClient, viewerUserId?: string) {
  if (!viewerUserId) {
    return { visibility: PostVisibility.PUBLIC };
  }
  const [friendIds, dmContactIds, communityCoMemberIds] = await Promise.all([
    friendIdsForViewer(prisma, viewerUserId),
    directConversationContactIds(prisma, viewerUserId),
    getCommunityCoMemberIds(prisma, viewerUserId),
  ]);
  const audienceIds = [...new Set([...friendIds, ...dmContactIds])];
  /* LE BLOCAGE N'EST PAS POSÉ ICI, ET C'EST UNE DÉCISION (#7184).
     Ce filtre sert les accès UNITAIRES — `PostService.getPostById`,
     `recordView`, `deletePost` — pour lesquels le dépôt a déjà une garde
     dédiée, `canUserConsumePost` (`postConsumptionGate.ts:26` l'écrit :
     « `canUserConsumePost` plutôt que le filtre `buildPostVisibilityOrFilter`
     posé »). Y greffer le blocage mettrait une règle d'audience de LISTE sur
     le chemin d'un post nommé, et ferait payer deux lectures à chaque
     suppression.
     Le blocage des accès unitaires appartient donc à `canUserConsumePost`,
     et c'est un lot à part — nommé dans le commentaire de clôture de #7184
     plutôt que laissé à découvrir. */
  return buildPostVisibilityOrFilter(viewerUserId, audienceIds, communityCoMemberIds);
}

/**
 * Contacts DM (autres membres actifs des conversations directes du viewer).
 * Miroir de `PostFeedService.getDirectConversationContactIds` sans le cache
 * Redis : le seul appelant chaud est `recordView`, une fois par vue.
 */
export async function directConversationContactIds(prisma: PrismaClient, userId: string): Promise<string[]> {
  try {
    const myMemberships = await prisma.participant.findMany({
      where: { userId, isActive: true, conversation: { type: 'direct' } },
      select: { conversationId: true },
    });
    const conversationIds = myMemberships.map((m) => m.conversationId);
    if (conversationIds.length === 0) return [];

    const otherMembers = await prisma.participant.findMany({
      where: {
        conversationId: { in: conversationIds },
        userId: { not: userId },
        isActive: true,
      },
      select: { userId: true },
    });
    return [...new Set(otherMembers.map((m) => m.userId).filter(Boolean) as string[])];
  } catch {
    return [];
  }
}

/** Les amis acceptés du viewer, lui exclu. */
export async function friendIdsForViewer(prisma: PrismaClient, userId: string): Promise<string[]> {
  try {
    const friendRequests = await prisma.friendRequest.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { senderId: true, receiverId: true },
    });
    return Array.from(new Set(friendRequests.flatMap((fr) => [fr.senderId, fr.receiverId])
      .filter((id) => id !== userId)));
  } catch {
    return [];
  }
}
