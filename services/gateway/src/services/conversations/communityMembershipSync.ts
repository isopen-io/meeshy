import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type CommunityMembershipSyncPrisma = Pick<PrismaClient, 'communityMember'>;

/**
 * Aligne l'appartenance à la communauté hôte d'une conversation nouvellement
 * créée avec sa liste de participants — appelée par
 * `POST /conversations` quand `communityId` est fourni.
 *
 * Un départ (#5760) laisse une ligne `CommunityMember` à `isActive: false`
 * plutôt que de la supprimer : la ligne EXISTE toujours pour la paire
 * (communityId, userId), donc un simple `userId: { in: … }` la trouve. Sans
 * distinguer active / inactive, cette route traiterait un ancien membre
 * comme « déjà là » et ne le réintégrerait jamais — même règle que
 * `POST /communities/:id/join` et `.../invite` : réactiver la ligne existante,
 * jamais en créer une seconde pour la même paire.
 */
export async function reconcileCommunityMembership(
  prisma: CommunityMembershipSyncPrisma,
  communityId: string,
  userIds: readonly string[],
): Promise<void> {
  const existingMembers = await prisma.communityMember.findMany({
    where: {
      communityId,
      userId: { in: userIds as string[] },
    },
    select: { id: true, userId: true, isActive: true },
  });

  const inactiveMemberIds = existingMembers
    .filter((member) => !member.isActive)
    .map((member) => member.id);
  const existingUserIds = new Set(existingMembers.map((member) => member.userId));
  const newUserIds = userIds.filter((id) => !existingUserIds.has(id));

  if (inactiveMemberIds.length > 0) {
    await prisma.communityMember.updateMany({
      where: { id: { in: inactiveMemberIds } },
      data: { isActive: true, leftAt: null },
    });
  }

  if (newUserIds.length > 0) {
    await prisma.communityMember.createMany({
      data: newUserIds.map((userId) => ({ communityId, userId })),
    });
  }
}
