/**
 * Ce que les routes d'affiliation créditent (#8959) : la création d'un jeton
 * paie `social.affiliate_link_created` à son auteur ; une visite par le lien
 * (`track-visit`, `click/:token`) paie `social.link_visit` à son créateur,
 * avec un visiteur calculé depuis la REQUÊTE — et l'adresse ENREGISTRÉE est
 * celle de la requête, pas celle que le corps prétend.
 *
 * @jest-environment node
 */

import { createHash } from 'crypto';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: { sanitizeText: (s: string) => s },
}));

type VisitArgs = { creatorId: string; linkKey: string; visitorKey: string; visitorUserId?: string | null };
const mockRecordActivity = jest.fn<(userId: string, key: string, options?: Record<string, unknown>) => Promise<void>>();
const mockRecordLinkVisit = jest.fn<(visit: VisitArgs) => Promise<number>>();

jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: (userId: string, key: string, options?: Record<string, unknown>) => mockRecordActivity(userId, key, options),
    recordLinkVisit: (visit: VisitArgs) => mockRecordLinkVisit(visit),
  })),
}));

const mockTrackVisit = jest.fn<(prisma: unknown, token: string, data: Record<string, unknown>) => Promise<unknown>>();

jest.mock('../../../services/AffiliateTrackingService', () => ({
  AffiliateTrackingService: {
    trackAffiliateVisit: (prisma: unknown, token: string, data: Record<string, unknown>) => mockTrackVisit(prisma, token, data),
  },
}));

import affiliateRoutes from '../../../routes/affiliate';

const CREATOR = '507f1f77bcf86cd799439aaa';
const TOKEN = 'aff_AbCdEfGh';

const tokenRow = {
  id: '507f1f77bcf86cd799439011',
  token: TOKEN,
  name: 'Campagne',
  createdBy: CREATOR,
  maxUses: null,
  currentUses: 0,
  isActive: true,
  clickCount: 0,
  expiresAt: null,
  createdAt: new Date('2026-09-30T00:00:00Z'),
  creator: { id: CREATOR, username: 'alice', firstName: 'A', lastName: 'B', displayName: 'A B', avatar: null },
};

const anonKey = (ip: string, userAgent: string): string =>
  `anon:${createHash('sha256').update(`${ip}|${userAgent}`).digest('hex')}`;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('authenticate', async (req: FastifyRequest & { authContext?: unknown }) => {
    req.authContext = {
      type: 'user', isAuthenticated: true, isAnonymous: false, userId: CREATOR,
      registeredUser: { id: CREATOR, role: 'USER' },
    };
  });
  app.decorate('prisma', {
    affiliateToken: {
      create: jest.fn(async () => tokenRow),
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => tokenRow),
      update: jest.fn(async () => tokenRow),
    },
  });
  await affiliateRoutes(app);
  await app.ready();
  return app;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockRecordActivity.mockReset().mockResolvedValue(undefined);
  mockRecordLinkVisit.mockReset().mockResolvedValue(2);
  mockTrackVisit.mockReset().mockResolvedValue({ success: true, data: { tokenId: tokenRow.id, affiliateUserId: CREATOR, sessionKey: 'sk' } });
});

describe('POST /affiliate/tokens', () => {
  it('crédite social.affiliate_link_created à l\'auteur', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/affiliate/tokens', payload: { name: 'Campagne' } });
    await flush();

    expect(res.statusCode).toBe(200);
    expect(mockRecordActivity).toHaveBeenCalledWith(CREATOR, 'social.affiliate_link_created', undefined);
    await app.close();
  });
});

describe('POST /affiliate/track-visit', () => {
  it('crédite la visite au créateur avec un visiteur établi par le serveur', async () => {
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/affiliate/track-visit',
      headers: { 'user-agent': 'UA-real' },
      payload: { token: TOKEN, visitorData: { ipAddress: '9.9.9.9', userAgent: 'UA-forged', language: 'fr' } },
    });
    await flush();

    expect(mockRecordLinkVisit).toHaveBeenCalledWith({
      creatorId: CREATOR,
      linkKey: `affiliate:${TOKEN}`,
      visitorKey: anonKey('127.0.0.1', 'UA-real'),
      visitorUserId: null,
    });
    await app.close();
  });

  it('enregistre l\'adresse et le navigateur de la requête, pas ceux du corps', async () => {
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/affiliate/track-visit',
      headers: { 'user-agent': 'UA-real' },
      payload: { token: TOKEN, visitorData: { ipAddress: '9.9.9.9', userAgent: 'UA-forged', language: 'fr' } },
    });

    expect(mockTrackVisit).toHaveBeenCalledWith(expect.anything(), TOKEN, {
      ipAddress: '127.0.0.1',
      userAgent: 'UA-real',
      language: 'fr',
    });
    await app.close();
  });

  it('ne crédite rien quand la visite est refusée', async () => {
    mockTrackVisit.mockResolvedValue({ success: false, error: 'Token invalide' });
    const app = await buildApp();

    await app.inject({ method: 'POST', url: '/affiliate/track-visit', payload: { token: TOKEN } });
    await flush();

    expect(mockRecordLinkVisit).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('POST /affiliate/click/:token', () => {
  it('crédite la visite au créateur du jeton', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: `/affiliate/click/${TOKEN}`, headers: { 'user-agent': 'UA-x' } });
    await flush();

    expect(res.statusCode).toBe(200);
    expect(mockRecordLinkVisit).toHaveBeenCalledWith({
      creatorId: CREATOR,
      linkKey: `affiliate:${TOKEN}`,
      visitorKey: anonKey('127.0.0.1', 'UA-x'),
      visitorUserId: null,
    });
    await app.close();
  });

  it('un crédit en panne ne fait pas échouer le clic', async () => {
    mockRecordLinkVisit.mockRejectedValue(new Error('engagement down'));
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: `/affiliate/click/${TOKEN}` });
    await flush();

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
