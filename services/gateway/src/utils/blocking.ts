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

/**
 * Batched version of {@link isBlockedBetween} for filtering many candidates
 * against one user in a single round-trip (2 queries instead of N).
 *
 * Returns the subset of `candidateIds` that have a bidirectional block
 * relationship with `userId` (either side blocked the other).
 */
export async function getBlockedUserIdsAmong(
  prisma: PrismaClient,
  userId: string,
  candidateIds: string[]
): Promise<Set<string>> {
  const ids = [...new Set(candidateIds)].filter((id) => id !== userId);
  if (ids.length === 0) {
    return new Set();
  }

  const [blockedByCandidates, userRow] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids }, blockedUserIds: { has: userId } },
      select: { id: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { blockedUserIds: true } }),
  ]);

  const blocked = new Set(blockedByCandidates.map((r) => r.id));
  // Membership through a Set, never `ids.includes`: this runs on the presence
  // and typing broadcast paths, where `ids` is the online audience and
  // `blockedUserIds` is the broadcaster's own block list. A linear scan per
  // blocked id makes the intersection |blockedUserIds| x |ids| — synchronous
  // work on the event loop, on a path that fires per keystroke burst and per
  // presence transition.
  const candidateSet = new Set(ids);
  for (const bid of (userRow?.blockedUserIds ?? []) as string[]) {
    if (candidateSet.has(bid)) blocked.add(bid);
  }
  return blocked;
}

/**
 * The FULL bidirectional block set for one user — every id that blocked them or
 * that they blocked — resolved without a candidate list.
 *
 * The sibling {@link getBlockedUserIdsAmong} narrows "who blocked me" with
 * `id: { in: candidateIds }`, which is the right shape while the candidates are
 * an AUDIENCE: one conversation's participants, one snapshot's contacts. It is
 * the wrong shape for a caller whose only candidate list is the entire connected
 * population, because the query then grows with the server rather than with the
 * question — and the caller pays it on every presence transition.
 *
 * This helper inverts that: the cost is bounded by the block relation itself
 * (`@@index([blockedUserIds])` on `User`), which is empty for almost everyone.
 *
 * Intersecting the result with a live socket map is the caller's job and is what
 * makes the swap behaviour-preserving: an id in this set that owns no socket
 * contributes nothing to an exclusion list, exactly as a candidate filter would
 * have dropped it.
 */
export async function getBlockRelatedUserIds(
  prisma: PrismaClient,
  userId: string
): Promise<Set<string>> {
  const [blockers, userRow] = await Promise.all([
    prisma.user.findMany({
      where: { blockedUserIds: { has: userId } },
      select: { id: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { blockedUserIds: true } }),
  ]);

  const related = new Set<string>();
  for (const row of blockers) related.add(row.id);
  for (const bid of (userRow?.blockedUserIds ?? []) as string[]) related.add(bid);
  related.delete(userId);
  return related;
}
