/**
 * Les routes de liens de suivi remettent au service ce que le crédit
 * d'engagement exige (#8959) : `POST /tracking-links` déclare une création
 * EXPLICITE, et chaque visite (`GET /l/:token`, `POST /tracking-links/:token/click`)
 * porte un visiteur calculé depuis la REQUÊTE — jamais depuis le corps.
 *
 * @jest-environment node
 */

import { createHash } from 'crypto';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../middleware/admin-permissions.middleware', () => ({
  requireAnalyticsPermission: jest.fn(async () => undefined),
}));

type AuthState = { current: Record<string, unknown> };
const authState: AuthState = { current: { isAuthenticated: false, isAnonymous: false, type: 'user' } };

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest & { authContext?: unknown }) => {
    req.authContext = authState.current;
  }),
  isRegisteredUser: (ctx: { type?: string; isAnonymous?: boolean; isAuthenticated?: boolean }) =>
    ctx.type === 'user' && !ctx.isAnonymous && ctx.isAuthenticated === true,
}));

const mockGetByToken = jest.fn<(token: string) => Promise<unknown>>();
const mockRecordClick = jest.fn<(params: Record<string, unknown>) => Promise<unknown>>();
const mockFindExisting = jest.fn<() => Promise<unknown>>();
const mockCreate = jest.fn<(params: Record<string, unknown>) => Promise<unknown>>();

jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    getTrackingLinkByToken: (token: string) => mockGetByToken(token),
    recordClick: (params: Record<string, unknown>) => mockRecordClick(params),
    findExistingTrackingLink: () => mockFindExisting(),
    createTrackingLink: (params: Record<string, unknown>) => mockCreate(params),
    buildTrackingUrl: (token: string) => `https://meeshy.me/l/${token}`,
  })),
  resolveFrontendBaseUrl: jest.fn(() => 'https://meeshy.me'),
}));

import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';
import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

const link = {
  id: 'link-1',
  token: 'AbC123',
  originalUrl: 'https://example.com',
  shortUrl: '/l/AbC123',
  isActive: true,
  expiresAt: null,
  createdBy: 'creator-1',
  totalClicks: 0,
  uniqueClicks: 0,
  createdAt: new Date('2026-09-30T00:00:00Z'),
  updatedAt: new Date('2026-09-30T00:00:00Z'),
};

const anonKey = (ip: string, userAgent: string): string =>
  `anon:${createHash('sha256').update(`${ip}|${userAgent}`).digest('hex')}`;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {});
  app.decorate('authenticate', async () => undefined);
  await registerTrackingRoutes(app);
  await registerCreationRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  authState.current = { isAuthenticated: false, isAnonymous: false, type: 'user' };
  mockGetByToken.mockReset().mockResolvedValue(link);
  mockRecordClick.mockReset().mockResolvedValue({ trackingLink: link, click: { id: 'click-1' } });
  mockFindExisting.mockReset().mockResolvedValue(null);
  mockCreate.mockReset().mockResolvedValue(link);
});

describe('POST /tracking-links — création explicite', () => {
  it('déclare la création comme un geste de l\'auteur', async () => {
    authState.current = {
      isAuthenticated: true, isAnonymous: false, type: 'user', userId: 'creator-1',
      registeredUser: { id: 'creator-1', role: 'USER' },
    };
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/tracking-links', payload: { originalUrl: 'https://example.com' } });

    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 'creator-1', creditCreator: true }));
    await app.close();
  });
});

describe('GET /l/:token — visiteur', () => {
  it('un anonyme est reconnu par l\'empreinte de son adresse et de son navigateur', async () => {
    const app = await buildApp();

    await app.inject({ method: 'GET', url: '/l/AbC123', headers: { 'user-agent': 'UA-test' } });

    expect(mockRecordClick).toHaveBeenCalledWith(expect.objectContaining({
      visitor: { key: anonKey('127.0.0.1', 'UA-test'), userId: null },
    }));
    await app.close();
  });

  it('un compte connecté est reconnu par son identifiant', async () => {
    authState.current = { isAuthenticated: true, isAnonymous: false, type: 'user', userId: 'visitor-1', registeredUser: { id: 'visitor-1' } };
    const app = await buildApp();

    await app.inject({ method: 'GET', url: '/l/AbC123' });

    expect(mockRecordClick).toHaveBeenCalledWith(expect.objectContaining({
      visitor: { key: 'user:visitor-1', userId: 'visitor-1' },
    }));
    await app.close();
  });
});

describe('POST /tracking-links/:token/click — visiteur', () => {
  it('ignore l\'adresse et le navigateur que le corps prétend', async () => {
    const app = await buildApp();

    await app.inject({
      method: 'POST',
      url: '/tracking-links/AbC123/click',
      headers: { 'user-agent': 'UA-real' },
      payload: { ipAddress: '9.9.9.9', userAgent: 'UA-forged' },
    });

    expect(mockRecordClick).toHaveBeenCalledWith(expect.objectContaining({
      visitor: { key: anonKey('127.0.0.1', 'UA-real'), userId: null },
    }));
    await app.close();
  });
});
