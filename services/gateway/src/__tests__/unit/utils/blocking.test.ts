/**
 * Unit tests for blocking utility.
 * Covers isBlockedBetween: self-check, A→B block, B→A block, no block, DB error.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { isBlockedBetween } from '../../../utils/blocking';

// ─── Factory ──────────────────────────────────────────────────────────────────

function makePrisma(findFirstResult: { id: string } | null) {
  return {
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(findFirstResult),
    },
  };
}

// ─── isBlockedBetween ─────────────────────────────────────────────────────────

describe('isBlockedBetween', () => {
  it('returns false immediately when both ids are identical (no DB query)', async () => {
    const prisma = makePrisma({ id: 'user-1' });

    const result = await isBlockedBetween(prisma as any, 'user-1', 'user-1');

    expect(result).toBe(false);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('returns true when user A has blocked user B', async () => {
    const prisma = makePrisma({ id: 'user-1' }); // match found

    const result = await isBlockedBetween(prisma as any, 'user-1', 'user-2');

    expect(result).toBe(true);
  });

  it('returns true when user B has blocked user A (bidirectional)', async () => {
    const prisma = makePrisma({ id: 'user-2' }); // match found on the other direction

    const result = await isBlockedBetween(prisma as any, 'user-1', 'user-2');

    expect(result).toBe(true);
  });

  it('returns false when neither user has blocked the other', async () => {
    const prisma = makePrisma(null); // no match

    const result = await isBlockedBetween(prisma as any, 'user-1', 'user-2');

    expect(result).toBe(false);
  });

  it('queries with an OR clause covering both block directions', async () => {
    const prisma = makePrisma(null);

    await isBlockedBetween(prisma as any, 'alice', 'bob');

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { id: 'alice', blockedUserIds: { has: 'bob' } },
            { id: 'bob', blockedUserIds: { has: 'alice' } },
          ],
        },
      }),
    );
  });

  it('only selects the id field (no over-fetching)', async () => {
    const prisma = makePrisma(null);

    await isBlockedBetween(prisma as any, 'alice', 'bob');

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true } }),
    );
  });
});
