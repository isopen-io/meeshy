/**
 * @jest-environment node
 *
 * Unit tests for the bidirectional block helper `isBlockedBetween`.
 *
 * Prisma is mocked — these tests verify the helper's query shape and
 * boolean resolution without touching the database. The block model is
 * `User.blockedUserIds: String[]` (no Block table): `A.blockedUserIds`
 * containing `B.id` means "A blocked B".
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { isBlockedBetween, getBlockedUserIdsAmong } from '../blocking';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

function createMockPrisma(findFirstImpl: (args: unknown) => unknown) {
  const findFirst = jest.fn(findFirstImpl as never);
  const prisma = { user: { findFirst } } as unknown as PrismaClient;
  return { prisma, findFirst };
}

describe('isBlockedBetween', () => {
  it('returns true when A blocked B', async () => {
    // The OR query matches the row where id=A has B in blockedUserIds.
    const { prisma, findFirst } = createMockPrisma(() => ({ id: 'A' }));

    await expect(isBlockedBetween(prisma, 'A', 'B')).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns true when B blocked A (other direction)', async () => {
    const { prisma } = createMockPrisma(() => ({ id: 'B' }));

    await expect(isBlockedBetween(prisma, 'A', 'B')).resolves.toBe(true);
  });

  it('returns false when neither blocked the other', async () => {
    const { prisma } = createMockPrisma(() => null);

    await expect(isBlockedBetween(prisma, 'A', 'B')).resolves.toBe(false);
  });

  it('returns false for equal ids without querying the database', async () => {
    const { prisma, findFirst } = createMockPrisma(() => ({ id: 'A' }));

    await expect(isBlockedBetween(prisma, 'A', 'A')).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('queries both directions in a single findFirst with an OR clause', async () => {
    const { prisma, findFirst } = createMockPrisma(() => null);

    await isBlockedBetween(prisma, 'A', 'B');

    expect(findFirst).toHaveBeenCalledTimes(1);
    const arg = findFirst.mock.calls[0][0] as {
      where: { OR: Array<{ id: string; blockedUserIds: { has: string } }> };
      select: { id: boolean };
    };
    expect(arg.where.OR).toEqual([
      { id: 'A', blockedUserIds: { has: 'B' } },
      { id: 'B', blockedUserIds: { has: 'A' } },
    ]);
    expect(arg.select).toEqual({ id: true });
  });
});

describe('getBlockedUserIdsAmong', () => {
  function createMockPrisma(opts: {
    findManyResult?: Array<{ id: string }>;
    findUniqueResult?: { blockedUserIds: string[] } | null;
  }) {
    const findMany = jest.fn(async () => opts.findManyResult ?? []);
    const findUnique = jest.fn(async () => opts.findUniqueResult ?? null);
    const prisma = { user: { findMany, findUnique } } as unknown as PrismaClient;
    return { prisma, findMany, findUnique };
  }

  it('returns empty set without querying when candidateIds is empty', async () => {
    const { prisma, findMany, findUnique } = createMockPrisma({});

    await expect(getBlockedUserIdsAmong(prisma, 'A', [])).resolves.toEqual(new Set());
    expect(findMany).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('excludes the userId itself from candidates without querying when it is the only candidate', async () => {
    const { prisma, findMany } = createMockPrisma({});

    await expect(getBlockedUserIdsAmong(prisma, 'A', ['A'])).resolves.toEqual(new Set());
    expect(findMany).not.toHaveBeenCalled();
  });

  it('includes candidates who blocked userId', async () => {
    const { prisma } = createMockPrisma({ findManyResult: [{ id: 'B' }] });

    await expect(getBlockedUserIdsAmong(prisma, 'A', ['B', 'C'])).resolves.toEqual(new Set(['B']));
  });

  it('includes candidates userId blocked (other direction)', async () => {
    const { prisma } = createMockPrisma({ findUniqueResult: { blockedUserIds: ['C'] } });

    await expect(getBlockedUserIdsAmong(prisma, 'A', ['B', 'C'])).resolves.toEqual(new Set(['C']));
  });

  it('unions both directions and dedupes candidateIds', async () => {
    const { prisma } = createMockPrisma({
      findManyResult: [{ id: 'B' }],
      findUniqueResult: { blockedUserIds: ['C', 'not-a-candidate'] },
    });

    await expect(getBlockedUserIdsAmong(prisma, 'A', ['B', 'B', 'C'])).resolves.toEqual(new Set(['B', 'C']));
  });

  it('returns empty set when neither direction has a block', async () => {
    const { prisma } = createMockPrisma({ findUniqueResult: { blockedUserIds: [] } });

    await expect(getBlockedUserIdsAmong(prisma, 'A', ['B', 'C'])).resolves.toEqual(new Set());
  });

  it('handles a null blockedUserIds row gracefully', async () => {
    const { prisma } = createMockPrisma({ findUniqueResult: null });

    await expect(getBlockedUserIdsAmong(prisma, 'A', ['B'])).resolves.toEqual(new Set());
  });
});
