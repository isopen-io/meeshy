/**
 * Bidirectional block resolution helper.
 *
 * The block model is `User.blockedUserIds: String[]` (no Block table):
 * `userA.blockedUserIds` containing `userB.id` means "A blocked B".
 *
 * Blocking is bidirectional for messaging enforcement: a DM is rejected if
 * the current user blocked the other OR the other blocked the current user.
 *
 * @see packages/shared/prisma/schema.prisma (User.blockedUserIds)
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Returns true when either user has blocked the other.
 *
 * Uses a single `findFirst` with an OR clause so a match in either direction
 * short-circuits at the database. Equal ids return false without a query.
 */
export async function isBlockedBetween(
  prisma: PrismaClient,
  userIdA: string,
  userIdB: string
): Promise<boolean> {
  if (userIdA === userIdB) {
    return false;
  }

  const match = await prisma.user.findFirst({
    where: {
      OR: [
        { id: userIdA, blockedUserIds: { has: userIdB } },
        { id: userIdB, blockedUserIds: { has: userIdA } },
      ],
    },
    select: { id: true },
  });

  return match !== null;
}
