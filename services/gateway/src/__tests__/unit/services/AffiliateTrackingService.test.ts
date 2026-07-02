/**
 * AffiliateTrackingService Unit Tests
 *
 * Covers:
 * - trackAffiliateVisit(): invalid/inactive token, expired token, max-uses limit, session creation
 * - convertAffiliateVisit(): invalid/inactive token, expired/max-uses, existing relation (idempotent),
 *   creates relation + increments counter + friend request + session update + sessionError logged
 * - getAffiliateStats(): all filters, no filters, maps results correctly
 * - cleanupExpiredSessions(): deleted count returned, error path
 *
 * @jest-environment node
 */

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { AffiliateTrackingService } from '../../../services/AffiliateTrackingService';

const NOW = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2099-12-31T00:00:00Z');
const PAST = new Date('2020-01-01T00:00:00Z');

function makeToken(overrides?: object) {
  return {
    id: 'tok_001',
    token: 'abc123',
    createdBy: 'user_creator',
    isActive: true,
    expiresAt: null,
    maxUses: null,
    currentUses: 0,
    ...overrides,
  };
}

function makePrisma(overrides?: {
  affiliateToken?: Record<string, jest.Mock>;
  affiliateRelation?: Record<string, jest.Mock>;
  userPreference?: Record<string, jest.Mock>;
  friendRequest?: Record<string, jest.Mock>;
}) {
  return {
    affiliateToken: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      ...overrides?.affiliateToken,
    },
    affiliateRelation: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'rel_001', status: 'completed' }),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      ...overrides?.affiliateRelation,
    },
    userPreference: {
      create: jest.fn().mockResolvedValue({ id: 'pref_001' }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...overrides?.userPreference,
    },
    friendRequest: {
      create: jest.fn().mockResolvedValue({ id: 'freq_001' }),
      ...overrides?.friendRequest,
    },
  } as any;
}

// ---------------------------------------------------------------------------
// trackAffiliateVisit
// ---------------------------------------------------------------------------
describe('AffiliateTrackingService.trackAffiliateVisit', () => {
  const token = 'abc123';
  const visitorData = { ipAddress: '1.2.3.4', userAgent: 'Mozilla/5.0' };

  it('returns error when token does not exist', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, token, visitorData);
    expect(result).toEqual({ success: false, error: 'Token invalide' });
  });

  it('returns error when token is inactive', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken({ isActive: false })) },
    });
    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, token, visitorData);
    expect(result).toEqual({ success: false, error: 'Token invalide' });
  });

  it('returns error when token is expired', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken({ expiresAt: PAST })) },
    });
    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, token, visitorData);
    expect(result).toEqual({ success: false, error: 'Token expiré' });
  });

  it('accepts token with expiresAt in the future', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken({ expiresAt: FUTURE })) },
    });
    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, token, visitorData);
    expect(result.success).toBe(true);
  });

  it('returns error when max uses reached', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken({ maxUses: 10, currentUses: 10 })) },
    });
    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, token, visitorData);
    expect(result).toEqual({ success: false, error: "Limite d'utilisation atteinte" });
  });

  it('creates a userPreference session record on success', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
    });
    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, token, visitorData);

    expect(result.success).toBe(true);
    expect(result.data?.tokenId).toBe('tok_001');
    expect(result.data?.affiliateUserId).toBe('user_creator');
    expect(result.data?.sessionKey).toMatch(/^affiliate_session_abc123_/);

    expect(prisma.userPreference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_creator',
          key: expect.stringMatching(/^affiliate_session_/),
          valueType: 'json',
        }),
      })
    );
  });

  it('stores visitor data serialized as JSON in the session', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
    });
    await AffiliateTrackingService.trackAffiliateVisit(prisma, token, visitorData);

    const createCall = prisma.userPreference.create.mock.calls[0][0];
    const value = JSON.parse(createCall.data.value);
    expect(value.visitorData).toBe(JSON.stringify(visitorData));
    expect(value.converted).toBe(false);
    expect(value.affiliateTokenId).toBe('tok_001');
  });

  it('returns error object when prisma throws', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockRejectedValue(new Error('DB error')) },
    });
    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, token, visitorData);
    expect(result).toEqual({ success: false, error: 'Erreur lors du tracking' });
  });
});

// ---------------------------------------------------------------------------
// convertAffiliateVisit
// ---------------------------------------------------------------------------
describe('AffiliateTrackingService.convertAffiliateVisit', () => {
  const token = 'abc123';
  const userId = 'user_referred';

  it('returns error when token does not exist', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);
    expect(result).toEqual({ success: false, error: 'Token invalide' });
  });

  it('returns error when token is inactive', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken({ isActive: false })) },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);
    expect(result).toEqual({ success: false, error: 'Token invalide' });
  });

  it('returns error when token is expired', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken({ expiresAt: PAST })) },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);
    expect(result).toEqual({ success: false, error: 'Token expiré' });
  });

  it('returns error when max uses reached', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken({ maxUses: 5, currentUses: 5 })) },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);
    expect(result).toEqual({ success: false, error: "Limite d'utilisation atteinte" });
  });

  it('is idempotent — returns existing relation without creating a new one', async () => {
    const existingRelation = { id: 'rel_existing', status: 'completed' };
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
      affiliateRelation: {
        findFirst: jest.fn().mockResolvedValue(existingRelation),
        create: jest.fn(),
      },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);

    expect(result).toEqual({ success: true, data: { id: 'rel_existing', status: 'completed' } });
    expect(prisma.affiliateRelation.create).not.toHaveBeenCalled();
  });

  it('creates relation, increments counter, creates friend request on success', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 'rel_001', status: 'completed' });

    expect(prisma.affiliateRelation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        affiliateTokenId: 'tok_001',
        affiliateUserId: 'user_creator',
        referredUserId: userId,
        status: 'completed',
      }),
    });

    expect(prisma.affiliateToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'tok_001' },
      data: { currentUses: { increment: 1 } },
    });

    expect(prisma.friendRequest.create).toHaveBeenCalledWith({
      data: {
        senderId: 'user_creator',
        receiverId: userId,
        status: 'accepted',
      },
    });
  });

  it('increments the counter atomically, never via a read-then-write value', async () => {
    // Regression guard for the lost-update race: two concurrent conversions on
    // the same token both read currentUses=N and would each write N+1 with a
    // JS-computed value, losing one increment. Delegating to Prisma's atomic
    // `{ increment: 1 }` lets MongoDB serialize both, so neither is lost.
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken({ currentUses: 7 })) },
    });
    await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);

    const updateCall = prisma.affiliateToken.updateMany.mock.calls[0][0];
    expect(updateCall.data.currentUses).toEqual({ increment: 1 });
    // Must NOT pass a pre-computed number (which is what loses updates).
    expect(typeof updateCall.data.currentUses).not.toBe('number');
  });

  it('reserves a slot with a cap-guarded conditional update when maxUses is set', async () => {
    // The reservation must include the cap in its `where` so MongoDB enforces
    // `currentUses < maxUses` atomically (not just an unconditional increment).
    const prisma = makePrisma({
      affiliateToken: {
        findUnique: jest.fn().mockResolvedValue(makeToken({ maxUses: 10, currentUses: 3 })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);

    expect(result.success).toBe(true);
    expect(prisma.affiliateToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'tok_001', currentUses: { lt: 10 } },
      data: { currentUses: { increment: 1 } },
    });
    expect(prisma.affiliateRelation.create).toHaveBeenCalled();
  });

  it('enforces maxUses atomically: no relation when the reservation loses the cap race', async () => {
    // Two concurrent conversions both pass the read-time pre-check (currentUses < maxUses),
    // but only `maxUses - currentUses` conditional updateMany can match. The loser gets
    // count === 0 and must NOT create a relation — otherwise the cap is exceeded (TOCTOU).
    const prisma = makePrisma({
      affiliateToken: {
        findUnique: jest.fn().mockResolvedValue(makeToken({ maxUses: 10, currentUses: 9 })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);

    expect(result).toEqual({ success: false, error: "Limite d'utilisation atteinte" });
    expect(prisma.affiliateRelation.create).not.toHaveBeenCalled();
    expect(prisma.friendRequest.create).not.toHaveBeenCalled();
  });

  it('ignores friendRequest creation errors (already exists)', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
      friendRequest: { create: jest.fn().mockRejectedValue(new Error('Unique constraint')) },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);

    expect(result.success).toBe(true);
  });

  it('marks session as converted when sessionKey is provided', async () => {
    const sessionKey = 'affiliate_session_abc123_1234567890';
    const sessionData = { affiliateTokenId: 'tok_001', converted: false };
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
      userPreference: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pref_001', value: JSON.stringify(sessionData) }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId, sessionKey);

    const updateCall = prisma.userPreference.update.mock.calls[0][0];
    const updatedValue = JSON.parse(updateCall.data.value);
    expect(updatedValue.converted).toBe(true);
    expect(updatedValue.referredUserId).toBe(userId);
  });

  it('skips session update when sessionKey is not provided', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
    });
    await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);

    expect(prisma.userPreference.findFirst).not.toHaveBeenCalled();
    expect(prisma.userPreference.update).not.toHaveBeenCalled();
  });

  it('skips session update when session preference not found in DB', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
      userPreference: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId, 'some_key');

    expect(prisma.userPreference.update).not.toHaveBeenCalled();
  });

  it('logs session update error without failing the conversion', async () => {
    const sessionKey = 'affiliate_session_abc123_1234567890';
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
      userPreference: {
        findFirst: jest.fn().mockRejectedValue(new Error('Session DB error')),
        update: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId, sessionKey);

    // Main operation still succeeds even if session update fails
    expect(result.success).toBe(true);
  });

  it('returns error object when main prisma call throws', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn().mockRejectedValue(new Error('DB down')) },
    });
    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, token, userId);
    expect(result).toEqual({ success: false, error: 'Erreur lors de la conversion' });
  });
});

// ---------------------------------------------------------------------------
// getAffiliateStats
// ---------------------------------------------------------------------------
describe('AffiliateTrackingService.getAffiliateStats', () => {
  const userId = 'user_aff';

  it('returns stats with zero counts when no relations exist', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      affiliateRelation: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });
    const result = await AffiliateTrackingService.getAffiliateStats(prisma, userId);

    expect(result.success).toBe(true);
    expect(result.data?.totalReferrals).toBe(0);
    expect(result.data?.completedReferrals).toBe(0);
    expect(result.data?.pendingReferrals).toBe(0);
    expect(result.data?.expiredReferrals).toBe(0);
    expect(result.data?.referrals).toEqual([]);
    expect(result.data?.tokens).toEqual([]);
  });

  it('maps groupBy stats to completed/pending/expired counts', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      affiliateRelation: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'completed', _count: { status: 3 } },
          { status: 'pending', _count: { status: 1 } },
          { status: 'expired', _count: { status: 2 } },
        ]),
      },
    });
    const result = await AffiliateTrackingService.getAffiliateStats(prisma, userId);

    expect(result.data?.completedReferrals).toBe(3);
    expect(result.data?.pendingReferrals).toBe(1);
    expect(result.data?.expiredReferrals).toBe(2);
  });

  it('applies tokenId filter when provided', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      affiliateRelation: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });
    await AffiliateTrackingService.getAffiliateStats(prisma, userId, { tokenId: 'tok_specific' });

    const findManyCall = prisma.affiliateRelation.findMany.mock.calls[0][0];
    expect(findManyCall.where.affiliateTokenId).toBe('tok_specific');
  });

  it('applies status filter when provided', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      affiliateRelation: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });
    await AffiliateTrackingService.getAffiliateStats(prisma, userId, { status: 'completed' });

    const findManyCall = prisma.affiliateRelation.findMany.mock.calls[0][0];
    expect(findManyCall.where.status).toBe('completed');
  });

  it('applies date range filter when dateFrom and dateTo provided', async () => {
    const dateFrom = new Date('2026-01-01');
    const dateTo = new Date('2026-12-31');
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      affiliateRelation: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });
    await AffiliateTrackingService.getAffiliateStats(prisma, userId, { dateFrom, dateTo });

    const findManyCall = prisma.affiliateRelation.findMany.mock.calls[0][0];
    expect(findManyCall.where.createdAt).toEqual({ gte: dateFrom, lte: dateTo });
  });

  it('applies dateFrom-only filter', async () => {
    const dateFrom = new Date('2026-01-01');
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      affiliateRelation: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });
    await AffiliateTrackingService.getAffiliateStats(prisma, userId, { dateFrom });

    const findManyCall = prisma.affiliateRelation.findMany.mock.calls[0][0];
    expect(findManyCall.where.createdAt.gte).toEqual(dateFrom);
    expect(findManyCall.where.createdAt.lte).toBeUndefined();
  });

  it('maps tokens and referrals to correct shape', async () => {
    const mockRelation = {
      id: 'rel_001',
      referredUser: { id: 'u1', username: 'alice', firstName: 'Alice', lastName: null, email: 'a@x.com', avatar: null, isOnline: true, createdAt: NOW },
      status: 'completed',
      createdAt: NOW,
      completedAt: NOW,
      affiliateToken: { name: 'Token A', token: 'abc123', createdAt: NOW },
    };
    const mockToken = {
      id: 'tok_001', name: 'Token A', token: 'abc123', maxUses: 100, currentUses: 1,
      expiresAt: null, isActive: true, createdAt: NOW, _count: { affiliations: 1 },
    };
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([mockToken]) },
      affiliateRelation: {
        findMany: jest.fn().mockResolvedValue([mockRelation]),
        groupBy: jest.fn().mockResolvedValue([{ status: 'completed', _count: { status: 1 } }]),
      },
    });
    const result = await AffiliateTrackingService.getAffiliateStats(prisma, userId);

    expect(result.data?.totalReferrals).toBe(1);
    expect(result.data?.referrals[0].id).toBe('rel_001');
    expect(result.data?.referrals[0].referredUser.username).toBe('alice');
    expect(result.data?.tokens[0].id).toBe('tok_001');
    expect(result.data?.tokens[0]._count.affiliations).toBe(1);
  });

  it('returns error when prisma throws', async () => {
    const prisma = makePrisma({
      affiliateToken: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn().mockRejectedValue(new Error('DB error')) },
      affiliateRelation: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    });
    const result = await AffiliateTrackingService.getAffiliateStats(prisma, userId);
    expect(result).toEqual({ success: false, error: 'Erreur lors de la récupération des statistiques' });
  });
});

// ---------------------------------------------------------------------------
// cleanupExpiredSessions
// ---------------------------------------------------------------------------
describe('AffiliateTrackingService.cleanupExpiredSessions', () => {
  it('deletes userPreference entries with affiliate_session_ prefix older than 30 days', async () => {
    const prisma = makePrisma({
      userPreference: {
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    });
    const result = await AffiliateTrackingService.cleanupExpiredSessions(prisma);

    expect(result).toEqual({ success: true, deletedCount: 5 });

    const deleteCall = prisma.userPreference.deleteMany.mock.calls[0][0];
    expect(deleteCall.where.key.startsWith).toBe('affiliate_session_');
    expect(deleteCall.where.createdAt.lt).toBeInstanceOf(Date);

    // Verify the cutoff is approximately 30 days ago
    const cutoff: Date = deleteCall.where.createdAt.lt;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - thirtyDaysAgo)).toBeLessThan(2000); // within 2s
  });

  it('returns error object when prisma throws', async () => {
    const prisma = makePrisma({
      userPreference: {
        deleteMany: jest.fn().mockRejectedValue(new Error('DB error')),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    });
    const result = await AffiliateTrackingService.cleanupExpiredSessions(prisma);
    expect(result).toEqual({ success: false, error: 'Erreur lors du nettoyage' });
  });

  it('returns deletedCount of 0 when nothing to clean', async () => {
    const prisma = makePrisma({
      userPreference: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    });
    const result = await AffiliateTrackingService.cleanupExpiredSessions(prisma);
    expect(result).toEqual({ success: true, deletedCount: 0 });
  });
});
