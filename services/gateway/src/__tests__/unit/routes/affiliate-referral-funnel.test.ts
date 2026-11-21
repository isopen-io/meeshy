/**
 * GET /affiliate/stats — l'entonnoir du parrainage (#19207, chantier #18857).
 *
 * La vue Parrainage lit « Visites → Inscriptions → Actifs » et « N inscrits ce mois ». La
 * réponse s'enrichit de `visits`, `registrations`, `registrationsThisMonth` et `active`, sans
 * rien retirer de ce qu'un ancien client lit.
 *
 * `active` dérive de l'activité des filleuls (vus dans les trente derniers jours) : c'est une
 * donnée de présence. Elle reste derrière `REFERRAL_ACTIVITY_ENABLED`, éteint par défaut, et,
 * allumée, elle respecte le « statut en ligne » masqué du filleul et ne sert jamais de date.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: jest.fn(async () => undefined),
    recordLinkVisit: jest.fn(async () => 0),
  })),
}));

const mockGetStats = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../services/AffiliateTrackingService', () => ({
  AffiliateTrackingService: {
    getAffiliateStats: (...args: unknown[]) => mockGetStats(...args),
  },
}));

import affiliateRoutes from '../../../routes/affiliate';

const USER_ID = '507f1f77bcf86cd799439011';
const NOW = new Date('2026-11-17T12:00:00.000Z');
const DAY = 86_400_000;

const referral = (id: string, referredId: string) => ({
  id,
  status: 'completed',
  createdAt: NOW,
  completedAt: NOW,
  referredUser: { id: referredId, username: `user-${referredId}`, firstName: null, lastName: null, avatar: null },
  affiliateToken: { name: 'Lien', token: 'aff_x', createdAt: NOW },
});

const STATS = {
  totalReferrals: 3,
  completedReferrals: 3,
  pendingReferrals: 0,
  expiredReferrals: 0,
  referrals: [referral('rel-1', 'u-recent'), referral('rel-2', 'u-old'), referral('rel-3', 'u-hidden')],
  tokens: [],
};

type FunnelPrisma = {
  readonly affiliateToken: { aggregate: jest.Mock };
  readonly affiliateRelation: { count: jest.Mock; findMany: jest.Mock };
  readonly user: { findMany: jest.Mock };
  readonly userPreferences: { findMany: jest.Mock };
  readonly userPreference: { findMany: jest.Mock };
};

function makePrisma(): FunnelPrisma {
  return {
    affiliateToken: { aggregate: jest.fn<any>().mockResolvedValue({ _sum: { clickCount: 38 } }) },
    affiliateRelation: {
      count: jest.fn<any>().mockImplementation(async (args: { where: { createdAt?: unknown } }) => (args.where.createdAt ? 9 : 17)),
      findMany: jest.fn<any>().mockResolvedValue([
        { referredUserId: 'u-recent' },
        { referredUserId: 'u-old' },
        { referredUserId: 'u-hidden' },
        { referredUserId: 'u-gone' },
      ]),
    },
    user: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: 'u-recent', lastActiveAt: new Date(NOW.getTime() - 2 * DAY), isActive: true, deletedAt: null },
        { id: 'u-old', lastActiveAt: new Date(NOW.getTime() - 45 * DAY), isActive: true, deletedAt: null },
        { id: 'u-hidden', lastActiveAt: new Date(NOW.getTime() - DAY), isActive: true, deletedAt: null },
        { id: 'u-gone', lastActiveAt: new Date(NOW.getTime() - DAY), isActive: false, deletedAt: NOW },
      ]),
    },
    userPreferences: {
      findMany: jest.fn<any>().mockResolvedValue([{ userId: 'u-hidden', privacy: { showOnlineStatus: false } }]),
    },
    userPreference: { findMany: jest.fn<any>().mockResolvedValue([]) },
  };
}

async function buildApp(prisma: FunnelPrisma): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => {
    req.authContext = { type: 'registered', isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  app.decorate('prisma', prisma as unknown);
  await affiliateRoutes(app);
  await app.ready();
  return app;
}

describe('GET /affiliate/stats — l’entonnoir du parrainage (#19207)', () => {
  const previousFlag = process.env.REFERRAL_ACTIVITY_ENABLED;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    clearPrivacyPreferencesCache();
    mockGetStats.mockResolvedValue({ success: true, data: STATS });
    delete process.env.REFERRAL_ACTIVITY_ENABLED;
  });

  afterEach(() => {
    jest.useRealTimers();
    if (previousFlag === undefined) delete process.env.REFERRAL_ACTIVITY_ENABLED;
    else process.env.REFERRAL_ACTIVITY_ENABLED = previousFlag;
  });

  it('rend les visites des liens de l’appelant, ses inscriptions et celles du mois UTC, sans rien retirer', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toMatchObject({ visits: 38, registrations: 17, registrationsThisMonth: 9 });
    expect(data.totalReferrals).toBe(3);
    expect(data.referrals).toHaveLength(3);
    expect(prisma.affiliateToken.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdBy: USER_ID }, _sum: { clickCount: true } }),
    );
    expect(prisma.affiliateRelation.count).toHaveBeenCalledWith({
      where: { affiliateUserId: USER_ID, createdAt: { gte: new Date('2026-11-01T00:00:00.000Z') } },
    });
  });

  it('drapeau éteint (défaut) : aucun actif servi, aucune activité de filleul lue', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    await app.close();

    const data = res.json().data;
    expect(data.active).toBeNull();
    expect(data.referrals.every((r: Record<string, unknown>) => r.activity === undefined)).toBe(true);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('drapeau allumé : un filleul vu dans les trente jours est actif, un compte fermé ne compte pas, un statut masqué ne se révèle pas', async () => {
    process.env.REFERRAL_ACTIVITY_ENABLED = 'true';
    const prisma = makePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    await app.close();

    const data = res.json().data;
    expect(data.active).toBe(1);
    const activityOf = (id: string) => data.referrals.find((r: { id: string }) => r.id === id).activity;
    expect(activityOf('rel-1')).toBe('active');
    expect(activityOf('rel-2')).toBe('inactive');
    expect(activityOf('rel-3')).toBeNull();
  });

  it('ne met sur le fil aucune date d’activité ni de création de compte d’un filleul', async () => {
    process.env.REFERRAL_ACTIVITY_ENABLED = 'true';
    const app = await buildApp(makePrisma());
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    await app.close();

    expect(res.body).not.toContain('lastActiveAt');
    for (const r of res.json().data.referrals) {
      expect(r.referredUser.createdAt).toBeUndefined();
      expect(r.referredUser.email).toBeUndefined();
    }
  });

  it('une panne de l’entonnoir laisse la réponse d’avant intacte', async () => {
    const prisma = makePrisma();
    prisma.affiliateToken.aggregate.mockRejectedValue(new Error('mongo down') as never);
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.totalReferrals).toBe(3);
    expect(data.visits).toBeUndefined();
  });
});
