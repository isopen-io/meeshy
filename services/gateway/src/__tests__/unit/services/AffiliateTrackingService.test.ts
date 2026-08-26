/**
 * Unit tests for AffiliateTrackingService.
 * Covers: trackAffiliateVisit (invalid token, inactive, expired, max-uses,
 * happy path), convertAffiliateVisit (invalid token, expired, max-uses,
 * duplicate → returns existing, happy path with session update),
 * getAffiliateStats (happy path, filters, DB error), cleanupExpiredSessions.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { AffiliateTrackingService } from '../../../services/AffiliateTrackingService';

// ─── Factories ────────────────────────────────────────────────────────────────

const ACTIVE_TOKEN = {
  id: 'tok-1',
  token: 'REF-ABC123',
  isActive: true,
  createdBy: 'user-affiliate',
  expiresAt: null,
  maxUses: null,
  currentUses: 0,
};

function makePrisma(overrides: {
  affiliateToken?: any;
  existingRelation?: any;
  newRelation?: any;
  referrals?: any[];
  stats?: any[];
  tokens?: any[];
  sessionPreference?: any;
  deleteCount?: number;
  existingFriendRequest?: any;
} = {}) {
  const {
    affiliateToken = ACTIVE_TOKEN,
    existingRelation = null,
    newRelation = { id: 'rel-1', status: 'completed' },
    referrals = [],
    stats = [],
    tokens = [],
    sessionPreference = null,
    deleteCount = 0,
    existingFriendRequest = null,
  } = overrides;

  return {
    affiliateToken: {
      findUnique: jest.fn<any>().mockResolvedValue(affiliateToken),
      update: jest.fn<any>().mockResolvedValue({}),
      findMany: jest.fn<any>().mockResolvedValue(tokens),
    },
    affiliateRelation: {
      findFirst: jest.fn<any>().mockResolvedValue(existingRelation),
      create: jest.fn<any>().mockResolvedValue(newRelation),
      findMany: jest.fn<any>().mockResolvedValue(referrals),
      groupBy: jest.fn<any>().mockResolvedValue(stats),
    },
    userPreference: {
      create: jest.fn<any>().mockResolvedValue({ id: 'pref-1' }),
      findFirst: jest.fn<any>().mockResolvedValue(sessionPreference),
      update: jest.fn<any>().mockResolvedValue({}),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: deleteCount }),
    },
    // `FriendRequest` n'a pas d'index unique : le service cherche d'abord une
    // demande dans les DEUX sens avant de créer, pour ne pas fabriquer un
    // doublon désynchronisé. Un double sans `findFirst` faisait lever le bloc
    // — silencieusement, il est en try/catch — et `create` n'était jamais
    // atteint.
    friendRequest: {
      findFirst: jest.fn<any>().mockResolvedValue(existingFriendRequest),
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
    },
  };
}

// ─── trackAffiliateVisit ──────────────────────────────────────────────────────

describe('trackAffiliateVisit', () => {
  it('returns success:false when token not found', async () => {
    const prisma = makePrisma({ affiliateToken: null });

    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, 'bad-tok', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('invalide');
  });

  it('returns success:false when token is inactive', async () => {
    const prisma = makePrisma({ affiliateToken: { ...ACTIVE_TOKEN, isActive: false } });

    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, 'tok', {});

    expect(result.success).toBe(false);
  });

  it('returns success:false when token is expired', async () => {
    const prisma = makePrisma({
      affiliateToken: { ...ACTIVE_TOKEN, expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, 'tok', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('expiré');
  });

  it('returns success:false when max-uses limit reached', async () => {
    const prisma = makePrisma({
      affiliateToken: { ...ACTIVE_TOKEN, maxUses: 10, currentUses: 10 },
    });

    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, 'tok', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Limite');
  });

  it('creates userPreference for session tracking on happy path', async () => {
    const prisma = makePrisma();

    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, 'REF-ABC123', {
      ipAddress: '127.0.0.1',
    });

    expect(result.success).toBe(true);
    expect(prisma.userPreference.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-affiliate',
          valueType: 'json',
        }),
      })
    );
  });

  it('returns tokenId and sessionKey on happy path', async () => {
    const prisma = makePrisma();

    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, 'tok', {});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.tokenId).toBe('tok-1');
      expect(result.data?.affiliateUserId).toBe('user-affiliate');
      expect(typeof result.data?.sessionKey).toBe('string');
    }
  });

  it('returns success:false on DB error', async () => {
    const prisma = makePrisma();
    (prisma.affiliateToken.findUnique as jest.Mock<any>).mockRejectedValue(new Error('DB down'));

    const result = await AffiliateTrackingService.trackAffiliateVisit(prisma, 'tok', {});

    expect(result.success).toBe(false);
  });
});

// ─── convertAffiliateVisit ────────────────────────────────────────────────────

describe('convertAffiliateVisit', () => {
  it('returns success:false when token not found', async () => {
    const prisma = makePrisma({ affiliateToken: null });

    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-1');

    expect(result.success).toBe(false);
  });

  it('returns success:false when token expired', async () => {
    const prisma = makePrisma({
      affiliateToken: { ...ACTIVE_TOKEN, expiresAt: new Date(Date.now() - 5000) },
    });

    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-1');

    expect(result.success).toBe(false);
    expect(result.error).toContain('expiré');
  });

  it('returns success:false when max-uses reached', async () => {
    const prisma = makePrisma({
      affiliateToken: { ...ACTIVE_TOKEN, maxUses: 5, currentUses: 5 },
    });

    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-1');

    expect(result.success).toBe(false);
  });

  it('returns existing relation when duplicate conversion attempted', async () => {
    const existing = { id: 'rel-existing', status: 'completed' };
    const prisma = makePrisma({ existingRelation: existing });

    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.id).toBe('rel-existing');
    }
    expect(prisma.affiliateRelation.create).not.toHaveBeenCalled();
  });

  it('creates a new affiliateRelation on fresh conversion', async () => {
    const prisma = makePrisma();

    await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-new');

    expect(prisma.affiliateRelation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referredUserId: 'user-new',
          affiliateUserId: 'user-affiliate',
          status: 'completed',
        }),
      })
    );
  });

  // L'incrément est ATOMIQUE, pas un `currentUses + 1` calculé en mémoire :
  // deux conversions concurrentes lues à la même valeur écriraient la même, et
  // un token à usages limités dépasserait sa borne. Le service le documente
  // explicitement — ce test verrouillait la version racée.
  it('incrémente currentUses de façon atomique, sans relire la valeur', async () => {
    const prisma = makePrisma({ affiliateToken: { ...ACTIVE_TOKEN, currentUses: 3 } });

    await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-new');

    expect(prisma.affiliateToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentUses: { increment: 1 } }),
      })
    );
  });

  it('accepte la demande d\'amitié préexistante au lieu d\'en créer une seconde', async () => {
    const prisma = makePrisma({
      existingFriendRequest: { id: 'fr-1', status: 'pending' },
    });

    await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-new');

    expect(prisma.friendRequest.create).not.toHaveBeenCalled();
    expect(prisma.friendRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'fr-1' },
        data: expect.objectContaining({ status: 'accepted' }),
      })
    );
  });

  it('creates a friendRequest between affiliator and referred user', async () => {
    const prisma = makePrisma();

    await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-new');

    expect(prisma.friendRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senderId: 'user-affiliate',
          receiverId: 'user-new',
        }),
      })
    );
  });

  it('silently ignores friendRequest creation errors (already friends)', async () => {
    const prisma = makePrisma();
    (prisma.friendRequest.create as jest.Mock<any>).mockRejectedValue(new Error('duplicate'));

    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-dup');

    expect(result.success).toBe(true);
  });

  it('updates session preference when sessionKey provided and session exists', async () => {
    const prisma = makePrisma({
      sessionPreference: { id: 'pref-99', value: JSON.stringify({ converted: false }) },
    });

    await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-new', 'session-key');

    expect(prisma.userPreference.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pref-99' },
      })
    );
  });

  it('returns success:false on DB error', async () => {
    const prisma = makePrisma();
    (prisma.affiliateToken.findUnique as jest.Mock<any>).mockRejectedValue(new Error('DB down'));

    const result = await AffiliateTrackingService.convertAffiliateVisit(prisma, 'tok', 'user-1');

    expect(result.success).toBe(false);
  });
});

// ─── getAffiliateStats ────────────────────────────────────────────────────────

describe('getAffiliateStats', () => {
  it('returns success:true with stats summary', async () => {
    const prisma = makePrisma({
      referrals: [{ id: 'rel-1', referredUser: {}, status: 'completed', createdAt: new Date(), completedAt: new Date(), affiliateToken: {} }],
      stats: [{ status: 'completed', _count: { status: 2 } }],
      tokens: [{ id: 'tok-1', name: 'My link', token: 'REF', maxUses: null, currentUses: 2, expiresAt: null, isActive: true, createdAt: new Date(), _count: { affiliations: 2 } }],
    });

    const result = await AffiliateTrackingService.getAffiliateStats(prisma, 'user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.totalReferrals).toBe(1);
      expect(result.data?.completedReferrals).toBe(2);
      expect(result.data?.pendingReferrals).toBe(0);
    }
  });

  it('queries affiliateRelation.findMany with userId filter', async () => {
    const prisma = makePrisma();

    await AffiliateTrackingService.getAffiliateStats(prisma, 'user-aff');

    expect(prisma.affiliateRelation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ affiliateUserId: 'user-aff' }),
      })
    );
  });

  it('applies tokenId filter when provided', async () => {
    const prisma = makePrisma();

    await AffiliateTrackingService.getAffiliateStats(prisma, 'user-1', { tokenId: 'tok-42' });

    expect(prisma.affiliateRelation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ affiliateTokenId: 'tok-42' }),
      })
    );
  });

  it('applies status filter when provided', async () => {
    const prisma = makePrisma();

    await AffiliateTrackingService.getAffiliateStats(prisma, 'user-1', { status: 'pending' });

    expect(prisma.affiliateRelation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'pending' }),
      })
    );
  });

  // Le parrainage n'est PAS une amitié : la loi de confidentialité de la
  // présence l'exclut nommément. Un parrain ne reçoit donc AUCUN champ de
  // présence sur ses filleuls — l'absence de la colonne dans le `select` est
  // le seul état qu'aucune porte ne peut rouvrir. Le double de `findMany`
  // honore ici le `select` reçu, comme Prisma : la ligne rendue porte
  // exactement les colonnes demandées, et rien d'autre.
  it('serves no presence field under referrals[].referredUser', async () => {
    const referredRow = {
      id: 'u-filleul',
      username: 'awa',
      firstName: 'Awa',
      lastName: 'Diop',
      email: 'awa@example.com',
      avatar: null,
      isOnline: true,
      lastActiveAt: new Date(),
      createdAt: new Date(),
    };
    const prisma = makePrisma();
    (prisma.affiliateRelation.findMany as jest.Mock<any>).mockImplementation(async (args: any) => {
      const select = args?.include?.referredUser?.select ?? {};
      const referredUser = Object.fromEntries(
        Object.entries(referredRow).filter(([column]) => select[column] === true)
      );
      return [{ id: 'rel-1', status: 'completed', createdAt: new Date(), completedAt: null, affiliateToken: {}, referredUser }];
    });

    const result = await AffiliateTrackingService.getAffiliateStats(prisma, 'user-1');

    expect(result.success).toBe(true);
    if (result.success) {
      const served = result.data?.referrals[0]?.referredUser;
      expect(served).toMatchObject({ id: 'u-filleul', username: 'awa' });
      expect(served).not.toHaveProperty('isOnline');
      expect(served).not.toHaveProperty('lastActiveAt');
    }
  });

  it('returns success:false on DB error', async () => {
    const prisma = makePrisma();
    (prisma.affiliateRelation.findMany as jest.Mock<any>).mockRejectedValue(new Error('DB down'));

    const result = await AffiliateTrackingService.getAffiliateStats(prisma, 'user-1');

    expect(result.success).toBe(false);
  });
});

// ─── cleanupExpiredSessions ───────────────────────────────────────────────────

describe('cleanupExpiredSessions', () => {
  it('returns success:true with deletedCount', async () => {
    const prisma = makePrisma({ deleteCount: 7 });

    const result = await AffiliateTrackingService.cleanupExpiredSessions(prisma);

    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(7);
  });

  it('deletes userPreferences with affiliate_session_ prefix older than 30 days', async () => {
    const prisma = makePrisma();

    await AffiliateTrackingService.cleanupExpiredSessions(prisma);

    expect(prisma.userPreference.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          key: expect.objectContaining({ startsWith: 'affiliate_session_' }),
        }),
      })
    );
  });

  it('returns success:false on DB error', async () => {
    const prisma = makePrisma();
    (prisma.userPreference.deleteMany as jest.Mock<any>).mockRejectedValue(new Error('DB down'));

    const result = await AffiliateTrackingService.cleanupExpiredSessions(prisma);

    expect(result.success).toBe(false);
  });
});
