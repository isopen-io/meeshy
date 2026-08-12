/**
 * @jest-environment node
 *
 * Unit tests for `getDistinctConversationPartnerUserIds` — resolves, in two
 * queries (no N+1), the distinct registered userIds sharing at least one
 * active conversation with a given user. Used to fan out `USER_UPDATED`
 * without a full broadcast.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { getDistinctConversationPartnerUserIds } from '../conversation-partners';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

function createMockPrisma(overrides: {
  participantFindMany?: (args: unknown) => unknown;
  participant2FindMany?: (args: unknown) => unknown;
}) {
  const calls: unknown[] = [];
  const findMany = jest.fn((args: unknown) => {
    calls.push(args);
    if (calls.length === 1) {
      return overrides.participantFindMany?.(args) ?? [];
    }
    return overrides.participant2FindMany?.(args) ?? [];
  });
  const prisma = { participant: { findMany } } as unknown as PrismaClient;
  return { prisma, findMany, calls };
}

describe('getDistinctConversationPartnerUserIds', () => {
  it('returns [] without querying partners when the user has no active conversations', async () => {
    const { prisma, findMany } = createMockPrisma({
      participantFindMany: () => [],
    });

    const result = await getDistinctConversationPartnerUserIds(prisma, 'user-A');

    expect(result).toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('resolves distinct partner userIds across all shared conversations in exactly 2 queries', async () => {
    const { prisma, findMany } = createMockPrisma({
      participantFindMany: () => [{ conversationId: 'conv-1' }, { conversationId: 'conv-2' }],
      participant2FindMany: () => [
        { userId: 'user-B' },
        { userId: 'user-C' },
        { userId: 'user-B' }, // duplicate across conversations — must dedup
      ],
    });

    const result = await getDistinctConversationPartnerUserIds(prisma, 'user-A');

    expect(result.sort()).toEqual(['user-B', 'user-C']);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('excludes the caller and anonymous participants (no userId) from the result', async () => {
    const { prisma } = createMockPrisma({
      participantFindMany: () => [{ conversationId: 'conv-1' }],
      participant2FindMany: () => [{ userId: null }, { userId: 'user-B' }],
    });

    const result = await getDistinctConversationPartnerUserIds(prisma, 'user-A');

    expect(result).toEqual(['user-B']);
  });

  it('scopes the partner lookup to isActive participants in the shared conversations', async () => {
    const { prisma, findMany } = createMockPrisma({
      participantFindMany: () => [{ conversationId: 'conv-1' }],
      participant2FindMany: () => [],
    });

    await getDistinctConversationPartnerUserIds(prisma, 'user-A');

    const secondCallArgs = findMany.mock.calls[1][0] as {
      where: { conversationId: { in: string[] }; isActive: boolean; userId: { not: string } };
    };
    expect(secondCallArgs.where.conversationId.in).toEqual(['conv-1']);
    expect(secondCallArgs.where.isActive).toBe(true);
  });
});
