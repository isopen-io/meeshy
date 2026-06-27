/**
 * tracking-links-creation-routes.test.ts
 *
 * Unit tests for src/routes/tracking-links/creation.ts
 * Covers: POST /tracking-links, GET /tracking-links/:token,
 *         GET /tracking-links/:token/resolve,
 *         GET /tracking-links/user/me,
 *         GET /tracking-links/conversation/:conversationId
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
    createTrackingLinkSchema: z.object({
      originalUrl: z.string(),
      name: z.string().optional(),
      campaign: z.string().optional(),
      source: z.string().optional(),
      medium: z.string().optional(),
      conversationId: z.string().optional(),
      messageId: z.string().optional(),
      expiresAt: z.string().optional(),
      customToken: z.string().optional(),
    }),
    enrichTrackingLink: (...args: any[]) => mockEnrichTrackingLink(...args),
    recordClickSchema: z.object({}),
    getStatsSchema: z.object({}),
  };
});

const mockFindExisting       = jest.fn<any>();
const mockCreateLink         = jest.fn<any>();
const mockGetByToken         = jest.fn<any>();
const mockResolveTarget      = jest.fn<any>();
const mockGetConvLinks       = jest.fn<any>();
const mockDeactivate         = jest.fn<any>();
const mockDeleteLink         = jest.fn<any>();

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    findExistingTrackingLink: (...args: any[]) => mockFindExisting(...args),
    createTrackingLink:       (...args: any[]) => mockCreateLink(...args),
    getTrackingLinkByToken:   (...args: any[]) => mockGetByToken(...args),
    resolveTarget:            (...args: any[]) => mockResolveTarget(...args),
    getConversationTrackingLinks: (...args: any[]) => mockGetConvLinks(...args),
    deactivateTrackingLink:   (...args: any[]) => mockDeactivate(...args),
    deleteTrackingLink:       (...args: any[]) => mockDeleteLink(...args),
    buildTrackingUrl:         (token: string) => `https://test.meeshy.com/l/${token}`,
  })),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerCreationRoutes } from '../../../routes/tracking-links/creation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = '507f1f77bcf86cd799439011';
const TOKEN   = 'abc123';
const CONV_ID = '507f1f77bcf86cd799439012';

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockTrackingLink = {
  count:    jest.fn<any>(),
  findMany: jest.fn<any>(),
};
const mockParticipant = {
  findFirst: jest.fn<any>(),
};

const mockPrisma: any = {
  trackingLink: mockTrackingLink,
  participant:  mockParticipant,
};

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
  app.decorate('prisma', mockPrisma);
  app.register(registerCreationRoutes);
  return app;
}

function makeTrackingLink(overrides: any = {}) {
  return {
    id: 'tl-1',
    token: TOKEN,
    originalUrl: 'https://example.com',
    name: null,
    isActive: true,
    currentClicks: 0,
    createdBy: USER_ID,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /tracking-links
// ---------------------------------------------------------------------------

describe('POST /tracking-links', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnrichTrackingLink.mockImplementation((link: any) => ({
      ...link,
      fullUrl: `https://test.meeshy.com/l/${link?.token ?? TOKEN}`,
    }));
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 when new tracking link created', async () => {
    await app.ready();
    mockFindExisting.mockResolvedValue(null);
    mockCreateLink.mockResolvedValue(makeTrackingLink());

    const res = await app.inject({
      method: 'POST',
      url: '/tracking-links',
      payload: { originalUrl: 'https://example.com/page' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.trackingLink).toBeDefined();
    expect(mockCreateLink).toHaveBeenCalled();
  });

  it('returns 200 with existed: true when link already exists', async () => {
    await app.ready();
    const existing = makeTrackingLink({ token: 'existing' });
    mockFindExisting.mockResolvedValue(existing);

    const res = await app.inject({
      method: 'POST',
      url: '/tracking-links',
      payload: { originalUrl: 'https://example.com/page' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.existed).toBe(true);
    expect(mockCreateLink).not.toHaveBeenCalled();
  });

  it('returns 409 when custom token already exists', async () => {
    await app.ready();
    mockFindExisting.mockResolvedValue(null);
    mockCreateLink.mockRejectedValue(new Error('Token already exists'));

    const res = await app.inject({
      method: 'POST',
      url: '/tracking-links',
      payload: { originalUrl: 'https://example.com/page', customToken: 'mytoken' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 201 for anonymous user (no createdBy)', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();
    mockFindExisting.mockResolvedValue(null);
    mockCreateLink.mockResolvedValue(makeTrackingLink({ createdBy: null }));

    const res = await anonApp.inject({
      method: 'POST',
      url: '/tracking-links',
      payload: { originalUrl: 'https://example.com' },
    });
    await anonApp.close();

    expect(res.statusCode).toBe(201);
    expect(mockCreateLink).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: undefined })
    );
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockFindExisting.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/tracking-links',
      payload: { originalUrl: 'https://example.com' },
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/:token
// ---------------------------------------------------------------------------

describe('GET /tracking-links/:token', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 for creator viewing their own link', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: USER_ID }));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.trackingLink).toBeDefined();
  });

  it('returns 200 for link with no createdBy (public link)', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: null }));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}`,
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 404 when token not found', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not the creator', async () => {
    await app.ready();
    mockGetByToken.mockResolvedValue(makeTrackingLink({ createdBy: 'other-user' }));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}`,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockGetByToken.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}`,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/:token/resolve
// ---------------------------------------------------------------------------

describe('GET /tracking-links/:token/resolve', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with resolved target', async () => {
    await app.ready();
    const resolvedTarget = {
      kind: 'tracking',
      targetType: 'url',
      targetId: null,
      originalUrl: 'https://example.com',
      isActive: true,
      expiresAt: null,
    };
    mockResolveTarget.mockResolvedValue(resolvedTarget);

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/resolve`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.kind).toBe('tracking');
    expect(body.data.isActive).toBe(true);
  });

  it('returns 404 when token not found', async () => {
    await app.ready();
    mockResolveTarget.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/resolve`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockResolveTarget.mockRejectedValue(new Error('Service error'));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/${TOKEN}/resolve`,
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/user/me
// ---------------------------------------------------------------------------

describe('GET /tracking-links/user/me', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with user tracking links', async () => {
    await app.ready();
    const links = [makeTrackingLink(), makeTrackingLink({ token: 'def456' })];
    mockTrackingLink.count.mockResolvedValue(2);
    mockTrackingLink.findMany.mockResolvedValue(links);

    const res = await app.inject({
      method: 'GET',
      url: '/tracking-links/user/me',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.trackingLinks).toHaveLength(2);
    expect(body.pagination.total).toBe(2);
  });

  it('returns 200 with empty list', async () => {
    await app.ready();
    mockTrackingLink.count.mockResolvedValue(0);
    mockTrackingLink.findMany.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/tracking-links/user/me',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.trackingLinks).toHaveLength(0);
  });

  it('returns 403 when user is not registered', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'GET',
      url: '/tracking-links/user/me',
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockTrackingLink.count.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: '/tracking-links/user/me',
    });

    expect(res.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /tracking-links/conversation/:conversationId
// ---------------------------------------------------------------------------

describe('GET /tracking-links/conversation/:conversationId', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with conversation tracking links for member', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue({ id: 'part-1', userId: USER_ID });
    mockGetConvLinks.mockResolvedValue([makeTrackingLink()]);

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/conversation/${CONV_ID}`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.trackingLinks).toHaveLength(1);
  });

  it('returns 403 when user is not a member', async () => {
    await app.ready();
    mockParticipant.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/conversation/${CONV_ID}`,
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when user is not registered', async () => {
    const anonApp = buildApp({ type: 'anonymous', anonymousUser: {}, userId: 'anon-1', hasFullAccess: false });
    await anonApp.ready();

    const res = await anonApp.inject({
      method: 'GET',
      url: `/tracking-links/conversation/${CONV_ID}`,
    });
    await anonApp.close();

    expect(res.statusCode).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    await app.ready();
    mockParticipant.findFirst.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'GET',
      url: `/tracking-links/conversation/${CONV_ID}`,
    });

    expect(res.statusCode).toBe(500);
  });
});
