import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AffiliateTrackingService } from '../../../services/AffiliateTrackingService';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

const buildMockPrisma = () => ({
  affiliateToken: {
    findUnique: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
    findMany: jest.fn() as jest.Mock<any>,
  },
  affiliateRelation: {
    findFirst: jest.fn() as jest.Mock<any>,
    create: jest.fn() as jest.Mock<any>,
    findMany: jest.fn() as jest.Mock<any>,
    groupBy: jest.fn() as jest.Mock<any>,
  },
  userPreference: {
    create: jest.fn() as jest.Mock<any>,
    findFirst: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>,
    deleteMany: jest.fn() as jest.Mock<any>,
  },
  friendRequest: {
    create: jest.fn() as jest.Mock<any>,
  },
});

const ACTIVE_TOKEN = {
  id: 'token-id-1',
  token: 'VALID-TOKEN',
  isActive: true,
  expiresAt: null,
  maxUses: null,
  currentUses: 0,
  createdBy: 'user-affiliate-1',
};

describe('AffiliateTrackingService', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();
  });

  // ── trackAffiliateVisit ──────────────────────────────────────────────────

  describe('trackAffiliateVisit', () => {
    it('returns error when token not found', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue(null);
      const result = await AffiliateTrackingService.trackAffiliateVisit(mockPrisma, 'UNKNOWN', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalide');
    });

    it('returns error when token is inactive', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue({ ...ACTIVE_TOKEN, isActive: false });
      const result = await AffiliateTrackingService.trackAffiliateVisit(mockPrisma, 'VALID-TOKEN', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalide');
    });

    it('returns error when token is expired', async () => {
      const expiredDate = new Date(Date.now() - 1000);
      mockPrisma.affiliateToken.findUnique.mockResolvedValue({ ...ACTIVE_TOKEN, expiresAt: expiredDate });
      const result = await AffiliateTrackingService.trackAffiliateVisit(mockPrisma, 'VALID-TOKEN', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expiré');
    });

    it('returns error when max uses reached', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue({ ...ACTIVE_TOKEN, maxUses: 5, currentUses: 5 });
      const result = await AffiliateTrackingService.trackAffiliateVisit(mockPrisma, 'VALID-TOKEN', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe("Limite d'utilisation atteinte");
    });

    it('creates session preference and returns success for valid token', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.userPreference.create.mockResolvedValue({ id: 'pref-1' });

      const result = await AffiliateTrackingService.trackAffiliateVisit(mockPrisma, 'VALID-TOKEN', {
        ipAddress: '1.2.3.4',
        country: 'FR',
        language: 'fr',
      });

      expect(result.success).toBe(true);
      expect(result.data?.tokenId).toBe(ACTIVE_TOKEN.id);
      expect(result.data?.affiliateUserId).toBe(ACTIVE_TOKEN.createdBy);
      expect(result.data?.sessionKey).toMatch(/^affiliate_session_VALID-TOKEN_/);
      expect(mockPrisma.userPreference.create).toHaveBeenCalledTimes(1);
    });

    it('stores visitor data as JSON in the preference', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.userPreference.create.mockResolvedValue({ id: 'pref-1' });

      await AffiliateTrackingService.trackAffiliateVisit(mockPrisma, 'VALID-TOKEN', {
        ipAddress: '5.6.7.8',
        userAgent: 'TestAgent/1.0',
        referrer: 'https://example.com',
      });

      const createCall = mockPrisma.userPreference.create.mock.calls[0][0] as any;
      expect(createCall.data.userId).toBe(ACTIVE_TOKEN.createdBy);
      expect(createCall.data.valueType).toBe('json');
      const stored = JSON.parse(createCall.data.value);
      expect(stored.affiliateTokenId).toBe(ACTIVE_TOKEN.id);
      expect(stored.converted).toBe(false);
    });

    it('accepts token with future expiresAt', async () => {
      const futureDate = new Date(Date.now() + 60_000);
      mockPrisma.affiliateToken.findUnique.mockResolvedValue({ ...ACTIVE_TOKEN, expiresAt: futureDate });
      mockPrisma.userPreference.create.mockResolvedValue({ id: 'pref-1' });

      const result = await AffiliateTrackingService.trackAffiliateVisit(mockPrisma, 'VALID-TOKEN', {});
      expect(result.success).toBe(true);
    });

    it('accepts token with currentUses strictly below maxUses', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue({ ...ACTIVE_TOKEN, maxUses: 10, currentUses: 9 });
      mockPrisma.userPreference.create.mockResolvedValue({ id: 'pref-1' });

      const result = await AffiliateTrackingService.trackAffiliateVisit(mockPrisma, 'VALID-TOKEN', {});
      expect(result.success).toBe(true);
    });

    it('returns error on DB throw', async () => {
      mockPrisma.affiliateToken.findUnique.mockRejectedValue(new Error('DB connection failed'));
      const result = await AffiliateTrackingService.trackAffiliateVisit(mockPrisma, 'VALID-TOKEN', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur lors du tracking');
    });
  });

  // ── convertAffiliateVisit ────────────────────────────────────────────────

  describe('convertAffiliateVisit', () => {
    it('returns error when token not found', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue(null);
      const result = await AffiliateTrackingService.convertAffiliateVisit(mockPrisma, 'UNKNOWN', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalide');
    });

    it('returns error when token is inactive', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue({ ...ACTIVE_TOKEN, isActive: false });
      const result = await AffiliateTrackingService.convertAffiliateVisit(mockPrisma, 'VALID-TOKEN', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalide');
    });

    it('returns error when token is expired', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue({
        ...ACTIVE_TOKEN,
        expiresAt: new Date(Date.now() - 1000),
      });
      const result = await AffiliateTrackingService.convertAffiliateVisit(mockPrisma, 'VALID-TOKEN', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Token expiré');
    });

    it('returns error when max uses reached', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue({ ...ACTIVE_TOKEN, maxUses: 3, currentUses: 3 });
      const result = await AffiliateTrackingService.convertAffiliateVisit(mockPrisma, 'VALID-TOKEN', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe("Limite d'utilisation atteinte");
    });

    it('returns existing relation without creating a new one', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.affiliateRelation.findFirst.mockResolvedValue({ id: 'rel-existing', status: 'completed' });

      const result = await AffiliateTrackingService.convertAffiliateVisit(mockPrisma, 'VALID-TOKEN', 'user-123');

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('rel-existing');
      expect(result.data?.status).toBe('completed');
      expect(mockPrisma.affiliateRelation.create).not.toHaveBeenCalled();
    });

    it('creates relation, increments token counter, and creates friend request', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.affiliateRelation.findFirst.mockResolvedValue(null);
      mockPrisma.affiliateRelation.create.mockResolvedValue({ id: 'rel-new', status: 'completed' });
      mockPrisma.affiliateToken.update.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.friendRequest.create.mockResolvedValue({ id: 'fr-1' });

      const result = await AffiliateTrackingService.convertAffiliateVisit(mockPrisma, 'VALID-TOKEN', 'user-123');

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('rel-new');
      expect(mockPrisma.affiliateToken.update).toHaveBeenCalledWith({
        where: { id: ACTIVE_TOKEN.id },
        data: { currentUses: ACTIVE_TOKEN.currentUses + 1 },
      });
      expect(mockPrisma.friendRequest.create).toHaveBeenCalledWith({
        data: {
          senderId: ACTIVE_TOKEN.createdBy,
          receiverId: 'user-123',
          status: 'accepted',
        },
      });
    });

    it('ignores friend request errors gracefully', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.affiliateRelation.findFirst.mockResolvedValue(null);
      mockPrisma.affiliateRelation.create.mockResolvedValue({ id: 'rel-new', status: 'completed' });
      mockPrisma.affiliateToken.update.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.friendRequest.create.mockRejectedValue(new Error('Duplicate key'));

      const result = await AffiliateTrackingService.convertAffiliateVisit(mockPrisma, 'VALID-TOKEN', 'user-123');

      expect(result.success).toBe(true); // friend request error is swallowed
    });

    it('marks existing session preference as converted when sessionKey provided', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.affiliateRelation.findFirst.mockResolvedValue(null);
      mockPrisma.affiliateRelation.create.mockResolvedValue({ id: 'rel-new', status: 'completed' });
      mockPrisma.affiliateToken.update.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.friendRequest.create.mockResolvedValue({ id: 'fr-1' });
      mockPrisma.userPreference.findFirst.mockResolvedValue({
        id: 'pref-session',
        value: JSON.stringify({ affiliateTokenId: 'token-id-1', converted: false }),
      });
      mockPrisma.userPreference.update.mockResolvedValue({});

      const result = await AffiliateTrackingService.convertAffiliateVisit(
        mockPrisma, 'VALID-TOKEN', 'user-123', 'affiliate_session_VALID-TOKEN_123456'
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.userPreference.update).toHaveBeenCalledTimes(1);
      const updateArgs = mockPrisma.userPreference.update.mock.calls[0][0] as any;
      const updatedValue = JSON.parse(updateArgs.data.value);
      expect(updatedValue.converted).toBe(true);
      expect(updatedValue.referredUserId).toBe('user-123');
    });

    it('skips session update when preference not found', async () => {
      mockPrisma.affiliateToken.findUnique.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.affiliateRelation.findFirst.mockResolvedValue(null);
      mockPrisma.affiliateRelation.create.mockResolvedValue({ id: 'rel-new', status: 'completed' });
      mockPrisma.affiliateToken.update.mockResolvedValue(ACTIVE_TOKEN);
      mockPrisma.friendRequest.create.mockResolvedValue({ id: 'fr-1' });
      mockPrisma.userPreference.findFirst.mockResolvedValue(null);

      const result = await AffiliateTrackingService.convertAffiliateVisit(
        mockPrisma, 'VALID-TOKEN', 'user-123', 'missing-session-key'
      );

      expect(result.success).toBe(true);
      expect(mockPrisma.userPreference.update).not.toHaveBeenCalled();
    });

    it('returns error on outer DB throw', async () => {
      mockPrisma.affiliateToken.findUnique.mockRejectedValue(new Error('DB connection failed'));
      const result = await AffiliateTrackingService.convertAffiliateVisit(mockPrisma, 'VALID-TOKEN', 'user-123');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur lors de la conversion');
    });
  });

  // ── getAffiliateStats ────────────────────────────────────────────────────

  describe('getAffiliateStats', () => {
    const mockReferrals = [
      {
        id: 'rel-1',
        referredUser: {
          id: 'user-ref-1', username: 'ref1', firstName: 'Ref', lastName: 'One',
          email: 'r1@test.com', avatar: null, isOnline: false, createdAt: new Date(),
        },
        status: 'completed',
        createdAt: new Date(),
        completedAt: new Date(),
        affiliateToken: { name: 'My Token', token: 'TOK-1', createdAt: new Date() },
      },
    ];
    const mockGroupBy = [
      { status: 'completed', _count: { status: 3 } },
      { status: 'pending', _count: { status: 2 } },
      { status: 'expired', _count: { status: 1 } },
    ];
    const mockTokens = [
      {
        id: 'token-1', name: 'Token A', token: 'TOK-1',
        maxUses: 100, currentUses: 5, expiresAt: null, isActive: true,
        createdAt: new Date(), _count: { affiliations: 5 },
      },
    ];

    it('returns aggregated stats and referral list', async () => {
      mockPrisma.affiliateRelation.findMany.mockResolvedValue(mockReferrals);
      mockPrisma.affiliateRelation.groupBy.mockResolvedValue(mockGroupBy);
      mockPrisma.affiliateToken.findMany.mockResolvedValue(mockTokens);

      const result = await AffiliateTrackingService.getAffiliateStats(mockPrisma, 'user-affiliate-1');

      expect(result.success).toBe(true);
      expect(result.data?.totalReferrals).toBe(1);
      expect(result.data?.completedReferrals).toBe(3);
      expect(result.data?.pendingReferrals).toBe(2);
      expect(result.data?.expiredReferrals).toBe(1);
      expect(result.data?.referrals).toHaveLength(1);
      expect(result.data?.tokens).toHaveLength(1);
    });

    it('returns zero counts when no referrals exist', async () => {
      mockPrisma.affiliateRelation.findMany.mockResolvedValue([]);
      mockPrisma.affiliateRelation.groupBy.mockResolvedValue([]);
      mockPrisma.affiliateToken.findMany.mockResolvedValue([]);

      const result = await AffiliateTrackingService.getAffiliateStats(mockPrisma, 'user-1');

      expect(result.data?.totalReferrals).toBe(0);
      expect(result.data?.completedReferrals).toBe(0);
      expect(result.data?.pendingReferrals).toBe(0);
      expect(result.data?.expiredReferrals).toBe(0);
    });

    it('applies tokenId filter to findMany query', async () => {
      mockPrisma.affiliateRelation.findMany.mockResolvedValue([]);
      mockPrisma.affiliateRelation.groupBy.mockResolvedValue([]);
      mockPrisma.affiliateToken.findMany.mockResolvedValue([]);

      await AffiliateTrackingService.getAffiliateStats(mockPrisma, 'user-1', { tokenId: 'token-id-1' });

      const call = mockPrisma.affiliateRelation.findMany.mock.calls[0][0] as any;
      expect(call.where.affiliateTokenId).toBe('token-id-1');
    });

    it('applies status filter to findMany query', async () => {
      mockPrisma.affiliateRelation.findMany.mockResolvedValue([]);
      mockPrisma.affiliateRelation.groupBy.mockResolvedValue([]);
      mockPrisma.affiliateToken.findMany.mockResolvedValue([]);

      await AffiliateTrackingService.getAffiliateStats(mockPrisma, 'user-1', { status: 'completed' });

      const call = mockPrisma.affiliateRelation.findMany.mock.calls[0][0] as any;
      expect(call.where.status).toBe('completed');
    });

    it('applies dateFrom and dateTo filters', async () => {
      mockPrisma.affiliateRelation.findMany.mockResolvedValue([]);
      mockPrisma.affiliateRelation.groupBy.mockResolvedValue([]);
      mockPrisma.affiliateToken.findMany.mockResolvedValue([]);

      const dateFrom = new Date('2026-01-01');
      const dateTo = new Date('2026-12-31');
      await AffiliateTrackingService.getAffiliateStats(mockPrisma, 'user-1', { dateFrom, dateTo });

      const call = mockPrisma.affiliateRelation.findMany.mock.calls[0][0] as any;
      expect(call.where.createdAt.gte).toBe(dateFrom);
      expect(call.where.createdAt.lte).toBe(dateTo);
    });

    it('applies only dateFrom without dateTo', async () => {
      mockPrisma.affiliateRelation.findMany.mockResolvedValue([]);
      mockPrisma.affiliateRelation.groupBy.mockResolvedValue([]);
      mockPrisma.affiliateToken.findMany.mockResolvedValue([]);

      const dateFrom = new Date('2026-06-01');
      await AffiliateTrackingService.getAffiliateStats(mockPrisma, 'user-1', { dateFrom });

      const call = mockPrisma.affiliateRelation.findMany.mock.calls[0][0] as any;
      expect(call.where.createdAt.gte).toBe(dateFrom);
      expect(call.where.createdAt.lte).toBeUndefined();
    });

    it('applies only dateTo without dateFrom', async () => {
      mockPrisma.affiliateRelation.findMany.mockResolvedValue([]);
      mockPrisma.affiliateRelation.groupBy.mockResolvedValue([]);
      mockPrisma.affiliateToken.findMany.mockResolvedValue([]);

      const dateTo = new Date('2026-12-31');
      await AffiliateTrackingService.getAffiliateStats(mockPrisma, 'user-1', { dateTo });

      const call = mockPrisma.affiliateRelation.findMany.mock.calls[0][0] as any;
      expect(call.where.createdAt.lte).toBe(dateTo);
      expect(call.where.createdAt.gte).toBeUndefined();
    });

    it('returns error on DB throw', async () => {
      mockPrisma.affiliateRelation.findMany.mockRejectedValue(new Error('DB error'));
      const result = await AffiliateTrackingService.getAffiliateStats(mockPrisma, 'user-1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur lors de la récupération des statistiques');
    });
  });

  // ── cleanupExpiredSessions ───────────────────────────────────────────────

  describe('cleanupExpiredSessions', () => {
    it('returns count of deleted sessions', async () => {
      mockPrisma.userPreference.deleteMany.mockResolvedValue({ count: 7 });
      const result = await AffiliateTrackingService.cleanupExpiredSessions(mockPrisma);
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(7);
    });

    it('queries with affiliate_session_ prefix and 30-day cutoff', async () => {
      mockPrisma.userPreference.deleteMany.mockResolvedValue({ count: 0 });
      await AffiliateTrackingService.cleanupExpiredSessions(mockPrisma);

      const call = mockPrisma.userPreference.deleteMany.mock.calls[0][0] as any;
      expect(call.where.key.startsWith).toBe('affiliate_session_');
      expect(call.where.createdAt.lt).toBeInstanceOf(Date);
      // Cutoff should be ~30 days in the past
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      expect(call.where.createdAt.lt.getTime()).toBeCloseTo(thirtyDaysAgo, -3);
    });

    it('returns success with zero when nothing to delete', async () => {
      mockPrisma.userPreference.deleteMany.mockResolvedValue({ count: 0 });
      const result = await AffiliateTrackingService.cleanupExpiredSessions(mockPrisma);
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });

    it('returns error on DB throw', async () => {
      mockPrisma.userPreference.deleteMany.mockRejectedValue(new Error('DB error'));
      const result = await AffiliateTrackingService.cleanupExpiredSessions(mockPrisma);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Erreur lors du nettoyage');
    });
  });
});
