/**
 * Preuve HTTP, sur le schéma RÉEL (#4168) — pas un mock.
 *
 * `affiliate.test.ts` mocke `@meeshy/shared/types/api-schemas` (
 * `affiliateTokenSchema`/`affiliateRelationSchema` en `additionalProperties:
 * true`) pour isoler ses propres routes — un choix légitime, mais qui rendrait
 * ce lot invisible à ses témoins. Ce fichier NE mocke PAS ce module : le
 * schéma réellement compilé par `fast-json-stringify` pour `GET
 * /affiliate/stats` est celui qui tourne ici, exactement celui de
 * production. Seuls `AffiliateTrackingService` (pour contrôler la charge
 * « brute » que le service renvoie) et l'authentification sont mockés.
 *
 * `AffiliateTrackingService.getAffiliateStats` charge `referredUser` via un
 * `select: { id, username, firstName, lastName, email, avatar, createdAt }`
 * (services/gateway/src/services/AffiliateTrackingService.ts:266-274) — la
 * fixture ci-dessous porte donc CES SEPT champs, exactement ce que le service
 * envoie réellement au handler, `email` compris.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn() }) },
}));
jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((s: string) => s) },
}));
jest.mock('../../../utils/pagination', () => ({
  validatePagination: jest.fn((offset: any, limit: any) => ({
    offset: Number(offset) || 0,
    limit: Number(limit) || 50,
  })),
}));

// Déclaré AVANT `jest.mock` pour la même raison de TDZ que dans le fichier
// frère `tracking-links/response-schema-pii-closure.test.ts` : la fixture
// `RAW_STATS_RESULT` est définie plus bas dans ce fichier, après l'import de
// `affiliate.ts` qui déclenche l'évaluation de cette factory.
const mockGetAffiliateStats = jest.fn();

jest.mock('../../../services/AffiliateTrackingService', () => ({
  AffiliateTrackingService: {
    getAffiliateStats: (...a: any[]) => mockGetAffiliateStats(...a),
    trackAffiliateVisit: jest.fn(),
    convertAffiliateVisit: jest.fn(),
  },
}));

// ─── Import après les mocks — SANS mocker `@meeshy/shared/types/api-schemas` ─
import affiliateRoutes from '../../../routes/affiliate';

const USER_ID = 'user-abc123';

const mockAuthContext = {
  type: 'registered' as const,
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  isAnonymous: false,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

/**
 * Exactement ce que `AffiliateTrackingService.getAffiliateStats` renvoie
 * réellement — `referredUser` porte les sept champs du `select`, `email`
 * compris ; `referrals[].affiliateToken` et `tokens[]` portent tous leurs
 * champs producteurs.
 */
const RAW_STATS_RESULT = {
  success: true,
  data: {
    totalReferrals: 2,
    completedReferrals: 1,
    pendingReferrals: 1,
    expiredReferrals: 0,
    referrals: [
      {
        id: 'rel-1',
        status: 'completed',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        completedAt: new Date('2026-08-05T00:00:00Z'),
        referredUser: {
          id: 'referred-1',
          username: 'bilal',
          firstName: 'Bilal',
          lastName: 'K.',
          email: 'bilal@example.com',
          avatar: 'https://cdn.meeshy.me/bilal.png',
          createdAt: new Date('2026-07-30T00:00:00Z'),
        },
        affiliateToken: { name: 'Lancement', token: 'aff_launch', createdAt: new Date('2026-06-01T00:00:00Z') },
      },
    ],
    tokens: [
      {
        id: 'tok-1',
        name: 'Lancement',
        token: 'aff_launch',
        maxUses: 100,
        currentUses: 12,
        expiresAt: null,
        isActive: true,
        createdAt: new Date('2026-06-01T00:00:00Z'),
        _count: { affiliations: 12 },
      },
    ],
  },
};

async function buildApp(): Promise<FastifyInstance> {
  // `strict: false` (même réglage que le fichier frère `affiliate.test.ts`) :
  // d'AUTRES routes de ce même module Fastify posent `example` dans leur
  // schéma — un mot-clé JSON Schema qu'Ajv strict rejette au build. Ce
  // réglage ne touche en rien la fermeture de `/affiliate/stats` elle-même,
  // gouvernée par `properties`/`additionalProperties`, qu'Ajv strict ou pas
  // applique de la même façon à la sérialisation.
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: any) => { req.authContext = mockAuthContext; });
  await affiliateRoutes(app);
  await app.ready();
  return app;
}

describe('GET /affiliate/stats — le schéma RÉEL retire `email`, garde le reste', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    mockGetAffiliateStats.mockResolvedValue(RAW_STATS_RESULT);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it("ne sert JAMAIS `referredUser.email` — donnée personnelle d'un tiers, zéro lecteur mesuré", async () => {
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    expect(res.statusCode).toBe(200);

    const referral = res.json().data.referrals[0];
    expect(referral.referredUser).not.toHaveProperty('email');
    expect(referral.referredUser).not.toHaveProperty('createdAt');
  });

  it('sert `firstName`/`lastName` — lus par `AffiliateReferral.resolvedName` côté iOS SDK', async () => {
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    const referral = res.json().data.referrals[0];

    expect(referral.referredUser.firstName).toBe('Bilal');
    expect(referral.referredUser.lastName).toBe('K.');
    expect(referral.referredUser.username).toBe('bilal');
    expect(referral.referredUser.avatar).toBe('https://cdn.meeshy.me/bilal.png');
  });

  it('sert les compteurs agrégés et les jetons — aucune PII de tiers, aucune raison de les retirer', async () => {
    const res = await app.inject({ method: 'GET', url: '/affiliate/stats' });
    const body = res.json().data;

    expect(body.totalReferrals).toBe(2);
    expect(body.completedReferrals).toBe(1);
    expect(body.pendingReferrals).toBe(1);
    expect(body.expiredReferrals).toBe(0);
    expect(body.referrals[0].affiliateToken.name).toBe('Lancement');
    expect(body.tokens[0]._count.affiliations).toBe(12);
    expect(body.tokens[0].currentUses).toBe(12);
  });
});
