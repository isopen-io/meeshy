/**
 * tracking-links-creation-extras-routes.test.ts
 *
 * Supplement to tracking-links-creation-routes.test.ts
 * Covers the 4 remaining routes:
 *   - PATCH /tracking-links/:token/deactivate
 *   - DELETE /tracking-links/:token
 *   - PATCH /tracking-links/:token
 *   - GET /tracking-links/check-token/:token
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  trackingLinkSchema: { type: 'object', additionalProperties: true },
  errorResponseSchema: { type: 'object', additionalProperties: true },
  validationErrorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async () => {}),
  isRegisteredUser: jest.fn((ctx: any) => ctx?.type === 'registered'),
  UnifiedAuthRequest: {},
}));

const mockEnrichTrackingLink = jest.fn<any>((link: any) => ({
  ...link,
  fullUrl: `https://test.meeshy.com/l/${link?.token ?? 'abc123'}`,
}));

jest.mock('../../../routes/tracking-links/types', () => {
  const z = require('zod');
  return {
    createTrackingLinkSchema: z.object({ originalUrl: z.string() }),
    enrichTrackingLink: (...args: any[]) => mockEnrichTrackingLink(...args),
    recordClickSchema: z.object({}),
    getStatsSchema: z.object({}),
  };
});

const mockGetByToken      = jest.fn<any>();
const mockDeactivate      = jest.fn<any>();
const mockDeleteLink      = jest.fn<any>();
const mockUpdateLink      = jest.fn<any>();
const mockIsTokenAvailable = jest.fn<any>();

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink:    jest.fn(),
    createTrackingLink:          jest.fn(),
    getTrackingLinkByToken:      (...args: any[]) => mockGetByToken(...args),
    resolveTarget:               jest.fn(),
    getConversationTrackingLinks: jest.fn(),
    deactivateTrackingLink:      (...args: any[]) => mockDeactivate(...args),
    deleteTrackingLink:          (...args: any[]) => mockDeleteLink(...args),
    updateTrackingLink:          (...args: any[]) => mockUpdateLink(...args),
    isTokenAvailable:            (...args: any[]) => mockIsTokenAvailable(...args),
    buildTrackingUrl:            (token: string) => `https://test.meeshy.com/l/${token}`,
  })),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerCreationRoutes } from '../../../routes/tracking-links/creation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID      = '507f1f77bcf86cd799439011';
const OTHER_USER   = '507f1f77bcf86cd799439099';
const TOKEN        = 'abc123';

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(authContext?: any): FastifyInstance {
  const authModule = require('../../../middleware/auth');
  (authModule.createUnifiedAuthMiddleware as jest.Mock).mockImplementation(() =>
    async (req: any) => {
      req.authContext = authContext ?? {
        type: 'registered',
        registeredUser: { id: USER_ID, role: 'USER' },
        userId: USER_ID,
        hasFullAccess: true,
      };
    }
  );

  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', {});
  app.register(registerCreationRoutes);
  return app;
}

function makeTrackingLink(overrides: any = {}) {
  return {
    id: 'tl-1',
    token: TOKEN,
    originalUrl: 'https://example.com',
    isActive: true,
    clickCount: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    expiresAt: null,
    createdBy: USER_ID,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PATCH /tracking-links/:token/deactivate
// ---------------------------------------------------------------------------

describe('PATCH /tracking-links/:token/deactivate', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: USER_ID }));
    mockDeactivate.mockResolvedValue(makeTrackingLink({ isActive: false }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when link is deactivated by creator', async () => {
    await app.ready();
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}/deactivate` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Lien désactivé avec succès');
  });

  it('calls deactivateTrackingLink with the token', async () => {
    await app.ready();
    await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}/deactivate` });
    expect(mockDeactivate).toHaveBeenCalledWith(TOKEN);
  });

  it('returns 403 when user is anonymous', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: { id: 'anon' }, userId: 'anon' });
    await anonApp.ready();
    const res = await anonApp.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}/deactivate` });
    await anonApp.close();
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when tracking link not found', async () => {
    mockGetByToken.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}/deactivate` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: OTHER_USER }));
    await app.ready();
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}/deactivate` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 when link has no creator (public link)', async () => {
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: null }));
    await app.ready();
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}/deactivate` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on service error', async () => {
    mockDeactivate.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'PATCH', url: `/tracking-links/${TOKEN}/deactivate` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /tracking-links/:token
// ---------------------------------------------------------------------------

describe('DELETE /tracking-links/:token', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: USER_ID }));
    mockDeleteLink.mockResolvedValue(undefined);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with success message on deletion', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Lien supprimé avec succès');
  });

  it('calls deleteTrackingLink with the token', async () => {
    await app.ready();
    await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(mockDeleteLink).toHaveBeenCalledWith(TOKEN);
  });

  it('returns 403 when user is anonymous', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: { id: 'anon' }, userId: 'anon' });
    await anonApp.ready();
    const res = await anonApp.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    await anonApp.close();
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when tracking link not found', async () => {
    mockGetByToken.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: OTHER_USER }));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 when link has no creator (public link)', async () => {
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: null }));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 500 on service error', async () => {
    mockDeleteLink.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: `/tracking-links/${TOKEN}` });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /tracking-links/:token (update)
// ---------------------------------------------------------------------------

describe('PATCH /tracking-links/:token', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: USER_ID }));
    mockUpdateLink.mockResolvedValue(makeTrackingLink({ originalUrl: 'https://new-url.com' }));
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful update', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { originalUrl: 'https://new-url.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Lien mis à jour avec succès');
  });

  it('returns 403 when user is anonymous', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: { id: 'anon' }, userId: 'anon' });
    await anonApp.ready();
    const res = await anonApp.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { isActive: false },
    });
    await anonApp.close();
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when tracking link not found', async () => {
    mockGetByToken.mockResolvedValue(null);
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: OTHER_USER }));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when newToken is short and user is not privileged', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { newToken: 'ab' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('allows short token for privileged user', async () => {
    const privilegedApp = buildApp({
      type: 'registered',
      registeredUser: { id: USER_ID, role: 'ADMIN' },
      userId: USER_ID,
      hasFullAccess: true,
    });
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: USER_ID }));
    await privilegedApp.ready();
    const res = await privilegedApp.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { newToken: 'ab' },
    });
    await privilegedApp.close();
    expect(res.statusCode).toBe(200);
  });

  it('returns 400 for invalid URL', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { originalUrl: 'not-a-valid-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when token already exists (service throws)', async () => {
    mockUpdateLink.mockRejectedValue(new Error('Token already exists'));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { newToken: 'newtok123' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 404 when service throws not found error', async () => {
    mockUpdateLink.mockRejectedValue(new Error('Tracking link not found'));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on unexpected service error', async () => {
    mockUpdateLink.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({
      method: 'PATCH', url: `/tracking-links/${TOKEN}`,
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/check-token/:token
// ---------------------------------------------------------------------------

describe('GET /tracking-links/check-token/:token', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockIsTokenAvailable.mockResolvedValue(true);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with available: true when token is free', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/tracking-links/check-token/${TOKEN}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(true);
    expect(body.data.token).toBe(TOKEN);
  });

  it('returns 200 with available: false when token is taken', async () => {
    mockIsTokenAvailable.mockResolvedValue(false);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/tracking-links/check-token/${TOKEN}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.available).toBe(false);
  });

  it('returns 403 when user is anonymous', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: { id: 'anon' }, userId: 'anon' });
    await anonApp.ready();
    const res = await anonApp.inject({ method: 'GET', url: `/tracking-links/check-token/${TOKEN}` });
    await anonApp.close();
    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    mockIsTokenAvailable.mockRejectedValue(new Error('DB error'));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: `/tracking-links/check-token/${TOKEN}` });
    expect(res.statusCode).toBe(500);
  });
});
